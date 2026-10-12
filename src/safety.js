import net from "node:net"
import dns from "node:dns/promises"

export const DEFAULT_UA = "opencode-light-web-tools"
const DNS_TTL = 5 * 60 * 1000
const ROBOTS_TTL = 60 * 60 * 1000
const MAX_REDIRECTS = 5

const dnsCache = new Map()
const robotsCache = new Map()

// ---------------------------------------------------------------- SSRF guard

function ipv4ToInt(ip) {
  const p = ip.split(".").map(Number)
  return ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0
}

const BLOCKED_V4 = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
]

function isBlockedV4(ip) {
  const n = ipv4ToInt(ip)
  return BLOCKED_V4.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
    return (n & mask) === (ipv4ToInt(base) & mask)
  })
}

function expandIPv6(ip) {
  let addr = ip.split("%")[0]
  if (addr.includes(".")) {
    const cut = addr.lastIndexOf(":")
    const v4 = addr.slice(cut + 1).split(".").map(Number)
    addr = addr.slice(0, cut + 1) + (((v4[0] << 8) | v4[1]).toString(16)) + ":" + (((v4[2] << 8) | v4[3]).toString(16))
  }
  const [head, tail] = addr.split("::")
  const h = head ? head.split(":") : []
  const t = tail ? tail.split(":") : []
  const fill = new Array(Math.max(0, 8 - h.length - t.length)).fill("0")
  return [...h, ...fill, ...t].map((g) => parseInt(g || "0", 16))
}

function isBlockedV6(ip) {
  const g = expandIPv6(ip)
  const allZero = g.every((x) => x === 0)
  if (allZero) return true // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true // ::1
  if ((g[0] & 0xfe00) === 0xfc00) return true // fc00::/7 ULA
  if ((g[0] & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  if ((g[0] & 0xff00) === 0xff00) return true // ff00::/8 multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true // 2001:db8::/32 doc
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    const v4 = `${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`
    return isBlockedV4(v4)
  }
  return false
}

export function isBlockedIp(ip) {
  const kind = net.isIP(ip)
  if (kind === 4) return isBlockedV4(ip)
  if (kind === 6) return isBlockedV6(ip)
  return false
}

const BLOCKED_HOST_SUFFIX = [".localhost", ".local", ".internal", ".home.arpa"]

export async function assertPublicUrl(rawUrl, options = {}) {
  let u
  try {
    u = new URL(rawUrl)
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`)
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`Blocked URL scheme "${u.protocol}" (only http/https allowed)`)
  }
  // Opt out for a trusted caller (the configured SearxNG instance) or the global env switch.
  if (options.allowPrivate || process.env.OC_ALLOW_PRIVATE === "1") return u

  const host = u.hostname.replace(/^\[|\]$/g, "")
  if (net.isIP(host)) {
    if (isBlockedIp(host)) throw new Error(`Blocked private/loopback address: ${host}`)
    return u
  }
  const lower = host.toLowerCase()
  if (lower === "localhost" || BLOCKED_HOST_SUFFIX.some((s) => lower.endsWith(s))) {
    throw new Error(`Blocked internal host: ${host}`)
  }

  const cached = dnsCache.get(lower)
  let addrs
  if (cached && Date.now() - cached.at < DNS_TTL) {
    addrs = cached.addrs
  } else {
    addrs = await dns.lookup(lower, { all: true })
    dnsCache.set(lower, { at: Date.now(), addrs })
  }
  for (const a of addrs) {
    if (isBlockedIp(a.address)) throw new Error(`Blocked: ${host} resolves to private address ${a.address}`)
  }
  return u
}

/** fetch with an SSRF check on every redirect hop (no automatic redirects). */
export async function safeFetch(rawUrl, options = {}) {
  const { headers = {}, timeout, signal, maxRedirects = MAX_REDIRECTS, allowPrivate = false } = options
  let current = rawUrl
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertPublicUrl(current, { allowPrivate })
    const useSignal = signal ?? (timeout ? AbortSignal.timeout(timeout) : undefined)
    const resp = await fetch(current, { headers, redirect: "manual", signal: useSignal })
    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get("location")
      if (loc) {
        current = new URL(loc, current).href
        continue
      }
    }
    return resp
  }
  throw new Error(`Too many redirects (limit ${maxRedirects})`)
}

// ---------------------------------------------------------------- robots.txt

export function pathMatches(pattern, path) {
  if (pattern === "") return false
  let p = pattern
  let anchored = false
  if (p.endsWith("$")) {
    anchored = true
    p = p.slice(0, -1)
  }
  const body = p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")
  return new RegExp("^" + body + (anchored ? "$" : ".*")).test(path)
}

export function parseRobots(text, userAgent) {
  const groups = []
  let current = null
  for (let raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim()
    if (!line) continue
    const idx = line.indexOf(":")
    if (idx === -1) continue
    const field = line.slice(0, idx).trim().toLowerCase()
    const value = line.slice(idx + 1).trim()

    if (field === "user-agent") {
      if (!current || current.done) {
        current = { agents: [], rules: [], crawlDelay: null, done: false }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
    } else if (field === "disallow" || field === "allow") {
      if (!current) continue
      current.rules.push({ allow: field === "allow", pattern: value })
      current.done = true
    } else if (field === "crawl-delay") {
      if (!current) continue
      const n = Number(value)
      if (Number.isFinite(n)) current.crawlDelay = n
      current.done = true
    }
  }

  const ua = userAgent.toLowerCase()
  let best = null
  let bestLen = -1
  let star = null
  for (const g of groups) {
    for (const a of g.agents) {
      if (a === "*") {
        if (!star) star = g
      } else if (ua.startsWith(a) && a.length > bestLen) {
        best = g
        bestLen = a.length
      }
    }
  }
  const chosen = best || star
  return chosen ? { rules: chosen.rules, crawlDelay: chosen.crawlDelay } : null
}

async function getRobots(url, userAgent) {
  const origin = new URL(url).origin
  const cached = robotsCache.get(origin)
  if (cached && Date.now() - cached.at < ROBOTS_TTL) return cached.data

  let data = null
  try {
    const resp = await safeFetch(`${origin}/robots.txt`, { timeout: 10000 })
    if (resp.ok) data = parseRobots(await resp.text(), userAgent)
  } catch {}
  robotsCache.set(origin, { at: Date.now(), data })
  return data
}

export function isPathAllowed(info, path) {
  if (!info) return true
  let best = null
  for (const r of info.rules) {
    if (!pathMatches(r.pattern, path)) continue
    if (!best) {
      best = r
    } else if (r.pattern.length > best.pattern.length) {
      best = r
    } else if (r.pattern.length === best.pattern.length && r.allow && !best.allow) {
      best = r
    }
  }
  return best ? best.allow : true
}

export async function robotsAllowed(url, userAgent = DEFAULT_UA) {
  const info = await getRobots(url, userAgent)
  if (!info) return true
  const u = new URL(url)
  return isPathAllowed(info, u.pathname + u.search)
}

export async function robotsCrawlDelayMs(url, userAgent = DEFAULT_UA) {
  const info = await getRobots(url, userAgent)
  const seconds = info?.crawlDelay
  return seconds && seconds > 0 ? Math.min(seconds * 1000, 30000) : 0
}
