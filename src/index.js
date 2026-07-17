import { tool } from "@opencode-ai/plugin"
import { scrape } from "./scraper.js"
import { crawl } from "./crawler.js"
import { map } from "./mapper.js"
import { citations } from "./citations.js"

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

export const LightScraperPlugin = async () => {
  return {
    tool: {
      scrape: tool({
        description: "Fetch a single URL and convert to Markdown. Automatically extracts the main content area (strips nav/sidebar/footer) and adds YAML frontmatter. Supports JS-rendered pages via Edge/Chrome headless. Can use browser cookies to bypass anti-bot measures.",
        args: {
          url: tool.schema.string().describe("The URL to scrape"),
          mode: tool.schema.string().optional().default("auto").describe("Render mode: auto (detect JS SPA), js (force headless), fetch (HTTP only)"),
          format: tool.schema.string().optional().default("markdown").describe("Output format: markdown or json"),
          contentOnly: tool.schema.boolean().optional().default(true).describe("Extract main content area (strip nav/sidebar/footer)"),
          userAgent: tool.schema.string().optional().describe("Custom User-Agent header"),
          timeout: tool.schema.number().optional().default(30000).describe("Request timeout in milliseconds"),
          useEdgeCookies: tool.schema.boolean().optional().default(true).describe("Use Edge/Chrome browser cookies for JS rendering (enables profile-based rendering to bypass anti-bot)"),
        },
        async execute(args) {
          const result = await scrape(args.url, {
            format: args.format,
            mode: args.mode,
            contentOnly: args.contentOnly,
            userAgent: args.userAgent,
            timeout: args.timeout,
            useEdgeCookies: args.useEdgeCookies,
          })
          return args.format === "json" ? JSON.stringify(result, null, 2) : fmt(result)
        },
      }),

      crawl: tool({
        description: "Recursively crawl a website. Follows same-domain links up to the specified depth. Returns a list of crawled pages. Can use browser cookies to bypass anti-bot measures.",
        args: {
          url: tool.schema.string().describe("The seed URL to start crawling from"),
          depth: tool.schema.number().optional().default(2).describe("Maximum crawl depth (0 = seed page only)"),
          maxPages: tool.schema.number().optional().default(50).describe("Maximum pages to crawl"),
          concurrent: tool.schema.number().optional().default(5).describe("Number of concurrent requests"),
          stayOnDomain: tool.schema.boolean().optional().default(true).describe("Stay on the same domain"),
          contentOnly: tool.schema.boolean().optional().default(true).describe("Extract main content area per page"),
          useEdgeCookies: tool.schema.boolean().optional().default(true).describe("Use Edge/Chrome browser cookies for JS rendering"),
        },
        async execute(args) {
          const result = await crawl(args.url, {
            depth: args.depth,
            maxPages: args.maxPages,
            concurrent: args.concurrent,
            stayOnDomain: args.stayOnDomain,
            contentOnly: args.contentOnly,
            useEdgeCookies: args.useEdgeCookies,
          })

          const lines = [`Crawled ${result.total_pages} pages in ${result.duration_ms}ms`]
          if (result.errors.length > 0) lines.push(`Errors: ${result.errors.length}`)
          lines.push("")
          for (const page of result.pages) {
            const title = page.metadata?.title || "untitled"
            lines.push(`  [d=${page.depth}] ${page.url}`)
            lines.push(`          ${title}`)
          }
          return lines.join("\n")
        },
      }),

      mapUrls: tool({
        description: "Discover URLs on a website via sitemap.xml and link extraction. Returns the full list of discovered URLs with their source.",
        args: {
          url: tool.schema.string().describe("The URL to map"),
          limit: tool.schema.number().optional().default(100).describe("Maximum URLs to return"),
          filter: tool.schema.string().optional().describe("Optional substring filter for URLs"),
        },
        async execute(args) {
          const result = await map(args.url, { limit: args.limit, filter: args.filter })
          const lines = [`Found ${result.total} URLs`, `Sitemap found: ${result.sitemap_found}`, ""]
          for (const entry of result.urls) {
            lines.push(`  [${entry.source}] ${entry.url}`)
          }
          return lines.join("\n")
        },
      }),

      citations: tool({
        description: "Convert Markdown links into numbered citations. Useful for creating clean reference lists from linked content.",
        args: {
          input: tool.schema.string().describe("Markdown text containing [text](url) links"),
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
          return lines.join("\n")
        },
      }),
    },
  }
}
