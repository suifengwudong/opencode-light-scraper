import { execSync } from "node:child_process"
import { existsSync } from "node:fs"

function findFirst(paths) {
  if (!paths) return null
  for (const p of paths) {
    if (p && existsSync(p)) return p
  }
  return null
}

export function findBrowserPath(browserType) {
  const os = process.platform
  if (os === "win32") {
    const local = process.env.LOCALAPPDATA || ""
    const pf86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)"
    const pf = process.env["ProgramFiles"] || "C:\\Program Files"
    const edge = [
      `${local}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${pf86}\\Microsoft\\Edge\\Application\\msedge.exe`,
    ]
    const chrome = [
      `${local}\\Google\\Chrome\\Application\\chrome.exe`,
      `${pf}\\Google\\Chrome\\Application\\chrome.exe`,
      `${pf86}\\Google\\Chrome\\Application\\chrome.exe`,
    ]
    const p = findFirst(browserType === "chrome" ? chrome : edge)
    if (p) return p
    try {
      const p = execSync("where msedge.exe 2>nul", { encoding: "utf8", windowsHide: true }).trim().split("\n")[0]
      if (p) return p
    } catch {}
    return null
  }
  if (os === "darwin") {
    const m = { edge: ["/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"], chrome: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"] }
    return findFirst(m[browserType])
  }
  if (os === "linux") {
    for (const p of ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/snap/bin/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser"]) {
      if (existsSync(p)) return p
    }
    for (const cmd of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"]) {
      try { const p = execSync(`which ${cmd} 2>/dev/null`, { encoding: "utf8" }).trim(); if (p) return p } catch {}
    }
  }
  return null
}

export function findDriverPath() {
  if (process.platform !== "win32") return null
  const local = process.env.LOCALAPPDATA || ""
  const pf86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)"
  return findFirst([
    `${local}\\Microsoft\\Edge\\Application\\msedgedriver.exe`,
    `${pf86}\\Microsoft\\Edge\\Application\\msedgedriver.exe`,
  ])
}

export function findUserDataDir(browserType) {
  if (process.platform !== "win32") return null
  const local = process.env.LOCALAPPDATA || ""
  return browserType === "edge"
    ? `${local}\\Microsoft\\Edge\\User Data`
    : `${local}\\Google\\Chrome\\User Data`
}

export function findCookiePaths(browserType) {
  const udd = findUserDataDir(browserType)
  if (!udd) return null
  return { cookies: `${udd}\\Default\\Network\\Cookies`, localState: `${udd}\\Local State` }
}
