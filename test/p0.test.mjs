import assert from "node:assert/strict"
import http from "node:http"

// The map test uses a localhost server, which the SSRF guard would block by design.
process.env.OC_ALLOW_PRIVATE = "1"
import { extractElement, extractMainContent, extractMetadata } from "../src/html.js"
import { decodeBody } from "../src/scraper.js"
import { map } from "../src/mapper.js"

let passed = 0
function ok(name, fn) {
  try {
    fn()
    passed++
    console.log("  ok  -", name)
  } catch (err) {
    console.error("FAIL  -", name, "\n      ", err.message)
    process.exitCode = 1
  }
}

// 1. extractElement: tag-only mode + id mode
ok("extractElement matches a bare <article>", () => {
  assert.equal(extractElement('<article id="x">hi</article>', "article"), "hi")
})
ok("extractElement matches by id pattern", () => {
  assert.equal(extractElement('<div id="content">hi</div>', "div", "content"), "hi")
})
ok("extractElement ignores non-matching id", () => {
  assert.equal(extractElement('<div id="other">hi</div>', "div", "content"), null)
})

// 2. extractMainContent prefers semantic container and drops nav noise
ok("extractMainContent keeps <main>, excludes <nav>", () => {
  const page = "<html><body><nav>NAVNOISE</nav><main>" + "M".repeat(300) + "</main></body></html>"
  const main = extractMainContent(page)
  assert.ok(main.trim().startsWith("M"), "should return <main> content")
  assert.ok(!main.includes("NAVNOISE"), "should not include nav")
})
ok("extractMainContent falls back to <article>", () => {
  const page = "<body><aside>SIDE</aside><article>" + "A".repeat(300) + "</article></body>"
  const main = extractMainContent(page)
  assert.ok(main.trim().startsWith("A"))
  assert.ok(!main.includes("SIDE"))
})

// 3. title takes the first <title>
ok("extractMetadata picks the first <title>", () => {
  assert.equal(extractMetadata("<title>FIRST</title><title>SECOND</title>").title, "FIRST")
})

// 4. charset decoding
ok("decodeBody decodes GBK (declared as gb2312)", () => {
  const gbk = Buffer.from([0xc4, 0xe3, 0xba, 0xc3]) // 你好
  assert.equal(decodeBody(gbk, "text/html; charset=gb2312"), "你好")
})
ok("decodeBody defaults to utf-8", () => {
  assert.equal(decodeBody(Buffer.from("hello 世界", "utf8"), "text/html"), "hello 世界")
})

// 5. map sitemap_found flag
function serve(handler) {
  return new Promise((resolve) => {
    const srv = http.createServer(handler)
    srv.listen(0, "127.0.0.1", () => resolve(srv))
  })
}

const noSitemap = await serve((req, res) => {
  if (req.url === "/sitemap.xml") {
    res.statusCode = 404
    res.end("not found")
    return
  }
  res.setHeader("content-type", "text/html")
  res.end('<html><body><a href="/a">A</a><a href="/b">B</a></body></html>')
})
const base1 = `http://127.0.0.1:${noSitemap.address().port}/`
const r1 = await map(base1)
ok("map: sitemap_found=false when there is no sitemap", () => {
  assert.equal(r1.sitemap_found, false)
  assert.ok(r1.total >= 2, "should still return links from the page")
})
noSitemap.close()

const withSitemap = await serve((req, res) => {
  if (req.url === "/sitemap.xml") {
    res.setHeader("content-type", "application/xml")
    res.end('<?xml version="1.0"?><urlset><url><loc>https://example.com/x</loc></url></urlset>')
    return
  }
  res.setHeader("content-type", "text/html")
  res.end("<html></html>")
})
const base2 = `http://127.0.0.1:${withSitemap.address().port}/`
const r2 = await map(base2)
ok("map: sitemap_found=true when sitemap.xml exists", () => {
  assert.equal(r2.sitemap_found, true)
  assert.ok(r2.urls.some((u) => u.source === "sitemap"))
})
withSitemap.close()

console.log(`\n${passed} checks passed`)
