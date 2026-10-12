import assert from "node:assert/strict"
import http from "node:http"
import { search, mapResult, startCommand, pollUntil } from "../src/search.js"

let passed = 0
async function ok(name, fn) {
  try {
    await fn()
    passed++
    console.log("  ok  -", name)
  } catch (err) {
    console.error("FAIL  -", name, "\n      ", err.message)
    process.exitCode = 1
  }
}
async function rejects(fn, match) {
  try {
    await fn()
  } catch (err) {
    if (match && !String(err.message).includes(match)) throw new Error(`wrong message: ${err.message}`)
    return
  }
  throw new Error("expected rejection but it resolved")
}

// fake SearxNG
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x")
  const q = url.searchParams.get("q")
  if (q === "forbidden") {
    res.statusCode = 403
    res.end("Forbidden")
    return
  }
  if (q === "ratelimited") {
    res.statusCode = 429
    res.end("slow down")
    return
  }
  if (q === "notjson") {
    res.setHeader("content-type", "text/html")
    res.end("<html>nope</html>")
    return
  }
  res.setHeader("content-type", "application/json")
  if (q === "empty") {
    res.end(JSON.stringify({ results: [], unresponsive_engines: [["brave", "timeout"], ["google", "captcha"]] }))
    return
  }
  res.end(
    JSON.stringify({
      results: [
        { url: "https://a.example/1", title: "A", content: "alpha" },
        { url: "https://b.example/2", title: "B", content: "beta", publishedDate: "2024-01-02T03:04:05Z" },
        { url: "https://c.example/3", title: "C" },
      ],
      unresponsive_engines: [],
    }),
  )
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

await ok("search maps to {url,title,content,time}", async () => {
  const r = await search("hello", { searxUrl: base })
  assert.equal(r.results.length, 3)
  assert.equal(r.results[0].url, "https://a.example/1")
  assert.equal(r.results[0].content, "alpha")
  assert.deepEqual(r.results[0].time, {})
})
await ok("search parses publishedDate to ms", async () => {
  const r = await search("hello", { searxUrl: base })
  assert.equal(r.results[1].time.published, Date.parse("2024-01-02T03:04:05Z"))
})
await ok("search respects limit", async () => {
  const r = await search("hello", { searxUrl: base, limit: 2 })
  assert.equal(r.results.length, 2)
})
await ok("search returns unresponsive engines on empty", async () => {
  const r = await search("empty", { searxUrl: base })
  assert.equal(r.results.length, 0)
  assert.deepEqual(r.unresponsive_engines, ["brave", "google"])
})
await ok("search sends language/timeRange params", async () => {
  // server ignores them, but the request must not throw and base must be honoured
  const r = await search("hello", { searxUrl: base, language: "zh-CN", timeRange: "month", categories: "news" })
  assert.ok(r.results.length > 0)
})
await ok("403 -> hint about settings.yml", () => rejects(() => search("forbidden", { searxUrl: base }), "settings.yml"))
await ok("429 -> rate limited", () => rejects(() => search("ratelimited", { searxUrl: base }), "429"))
await ok("non-JSON -> clear error", () => rejects(() => search("notjson", { searxUrl: base }), "non-JSON"))
await ok("no instance configured -> error", () => rejects(() => search("x", { searxUrl: "" }), "not configured"))

// mapResult unit
await ok("mapResult handles missing title/content", () => {
  const m = mapResult({ url: "https://x/" })
  assert.equal(m.title, "https://x/")
  assert.ok(!("content" in m))
})

// self-heal / actionable error
await ok("startCommand includes distro and container", () => {
  const cmd = startCommand({ wslDistro: "Ubuntu", searxContainer: "searxng" })
  assert.ok(cmd.includes("wsl -d Ubuntu"))
  assert.ok(cmd.includes("docker start searxng"))
})
await ok("pollUntil retries until success", async () => {
  let n = 0
  const r = await pollUntil(
    async () => {
      n++
      if (n < 3) throw new Error("not ready")
      return "ok"
    },
    { timeoutMs: 1000, intervalMs: 10 },
  )
  assert.equal(r, "ok")
  assert.equal(n, 3)
})
await ok("pollUntil gives up at the deadline", () =>
  rejects(() => pollUntil(async () => { throw new Error("always down") }, { timeoutMs: 60, intervalMs: 10 }), "always down"))

await ok("unreachable instance -> actionable error", async () => {
  try {
    await search("x", { searxUrl: "http://127.0.0.1:9", autoStart: false, allowPrivateSearch: true })
  } catch (err) {
    assert.ok(err.message.includes("Cannot reach SearxNG"), `got: ${err.message}`)
    assert.ok(err.message.includes("docker start searxng"), "error should include the start command")
    return
  }
  throw new Error("expected rejection but it resolved")
})

server.close()
console.log(`\n${passed} checks passed`)
