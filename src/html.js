export function extractElement(html, tag, idPattern) {
  const re = new RegExp(
    `<${tag}[^>]*\\bid\\s*=\\s*["']${idPattern}[^"']*["'][^>]*>`, "i"
  )
  const startMatch = re.exec(html)
  if (!startMatch) return null

  const start = startMatch.index + startMatch[0].length
  let depth = 1
  const tagRe = new RegExp(`</?${tag}\\b[^>]*>`, "gi")
  tagRe.lastIndex = start
  let m
  while ((m = tagRe.exec(html)) !== null) {
    if (m[0].startsWith("</")) { if (--depth === 0) return html.slice(start, m.index) }
    else depth++
  }
  return null
}

const CONTENT_SELECTORS = [
  (h) => extractElement(h, "div", "mw-content-text"),
  (h) => extractElement(h, "div", "bodyContent"),
  (h) => extractElement(h, "div", "readme"),
  (h) => extractElement(h, "div", "markdown-body"),
  (h) => extractElement(h, "div", "content"),
  (h) => extractElement(h, "div", "main-content"),
  (h) => extractElement(h, "article"),
  (h) => extractElement(h, "main"),
]

export function extractMainContent(html) {
  for (const fn of CONTENT_SELECTORS) {
    const r = fn(html)
    if (r && r.length > 200) return r
  }
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)
  return body ? body[1] : html
}

const NOISE = [
  /<script[^>]*>[\s\S]*?<\/script>/gi,
  /<style[^>]*>[\s\S]*?<\/style>/gi,
  /<noscript[^>]*>[\s\S]*?<\/noscript>/gi,
  /<svg[^>]*>[\s\S]*?<\/svg>/gi,
  /<nav[^>]*>[\s\S]*?<\/nav>/gi,
  /<footer[^>]*>[\s\S]*?<\/footer>/gi,
  /<header[^>]*>[\s\S]*?<\/header>/gi,
  /<aside[^>]*>[\s\S]*?<\/aside>/gi,
]

export function stripNoise(html) {
  for (const re of NOISE) html = html.replace(re, "")
  return html
}

export function hasVisibleContent(html) {
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)
  if (!body) return false
  const text = body[1]
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[^;]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return text.length > 200
}

export function needsJsRendering(html, bodySize) {
  if (bodySize < 500) return true
  if (hasVisibleContent(html)) return false
  return /<noscript>[^<]*<[^>]*>enable JavaScript/i.test(html)
}

export function extractMetadata(html) {
  const getMeta = (name) => {
    const re1 = new RegExp(
      `<meta\\s[^>]*(?:name|property)\\s*=\\s*"${name}"[^>]*content\\s*=\\s*"([^"]*)"`, "i"
    )
    const re2 = new RegExp(
      `<meta\\s[^>]*content\\s*=\\s*"([^"]*)"[^>]*(?:name|property)\\s*=\\s*"${name}"`, "i"
    )
    const m = html.match(re1) || html.match(re2)
    return m ? m[1] : null
  }

  const titles = [...html.matchAll(/<title>([^<]*)<\/title>/gi)]
  const titleText = titles.length > 0 ? titles[titles.length - 1][1] : null

  const headings = []
  for (const level of [1, 2, 3, 4, 5, 6]) {
    const re = new RegExp(`<h${level}[^>]*>([^<]*)</h${level}>`, "gi")
    let m
    while ((m = re.exec(html)) !== null) {
      headings.push({ level, text: m[1].trim() })
    }
  }

  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  const wordCount = text.split(/\s+/).filter(Boolean).length

  return {
    title: titleText,
    description: getMeta("description"),
    og_title: getMeta("og:title"),
    og_description: getMeta("og:description"),
    og_image: getMeta("og:image"),
    headings,
    word_count: wordCount,
  }
}

export function extractLinks(html, baseUrl) {
  const links = []
  const re = /<a\s[^>]*href\s*=\s*"([^"]*)"/gi
  let m
  while ((m = re.exec(html)) !== null) {
    const href = m[1].trim()
    if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:")) continue
    const textM = m[0].match(/>([^<]*)<\/a>/i)
    const text = textM ? textM[1].trim() : ""
    try { links.push({ url: new URL(href, baseUrl).href, text }) } catch {}
  }
  return links
}

export function extractImages(html, baseUrl) {
  const images = []
  const re = /<img\s[^>]*src\s*=\s*"([^"]*)"/gi
  let m
  while ((m = re.exec(html)) !== null) {
    const src = m[1].trim()
    const altM = m[0].match(/alt\s*=\s*"([^"]*)"/i)
    try { images.push({ url: new URL(src, baseUrl).href, alt: altM ? altM[1] : "" }) } catch {}
  }
  return images
}
