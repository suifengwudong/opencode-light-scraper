import TurndownService from "turndown"
import { findBrowser, renderWithBrowser } from "./browser.js"
import {
  extractMainContent, stripNoise, needsJsRendering,
  extractMetadata, extractLinks, extractImages,
} from "./html.js"

const turndown = new TurndownService({
  headingStyle: "atx", codeBlockStyle: "fenced", emDelimiter: "*",
})

turndown.addRule("codeBlockLang", {
  filter: (node) => node.nodeName === "PRE" && node.firstChild?.nodeName === "CODE",
  replacement: (content, node) => {
    const code = node.firstChild
    const lang = code?.getAttribute?.("class")?.match(/language-(\w+)/)?.[1] || ""
    return `\`\`\`${lang}\n${content}\n\`\`\`\n\n`
  },
})

const DEFAULT_TIMEOUT = 30000
const MAX_BODY = 5 * 1024 * 1024

async function httpFetch(url, timeout, userAgent) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        ...(userAgent ? { "User-Agent": userAgent } : {}),
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    })
    clearTimeout(timer)
    const buf = await resp.arrayBuffer()
    return {
      statusCode: resp.status,
      finalUrl: resp.url,
      contentType: resp.headers.get("content-type") || "",
      html: new TextDecoder("utf-8", { fatal: false }).decode(buf.slice(0, MAX_BODY)),
    }
  } catch (err) {
    clearTimeout(timer)
    throw err
  }
}

async function tryBrowserRendering(finalUrl, timeout, mode, options) {
  const browserPath = findBrowser()
  if (!browserPath) {
    if (mode === "js") return { error: "No browser found (Edge/Chrome required for JS rendering)" }
    return null
  }
  try {
    const html = await renderWithBrowser(browserPath, finalUrl, timeout, options.useEdgeCookies !== false)
    return { html, browserUsed: true }
  } catch (err) {
    if (mode === "js") return { error: `Browser rendering failed: ${err.message}` }
    return null
  }
}

function buildResult(url, statusCode, contentType, html, metadata, links, images,
                     contentExtracted, browserUsed, start, isPdf) {
  const base = {
    url, status_code: statusCode, error: null, duration_ms: Date.now() - start,
  }
  if (isPdf) {
    return { ...base, content_type: contentType, body_size: html.length, is_pdf: true }
  }

  const cleaned = stripNoise(contentExtracted ? extractMainContent(html) : html)
  const markdownBody = turndown.turndown(cleaned)
  const frontmatter = metadata ? buildFrontmatter(metadata) : ""
  const markdown = frontmatter + markdownBody

  return {
    ...base, content_type: contentType, body_size: html.length,
    metadata, links, images,
    markdown, content_extracted: contentExtracted,
    browser_used: browserUsed, is_pdf: false,
  }
}

function buildFrontmatter(meta) {
  const f = []
  if (meta.title) f.push(`title: ${meta.title}`)
  if (meta.description) f.push(`description: ${meta.description}`)
  if (meta.word_count) f.push(`words: ${meta.word_count}`)
  return f.length ? `---\n${f.join("\n")}\n---\n\n` : ""
}

export async function scrape(url, options = {}) {
  const {
    format = "markdown", mode = "auto", timeout = DEFAULT_TIMEOUT,
    userAgent, contentOnly = true,
  } = options

  const start = Date.now()
  let html = ""
  let finalUrl = url
  let statusCode = 0
  let contentType = ""
  let browserUsed = false
  let contentExtracted = false

  if (mode !== "js") {
    try {
      const r = await httpFetch(url, timeout, userAgent)
      statusCode = r.statusCode
      finalUrl = r.finalUrl
      contentType = r.contentType
      html = r.html
    } catch (err) {
      return { url, status_code: 0, error: `Fetch failed: ${err.message}`, duration_ms: Date.now() - start }
    }
  }

  if (mode === "js" || (mode === "auto" && needsJsRendering(html, html.length))) {
    const r = await tryBrowserRendering(finalUrl, timeout, mode, options)
    if (r?.error) return { url, status_code: 0, error: r.error, duration_ms: Date.now() - start }
    if (r) { html = r.html; browserUsed = r.browserUsed }
  }

  if (!html) {
    return { url, status_code: 0, error: "Empty response", duration_ms: Date.now() - start }
  }

  const isPdf = contentType.includes("application/pdf") || html.startsWith("%PDF")
  const metadata = isPdf ? null : extractMetadata(html)
  const links = isPdf ? [] : extractLinks(html, finalUrl)
  const images = isPdf ? [] : extractImages(html, finalUrl)

  if (contentOnly && !isPdf) {
    const main = extractMainContent(html)
    if (main && main.length > 100) contentExtracted = true
  }

  const result = buildResult(finalUrl, statusCode, contentType, html,
    metadata, links, images, contentExtracted, browserUsed, start, isPdf)

  if (format === "json") return result
  return {
    url: result.url, status_code: result.status_code,
    markdown: result.markdown, metadata: result.metadata,
    links: result.links, images: result.images,
    content_extracted: result.content_extracted,
    browser_used: result.browser_used,
    error: result.error, duration_ms: result.duration_ms,
  }
}
