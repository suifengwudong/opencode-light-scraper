import { execSync } from "node:child_process"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const home = homedir()
const local = join(home, "AppData", "Local")
const pf86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)"
const pf = process.env["PROGRAMFILES"] || "C:\\Program Files"

export const BROWSER_BINARY = {
  win32: {
    edge: [
      join(local, "Microsoft", "Edge", "Application", "msedge.exe"),
      join(pf86, "Microsoft", "Edge", "Application", "msedge.exe"),
    ],
    chrome: [
      join(local, "Google", "Chrome", "Application", "chrome.exe"),
      join(pf, "Google", "Chrome", "Application", "chrome.exe"),
      join(pf86, "Google", "Chrome", "Application", "chrome.exe"),
    ],
  },
  darwin: {
    edge: ["/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"],
    chrome: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"],
    chromium: ["/Applications/Chromium.app/Contents/MacOS/Chromium"],
  },
}

export const DRIVER_BINARY = {
  win32: {
    edge: [
      join(local, "Microsoft", "Edge", "Application", "msedgedriver.exe"),
      join(pf86, "Microsoft", "Edge", "Application", "msedgedriver.exe"),
    ],
    chrome: [
      join(local, "Google", "Chrome", "Application", "chromedriver.exe"),
    ],
  },
  darwin: { edge: [], chrome: [] },
}

export const USER_DATA_DIRS = {
  win32: {
    edge: join(local, "Microsoft", "Edge", "User Data"),
    chrome: join(local, "Google", "Chrome", "User Data"),
  },
  darwin: {
    edge: join(home, "Library", "Application Support", "Microsoft Edge"),
    chrome: join(home, "Library", "Application Support", "Google", "Chrome"),
  },
}

export const COOKIE_PATHS = {
  win32: {
    edge: {
      cookies: join(local, "Microsoft", "Edge", "User Data", "Default", "Network", "Cookies"),
      localState: join(local, "Microsoft", "Edge", "User Data", "Local State"),
    },
    chrome: {
      cookies: join(local, "Google", "Chrome", "User Data", "Default", "Network", "Cookies"),
      localState: join(local, "Google", "Chrome", "User Data", "Local State"),
    },
  },
  darwin: {
    edge: {
      cookies: join(home, "Library", "Application Support", "Microsoft Edge", "Default", "Cookies"),
      localState: join(home, "Library", "Application Support", "Microsoft Edge", "Local State"),
    },
    chrome: {
      cookies: join(home, "Library", "Application Support", "Google", "Chrome", "Default", "Cookies"),
      localState: join(home, "Library", "Application Support", "Google", "Chrome", "Local State"),
    },
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

export function findDriverPath(browserType) {
  const os = process.platform
  const paths = DRIVER_BINARY[os]?.[browserType]
  if (!paths) return null
  for (const p of paths) { if (p && existsSync(p)) return p }
  return null
}

export function findUserDataDir(browserType) {
  const os = process.platform
  return USER_DATA_DIRS[os]?.[browserType] || null
}

export function findCookiePaths(browserType) {
  const os = process.platform
  return COOKIE_PATHS[os]?.[browserType] || null
}
