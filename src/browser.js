import { execSync } from "node:child_process"
import { existsSync } from "node:fs"
import { resolveConfig } from "./defaults.js"
import { findBrowserPath } from "./platform.js"

export function findBrowser(browserType) {
  const cfg = resolveConfig({ browserType })
  return cfg.browserPath || findBrowserPath(browserType)
}

export function renderWithBrowser(browserPath, url, timeout, useProfile) {
  const cfg = resolveConfig()
  const flags = `"${browserPath}" --headless=new --no-sandbox --dump-dom`

  let html = null

  if (useProfile) {
    const udd = cfg.userDataDir
    if (udd && existsSync(udd)) {
      try {
        html = execSync(`${flags} --user-data-dir="${udd}" "${url}" 2>nul`, {
          encoding: "utf8", timeout, maxBuffer: 10 * 1024 * 1024, windowsHide: true,
        })
      } catch {}
    }
  }

  if (!html) {
    html = execSync(`${flags} --user-data-dir="%TEMP%\\oc-scrape" "${url}" 2>nul`, {
      encoding: "utf8", timeout, maxBuffer: 10 * 1024 * 1024, windowsHide: true,
    })
  }

  return html
}
