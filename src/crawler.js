import { scrape } from "./scraper.js"

function getHostname(url) {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

function normalizeUrl(url) {
  try {
    const u = new URL(url)
    u.hash = ""
    return u.href.replace(/\/$/, "")
  } catch {
    return null
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

export async function crawl(seedUrl, options = {}) {
  const {
    depth = 2,
    maxPages = 50,
    concurrent = 5,
    rateLimit = 500,
    stayOnDomain = true,
    format = "json",
    contentOnly = true,
    useEdgeCookies = true,
  } = options

  const start = Date.now()
  const visited = new Set()
  const queue = [{ url: normalizeUrl(seedUrl), depth: 0 }]
  const results = []
  const errors = []
  const seedHost = stayOnDomain ? getHostname(seedUrl) : null

  let active = 0

  async function worker() {
    while (queue.length > 0 && visited.size < maxPages) {
      const item = queue.shift()
      if (!item) break

      const normalized = normalizeUrl(item.url)
      if (!normalized || visited.has(normalized)) continue
      if (stayOnDomain && seedHost && getHostname(normalized) !== seedHost) continue

      visited.add(normalized)

      if (item.depth > depth) continue
      if (visited.size > maxPages) break

      active++
      try {
        await sleep(rateLimit)
        const result = await scrape(normalized, { format: "json", contentOnly, useEdgeCookies })
        if (result.error) {
          errors.push({ url: normalized, error: result.error })
        } else {
          results.push({
            url: normalized,
            depth: item.depth,
            status_code: result.status_code,
            metadata: result.metadata,
            markdown: result.markdown,
            links_found: result.links?.length || 0,
          })

          if (item.depth < depth && result.links) {
            for (const link of result.links) {
              const linkUrl = normalizeUrl(link.url)
              if (linkUrl && !visited.has(linkUrl)) {
                queue.push({ url: linkUrl, depth: item.depth + 1 })
              }
            }
          }
        }
      } catch (err) {
        errors.push({ url: normalized, error: err.message })
      }
      active--
    }
  }

  const workers = Math.min(concurrent, maxPages)
  const pool = []
  for (let i = 0; i < workers; i++) {
    pool.push(worker())
  }
  await Promise.all(pool)

  return {
    pages: results,
    total_pages: results.length,
    errors,
    started_at: new Date(start).toISOString(),
    duration_ms: Date.now() - start,
  }
}
