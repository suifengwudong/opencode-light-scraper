import { spawn } from "node:child_process"
import { createServer } from "node:net"
import { existsSync, copyFileSync, mkdirSync, rmSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { tmpdir } from "node:os"
import { resolveConfig } from "./defaults.js"

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port
      server.close(() => resolve(port))
    })
    server.on("error", reject)
  })
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  try { return text ? JSON.parse(text) : null } catch { return text }
}

export class WebDriverSession {
  constructor(driverConfig) {
    this.driverProcess = null
    this.baseUrl = null
    this.sessionId = null
    this._tempDir = null
    this._cfg = resolveConfig(driverConfig)
  }

  async start(options = {}) {
    const { headless = true, windowSize = "1280,1024", userDataDir = null, timeout = 30000 } = options
    const cfg = this._cfg

    if (!cfg.driverPath) throw new Error(
      "WebDriver not found. Create scraper.config.json in the plugin root:\n" +
      '  { "driverPath": "path/to/msedgedriver.exe", "browserType": "edge" }\n' +
      "Or set DRIVER_PATH env var."
    )

    const port = await getFreePort()
    this.driverProcess = spawn(cfg.driverPath, [`--port=${port}`, "--silent"], {
      stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
    })
    this.baseUrl = `http://127.0.0.1:${port}`

    const deadline = Date.now() + 10000
    while (Date.now() < deadline) {
      try {
        await sleep(200)
        const s = await api("GET", `${this.baseUrl}/status`)
        if (s?.value?.ready) break
      } catch {}
    }

    const edgeOptions = { args: ["--no-sandbox", "--disable-gpu", `--window-size=${windowSize}`] }
    if (headless) edgeOptions.args.push("--headless=new")

    let profileDir = userDataDir
    if (!profileDir) {
      profileDir = `${tmpdir()}\\opencode-session-${randomUUID().slice(0, 8)}`
      mkdirSync(`${profileDir}\\Default\\Network`, { recursive: true })

      let copied = false
      if (cfg.cookiePaths) {
        const { cookies, localState } = cfg.cookiePaths
        if (existsSync(cookies)) {
          try {
            copyFileSync(cookies, `${profileDir}\\Default\\Network\\Cookies`)
            if (existsSync(`${cookies}-journal`)) copyFileSync(`${cookies}-journal`, `${profileDir}\\Default\\Network\\Cookies-journal`)
            copyFileSync(localState, `${profileDir}\\Local State`)
            copied = true
          } catch {}
        }
      }
      if (!copied) edgeOptions.args.push("--guest")
      edgeOptions.args.push(`--user-data-dir=${profileDir}`)
    } else {
      edgeOptions.args.push(`--user-data-dir=${userDataDir}`)
    }

    if (cfg.browserPath) edgeOptions.binary = cfg.browserPath

    const browserName = cfg.browserType === "chrome" ? "chrome" : "MicrosoftEdge"
    const resp = await api("POST", `${this.baseUrl}/session`, {
      capabilities: { alwaysMatch: { browserName, "ms:edgeOptions": edgeOptions } },
    })

    this.sessionId = resp?.value?.session?.sessionId || resp?.value?.sessionId
    if (!this.sessionId) throw new Error("Failed to create WebDriver session")
    this._tempDir = profileDir
    return this.sessionId
  }

  async navigate(url) {
    await api("POST", `${this.baseUrl}/session/${this.sessionId}/url`, { url })
    await sleep(500)
  }

  async getPageSource() {
    const resp = await api("GET", `${this.baseUrl}/session/${this.sessionId}/source`)
    return resp?.value || ""
  }

  async close() {
    if (this.sessionId) {
      try { await api("DELETE", `${this.baseUrl}/session/${this.sessionId}`) } catch {}
      this.sessionId = null
    }
    if (this.driverProcess) {
      try { this.driverProcess.kill() } catch {}
      this.driverProcess = null
    }
    if (this._tempDir?.includes("opencode-session-")) {
      try { rmSync(this._tempDir, { recursive: true, force: true }) } catch {}
    }
  }
}

export async function renderWithWebDriver(url, options = {}) {
  const { headless = true, timeout = 30000, waitAfterLoad = 1500, useEdgeCookies = true, driverConfig = {} } = options
  const session = new WebDriverSession(driverConfig)
  try {
    await session.start({ headless, userDataDir: useEdgeCookies ? null : null, timeout })
    await session.navigate(url)
    await sleep(waitAfterLoad)
    const html = await session.getPageSource()
    await session.close()
    return { html, duration_ms: Date.now() }
  } catch (err) {
    await session.close().catch(() => {})
    throw err
  }
}
