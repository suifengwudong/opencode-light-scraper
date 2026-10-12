import { homedir } from "node:os"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

let _cfg = null

function loadConfig() {
  const p = join(homedir(), ".config", "opencode", "scraper.config.json")
  try {
    if (existsSync(p)) return JSON.parse(readFileSync(p, "utf-8"))
  } catch {}
  return {}
}

function cfg(key, fallback) {
  if (!_cfg) _cfg = loadConfig()
  return _cfg[key] ?? process.env[key] ?? process.env[key.toLowerCase()] ?? fallback
}

export function resolveConfig(options = {}) {
  const browserType = options.browserType || cfg("browserType") || cfg("BROWSER_TYPE", "edge")
  const browserPath = options.browserPath || cfg("browserPath") || cfg("BROWSER_PATH") || null
  const userDataDir = options.userDataDir || cfg("userDataDir") || cfg("USER_DATA_DIR") || null

  const searxUrl = "searxUrl" in options ? options.searxUrl : cfg("searxUrl") || process.env.SEARX_URL || null
  const searchLanguage = "searchLanguage" in options
    ? options.searchLanguage
    : cfg("searchLanguage") || process.env.SEARX_LANGUAGE || null
  const allowPrivateSearch = options.allowPrivateSearch ?? cfg("allowPrivateSearch") ?? true
  const autoStart = options.autoStart ?? cfg("autoStart") ?? true
  const wslDistro = options.wslDistro || cfg("wslDistro") || "Ubuntu"
  const searxContainer = options.searxContainer || cfg("searxContainer") || "searxng"

  return { browserType, browserPath, userDataDir, searxUrl, searchLanguage, allowPrivateSearch, autoStart, wslDistro, searxContainer }
}
