import { Plugin } from "@opencode/plugin"
import { scrape } from "./scraper.js"
import { crawl } from "./crawler.js"
import { map } from "./mapper.js"
import { citations } from "./citations.js"
import { download } from "./downloader.js"
import { search } from "./search.js"

function fmt(r) {
  if (r.error) return `Error: ${r.error}`

  const lines = []
  if (r.status_code) lines.push(`Status: ${r.status_code}`)
  if (r.metadata?.title) lines.push(`Title: ${r.metadata.title}`)
  if (r.content_extracted) lines.push(`Content extracted: yes`)
  if (r.browser_used) lines.push(`JS Render: yes`)
  if (r.links?.length > 0) lines.push(`Links: ${r.links.length}`)
  if (r.images?.length > 0) lines.push(`Images: ${r.images.length}`)
  if (r.duration_ms) lines.push(`Duration: ${r.duration_ms}ms`)

  if (r.markdown) {
    lines.push("")
    lines.push(r.markdown.slice(0, 50000))
  }

  return lines.join("\n")
}

const searchTool = {
  name: "search",
  description: `Search the web through a self-hosted SearxNG instance and return ranked results (title, url, snippet). Use this to discover URLs you do not know yet, then use scrape to read a specific page.

The instance runs locally (WSL); it is started automatically if stopped, so just call this tool — no manual setup needed.

The current year is ${new Date().getFullYear()}. Use this year when searching for recent information or current events.`,
  input: {
    type: "object",
    properties: {
      query: { type: "string", description: "The search query" },
      limit: { type: "number", default: 8, description: "Maximum number of results" },
      language: { type: "string", description: "Language code for results, e.g. zh-CN or en (optional)" },
      timeRange: {
        type: "string",
        enum: ["day", "month", "year"],
        description: "Restrict results to a recent time range (optional)",
      },
      categories: { type: "string", description: "Comma-separated SearxNG categories (default: general)" },
    },
    required: ["query"],
    additionalProperties: false,
  },
  async execute(args) {
    const r = await search(args.query, {
      limit: args.limit ?? 8,
      language: args.language,
      timeRange: args.timeRange,
      categories: args.categories,
    })
    if (r.results.length === 0) {
      const extra = r.unresponsive_engines?.length ? `\nUnresponsive engines: ${r.unresponsive_engines.join(", ")}` : ""
      return { content: `No search results found. Please try a different query.${extra}` }
    }
    const content = r.results
      .map((x) => {
        const published = x.time?.published ? `\nPublished: ${new Date(x.time.published).toISOString()}` : ""
        return `## [${x.title}](${x.url})${published}${x.content ? `\n\n${x.content}` : ""}`
      })
      .join("\n\n")
    return { content }
  },
}

const scrapeTool = {
  name: "scrape",
  description:
    "Fetch a single URL and convert to Markdown. Automatically extracts the main content area (strips nav/sidebar/footer) and adds YAML frontmatter. Supports JS-rendered pages via Edge/Chrome headless. Can use browser cookies to bypass anti-bot measures.",
  input: {
    type: "object",
    properties: {
      url: { type: "string", description: "The URL to scrape" },
      mode: {
        type: "string",
        enum: ["auto", "js", "fetch"],
        default: "auto",
        description: "Render mode: auto (detect JS SPA), js (force headless), fetch (HTTP only)",
      },
      format: {
        type: "string",
        enum: ["markdown", "json"],
        default: "markdown",
        description: "Output format: markdown or json",
      },
      contentOnly: {
        type: "boolean",
        default: true,
        description: "Extract main content area (strip nav/sidebar/footer)",
      },
      userAgent: { type: "string", description: "Custom User-Agent header" },
      timeout: { type: "number", default: 30000, description: "Request timeout in milliseconds" },
      useEdgeCookies: {
        type: "boolean",
        default: true,
        description:
          "Use Edge/Chrome browser cookies for JS rendering (enables profile-based rendering to bypass anti-bot)",
      },
    },
    required: ["url"],
    additionalProperties: false,
  },
  async execute(args) {
    const result = await scrape(args.url, {
      format: args.format ?? "markdown",
      mode: args.mode ?? "auto",
      contentOnly: args.contentOnly ?? true,
      userAgent: args.userAgent,
      timeout: args.timeout ?? 30000,
      useEdgeCookies: args.useEdgeCookies ?? true,
    })
    return { content: (args.format ?? "markdown") === "json" ? JSON.stringify(result, null, 2) : fmt(result) }
  },
}

const crawlTool = {
  name: "crawl",
  description:
    "Recursively crawl a website. Follows same-domain links up to the specified depth. Returns a list of crawled pages. Can use browser cookies to bypass anti-bot measures.",
  input: {
    type: "object",
    properties: {
      url: { type: "string", description: "The seed URL to start crawling from" },
      depth: { type: "number", default: 2, description: "Maximum crawl depth (0 = seed page only)" },
      maxPages: { type: "number", default: 50, description: "Maximum pages to crawl" },
      concurrent: { type: "number", default: 5, description: "Number of concurrent requests" },
      stayOnDomain: { type: "boolean", default: true, description: "Stay on the same domain" },
      contentOnly: { type: "boolean", default: true, description: "Extract main content area per page" },
      useEdgeCookies: {
        type: "boolean",
        default: true,
        description: "Use Edge/Chrome browser cookies for JS rendering",
      },
    },
    required: ["url"],
    additionalProperties: false,
  },
  async execute(args) {
    const result = await crawl(args.url, {
      depth: args.depth ?? 2,
      maxPages: args.maxPages ?? 50,
      concurrent: args.concurrent ?? 5,
      stayOnDomain: args.stayOnDomain ?? true,
      contentOnly: args.contentOnly ?? true,
      useEdgeCookies: args.useEdgeCookies ?? true,
    })

    const lines = [`Crawled ${result.total_pages} pages in ${result.duration_ms}ms`]
    if (result.errors.length > 0) lines.push(`Errors: ${result.errors.length}`)
    if (result.blocked?.length > 0) lines.push(`Blocked by robots.txt: ${result.blocked.length}`)
    lines.push("")
    for (const page of result.pages) {
      const title = page.metadata?.title || "untitled"
      lines.push(`  [d=${page.depth}] ${page.url}`)
      lines.push(`          ${title}`)
    }
    return { content: lines.join("\n") }
  },
}

const mapUrlsTool = {
  name: "mapUrls",
  description:
    "Discover URLs on a website via sitemap.xml and link extraction. Returns the full list of discovered URLs with their source.",
  input: {
    type: "object",
    properties: {
      url: { type: "string", description: "The URL to map" },
      limit: { type: "number", default: 100, description: "Maximum URLs to return" },
      filter: { type: "string", description: "Optional substring filter for URLs" },
    },
    required: ["url"],
    additionalProperties: false,
  },
  async execute(args) {
    const result = await map(args.url, { limit: args.limit ?? 100, filter: args.filter })
    const lines = [`Found ${result.total} URLs`, `Sitemap found: ${result.sitemap_found}`, ""]
    for (const entry of result.urls) {
      lines.push(`  [${entry.source}] ${entry.url}`)
    }
    return { content: lines.join("\n") }
  },
}

const citationsTool = {
  name: "citations",
  description:
    "Convert Markdown links into numbered citations. Useful for creating clean reference lists from linked content.",
  input: {
    type: "object",
    properties: {
      input: { type: "string", description: "Markdown text containing [text](url) links" },
    },
    required: ["input"],
    additionalProperties: false,
  },
  async execute(args) {
    const result = citations(args.input)
    const lines = [result.content, ""]
    if (result.references.length > 0) {
      lines.push("---", "References:")
      for (const ref of result.references) {
        lines.push(`  [${ref.index}] ${ref.url}`)
      }
    }
    return { content: lines.join("\n") }
  },
}

const downloadTool = {
  name: "download",
  description:
    "Download a file from a URL and save it to local disk. Supports PDFs, images, archives, and any binary or text file. Automatically detects filename from Content-Disposition header or URL.",
  input: {
    type: "object",
    properties: {
      url: { type: "string", description: "The URL of the file to download" },
      outputDir: { type: "string", description: "Directory to save the file (default: ~/Downloads)" },
      filename: {
        type: "string",
        description: "Custom filename (default: auto-detected from URL or Content-Disposition)",
      },
      timeout: { type: "number", default: 60000, description: "Download timeout in milliseconds" },
    },
    required: ["url"],
    additionalProperties: false,
  },
  async execute(args) {
    const result = await download(args.url, {
      outputDir: args.outputDir,
      filename: args.filename,
      timeout: args.timeout ?? 60000,
    })
    if (result.error) return { content: `Error: ${result.error}` }
    const lines = [
      `Downloaded: ${result.filename}`,
      `  Path: ${result.path}`,
      `  Size: ${result.size_human}`,
      `  Type: ${result.content_type}`,
      `  Duration: ${result.duration_ms}ms`,
    ]
    return { content: lines.join("\n") }
  },
}

export default Plugin.define({
  id: "light-web-tools",
  async setup(ctx) {
    await ctx.tool.transform((editor) => {
      editor.add(searchTool)
      editor.add(scrapeTool)
      editor.add(crawlTool)
      editor.add(mapUrlsTool)
      editor.add(citationsTool)
      editor.add(downloadTool)
    })
  },
})
