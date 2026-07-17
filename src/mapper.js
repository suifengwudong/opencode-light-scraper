export async function map(url, options = {}) {
  const { limit = 100, filter, timeout = 30000 } = options

  const seen = new Set()
  const urls = []

  function addUrl(u, source) {
    if (seen.has(u)) return
    if (filter && !u.includes(filter)) return
    if (urls.length >= limit) return
    seen.add(u)
    urls.push({ url: u, source })
  }

  const parsed = new URL(url)

  const sitemapUrl = `${parsed.origin}/sitemap.xml`
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    const resp = await fetch(sitemapUrl, { signal: controller.signal })
    clearTimeout(timer)
    if (resp.ok) {
      const xml = await resp.text()
      const locRe = /<loc>([^<]+)<\/loc>/gi
      let m
      while ((m = locRe.exec(xml)) !== null) {
        addUrl(m[1].trim(), "sitemap")
      }
    }
  } catch {
  }

  if (urls.length < limit) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeout)
      const resp = await fetch(url, { signal: controller.signal })
      clearTimeout(timer)
      if (resp.ok) {
        const html = await resp.text()
        const linkRe = /<a\s[^>]*href\s*=\s*"([^"]*)"/gi
        let m
        while ((m = linkRe.exec(html)) !== null) {
          const href = m[1].trim()
          if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:")) continue
          try {
            const fullUrl = new URL(href, url).href
            addUrl(fullUrl, "link_extraction")
          } catch {
          }
        }
      }
    } catch {
    }
  }

  return { urls, total: urls.length, sitemap_found: seen.size > 0 }
}
