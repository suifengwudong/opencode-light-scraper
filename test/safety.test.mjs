import assert from "node:assert/strict"
import { isBlockedIp, assertPublicUrl, parseRobots, isPathAllowed, pathMatches } from "../src/safety.js"

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
async function rejects(fn) {
  try {
    await fn()
  } catch {
    return
  }
  throw new Error("expected rejection but it resolved")
}

// --- SSRF: IP classification
for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.5.5", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "2001:db8::1", "::ffff:127.0.0.1"]) {
  await ok(`isBlockedIp(${ip}) === true`, () => assert.equal(isBlockedIp(ip), true))
}
for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111", "2001:4860:4860::8888"]) {
  await ok(`isBlockedIp(${ip}) === false`, () => assert.equal(isBlockedIp(ip), false))
}

// --- SSRF: URL guard
for (const url of ["http://127.0.0.1/", "http://localhost/", "http://[::1]/", "file:///etc/passwd", "http://10.0.0.5/", "http://169.254.169.254/latest/meta-data/", "http://foo.internal/", "http://x.local/", "ftp://example.com/"]) {
  await ok(`assertPublicUrl blocks ${url}`, () => rejects(() => assertPublicUrl(url)))
}
await ok("assertPublicUrl allows a public IP", async () => {
  await assertPublicUrl("http://1.1.1.1/")
})
await ok("assertPublicUrl allows private when allowPrivate=true", async () => {
  await assertPublicUrl("http://127.0.0.1:8080/", { allowPrivate: true })
})
await ok("allowPrivate does not weaken the scheme check", () => rejects(() => assertPublicUrl("file:///etc/passwd", { allowPrivate: true })))

// --- robots.txt parsing + matching
const robots = [
  "User-agent: *",
  "Disallow: /private/",
  "Disallow: /tmp",
  "Allow: /private/public/",
  "Crawl-delay: 2",
  "",
  "User-agent: opencode-light-web-tools",
  "Disallow: /nope/",
].join("\n")
const info = parseRobots(robots, "opencode-light-web-tools")

await ok("robots: specific group overrides *", () => {
  assert.equal(isPathAllowed(info, "/private/x"), true) // our group has no /private rule -> allowed
  assert.equal(isPathAllowed(info, "/nope/x"), false) // our group's own rule
})
await ok("robots: crawl-delay parsed from matching group", () => {
  assert.equal(info.crawlDelay, null)
})
const starInfo = parseRobots(robots, "some-other-bot")
await ok("robots: * group used for unknown bot", () => {
  assert.equal(isPathAllowed(starInfo, "/tmp/x"), false)
  assert.equal(isPathAllowed(starInfo, "/private/x"), false)
  assert.equal(isPathAllowed(starInfo, "/private/public/x"), true) // longer Allow wins
  assert.equal(isPathAllowed(starInfo, "/ok"), true)
  assert.equal(starInfo.crawlDelay, 2)
})
await ok("robots: null info allows everything", () => {
  assert.equal(isPathAllowed(null, "/anything"), true)
})
await ok("pathMatches handles wildcard and end anchor", () => {
  assert.equal(pathMatches("/a/*/b", "/a/x/b"), true)
  assert.equal(pathMatches("/a/*/b", "/a/x/c"), false)
  assert.equal(pathMatches("/*.pdf$", "/docs/file.pdf"), true)
  assert.equal(pathMatches("/*.pdf$", "/docs/file.pdf?x=1"), false)
  assert.equal(pathMatches("", "/x"), false)
})

console.log(`\n${passed} checks passed`)
