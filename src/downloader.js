import { writeFile, mkdir } from "node:fs/promises"
import { join, basename, extname } from "node:path"
import { homedir } from "node:os"
import { safeFetch } from "./safety.js"

const DEFAULT_DOWNLOAD_DIR = join(homedir(), "Downloads")

function detectFilename(resp, url) {
  const disposition = resp.headers.get("content-disposition")
  if (disposition) {
    const match = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"'\s;]+)/i)
    if (match) return decodeURIComponent(match[1])
  }
  const pathname = new URL(url).pathname
  let name = basename(pathname)
  name = name.replace(/[/\\?%*:|"<>]/g, "_").trim()
  if (name && name !== "." && name !== "..") return name
  return `download-${Date.now()}.bin`
}

export async function download(url, options = {}) {
  const { outputDir = DEFAULT_DOWNLOAD_DIR, filename, timeout = 60000 } = options
  const start = Date.now()

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)

  try {
    const resp = await safeFetch(url, { signal: ctrl.signal })
    clearTimeout(timer)

    if (!resp.ok) {
      return { error: `HTTP ${resp.status}: ${resp.statusText}` }
    }

    const buf = await resp.arrayBuffer()
    const finalUrl = resp.url
    const contentType = resp.headers.get("content-type") || ""
    let finalName = filename || detectFilename(resp, finalUrl)
    finalName = finalName.replace(/[/\\?%*:|"<>]/g, "_").trim() || `download-${Date.now()}.bin`
    const fileSize = buf.byteLength

    await mkdir(outputDir, { recursive: true })
    const filePath = join(outputDir, finalName)
    await writeFile(filePath, Buffer.from(buf))

    return {
      path: filePath,
      filename: finalName,
      size: fileSize,
      size_human: fileSize > 1048576
        ? `${(fileSize / 1048576).toFixed(2)} MB`
        : fileSize > 1024
          ? `${(fileSize / 1024).toFixed(1)} KB`
          : `${fileSize} B`,
      content_type: contentType,
      url: finalUrl,
      duration_ms: Date.now() - start,
    }
  } catch (err) {
    clearTimeout(timer)
    return { error: `Download failed: ${err.message}` }
  }
}
