import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { safeFetch } from "./safety.js"
import { resolveConfig } from "./defaults.js"

const execFileAsync = promisify(execFile)
const DEFAULT_LIMIT = 8
const RETRY_DELAY_MS = 2500

function toLimit(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 50) : fallback
}

/** Map one SearxNG result to the opencode `{ url, title, content, time }` contract. */
export function mapResult(raw) {
  const out = { url: raw.url, title: raw.title || raw.url }
  if (raw.content) out.content = raw.content
  const published = raw.publishedDate ? Date.parse(raw.publishedDate) : NaN
  out.time = Number.isFinite(published) ? { published } : {}
  return out
}

/** Bash that keeps the WSL VM alive and (re)starts the container. */
function startBash(cfg) {
  return `setsid nohup sleep 1000000 >/dev/null 2>&1 </dev/null & docker start ${cfg.searxContainer}`
}

/** Human-readable one-liner shown in error messages. */
export function startCommand(cfg) {
  return `wsl -d ${cfg.wslDistro} -e bash -lc "${startBash(cfg)}"`
}

async function tryStartInstance(cfg) {
  if (process.platform !== "win32") return false
  try {
    await execFileAsync("wsl", ["-d", cfg.wslDistro, "-e", "bash", "-lc", startBash(cfg)], {
      timeout: 60000,
      windowsHide: true,
    })
    return true
  } catch {
    return false
  }
}

function reachError(base, cfg, cause) {
  return new Error(
    `Cannot reach SearxNG at ${base}. The local instance may be stopped — start it with:\n` +
      `  ${startCommand(cfg)}\n` +
      `(original error: ${cause?.message || cause})`,
  )
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

export async function search(query, options = {}) {
  const cfg = resolveConfig(options)
  const base = String(cfg.searxUrl || "").replace(/\/+$/, "")
  if (!base) {
    throw new Error("SearxNG instance not configured (set searxUrl in scraper.config.json or SEARX_URL)")
  }

  const params = new URLSearchParams({ q: query, format: "json" })
  const language = options.language || cfg.searchLanguage
  if (language) params.set("language", language)
  if (options.timeRange) params.set("time_range", options.timeRange)
  if (options.categories) params.set("categories", options.categories)
  if (options.pageno) params.set("pageno", String(options.pageno))

  const url = `${base}/search?${params.toString()}`
  const allowPrivate = cfg.allowPrivateSearch !== false
  const fetchOnce = () => safeFetch(url, { timeout: 20000, allowPrivate, headers: { Accept: "application/json" } })

  let resp
  try {
    resp = await fetchOnce()
  } catch (err) {
    // Connection failed: the WSL VM or the container is probably down. Try to start it once.
    if (cfg.autoStart !== true || !(await tryStartInstance(cfg))) throw reachError(base, cfg, err)
    await delay(RETRY_DELAY_MS)
    try {
      resp = await fetchOnce()
    } catch (err2) {
      throw reachError(base, cfg, err2)
    }
  }

  if (resp.status === 403) {
    throw new Error('SearxNG returned 403 — enable "json" under search.formats in settings.yml')
  }
  if (resp.status === 429) throw new Error("SearxNG rate limited (HTTP 429)")
  if (!resp.ok) throw new Error(`SearxNG request failed (HTTP ${resp.status})`)

  let body
  try {
    body = await resp.json()
  } catch {
    throw new Error("SearxNG returned a non-JSON response (is format=json enabled?)")
  }

  const limit = toLimit(options.limit, DEFAULT_LIMIT)
  const results = Array.isArray(body.results) ? body.results.slice(0, limit).map(mapResult) : []
  const unresponsive = Array.isArray(body.unresponsive_engines)
    ? body.unresponsive_engines.map((e) => (Array.isArray(e) ? e[0] : e))
    : []

  const out = { query, results }
  if (results.length === 0 && unresponsive.length > 0) out.unresponsive_engines = unresponsive
  return out
}
