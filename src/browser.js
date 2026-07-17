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
  let args = `"${browserPath}" --headless --disable-gpu --no-sandbox --dump-dom`

  if (useProfile && cfg.userDataDir && existsSync(cfg.userDataDir)) {
    args += ` --user-data-dir="${cfg.userDataDir}"`
  }

  try {
    return execSync(`${args} "${url}"`, {
      encoding: "utf8", timeout, maxBuffer: 10 * 1024 * 1024, windowsHide: true,
    })
  } catch {
    if (useProfile) {
      try {
        return execSync(`"${browserPath}" --headless --disable-gpu --no-sandbox --dump-dom "${url}"`, {
          encoding: "utf8", timeout, maxBuffer: 10 * 1024 * 1024, windowsHide: true,
        })
      } catch {}
    }
    throw new Error("Browser rendering failed. Close Edge/Chrome or set useEdgeCookies: false.")
  }
}
