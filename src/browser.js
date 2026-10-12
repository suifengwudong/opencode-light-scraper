import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { resolveConfig } from "./defaults.js"
import { findBrowserPath } from "./platform.js"

const BASE_ARGS = ["--headless=new", "--no-sandbox", "--dump-dom"]

export function findBrowser(browserType) {
  const cfg = resolveConfig({ browserType })
  return cfg.browserPath || findBrowserPath(browserType)
}

function dumpDom(browserPath, userDataDir, url, timeout) {
  return execFileSync(browserPath, [...BASE_ARGS, `--user-data-dir=${userDataDir}`, url], {
    encoding: "utf8",
    timeout,
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true,
    stdio: ["ignore", "pipe", "ignore"],
  })
}

export function renderWithBrowser(browserPath, url, timeout, useProfile) {
  const cfg = resolveConfig()

  if (useProfile) {
    const udd = cfg.userDataDir
    if (udd && existsSync(udd)) {
      try {
        return dumpDom(browserPath, udd, url, timeout)
      } catch {}
    }
  }

  return dumpDom(browserPath, join(tmpdir(), "oc-scrape"), url, timeout)
}
