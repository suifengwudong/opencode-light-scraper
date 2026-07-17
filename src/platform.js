import { execSync } from "node:child_process"
import { existsSync } from "node:fs"

export const BROWSER_BINARY = {
  win32: {
    edge: [
      `${process.env.LOCALAPPDATA}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${process.env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
    ],
    chrome: [
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    ],
  },
  darwin: {
    edge: ["/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"],
    chrome: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"],
    chromium: ["/Applications/Chromium.app/Contents/MacOS/Chromium"],
  },
}

const LINUX_BROWSER = [
  "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable",
  "/snap/bin/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
]

const WHICH_CMDS = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"]

export function findBrowserPath(browserType) {
  const os = process.platform

  const paths = BROWSER_BINARY[os]?.[browserType]
  if (paths) {
    for (const p of paths) {
      if (p && existsSync(p)) return p
    }
  }

  if (os !== "linux") return null
  for (const p of LINUX_BROWSER) { if (existsSync(p)) return p }
  for (const cmd of WHICH_CMDS) {
    try {
      const p = execSync(`which ${cmd} 2>/dev/null`, { encoding: "utf8" }).trim()
      if (p) return p
    } catch {}
  }
  return null
}
