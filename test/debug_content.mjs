const resp = await fetch("https://en.wikipedia.org/wiki/Web_scraping")
const html = await resp.text()

const CONTENT_PATTERNS = [
  [/<main[^>]*>([\s\S]*?)<\/main>/i, "main"],
  [/<article[^>]*>([\s\S]*?)<\/article>/i, "article"],
  [/<div[^>]*\bid\s*=\s*["'](?:content|main-content|post-content|article-content|entry-content|page-content|docs-content|markdown-body|readme)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i, 'div#content'],
  [/<div[^>]*\bclass\s*=\s*["'][^"']*(?:content|main-content|post-content|article-content|entry-content|page-content|article-body|doc-content)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i, "div.content"],
  [/<section[^>]*\b(?:id|class)\s*=\s*["'][^"']*(?:content|main-content|docs)[^"']*["'][^>]*>([\s\S]*?)<\/section>/i, "section"],
]

for (const [re, name] of CONTENT_PATTERNS) {
  const m = re.exec(html)
  console.log(name + ":", m ? "matched, len=" + m[1].length : "no")
}

// Check what Wikipedia uses
const main = html.match(/<div[^>]*id\s*=\s*"content"/)
const mwContent = html.match(/<div[^>]*id\s*=\s*"mw-content-text"/)
const bodyContent = html.match(/<div[^>]*id\s*=\s*"bodyContent"/)
console.log('div#content:', !!main)
console.log('div#mw-content-text:', !!mwContent)
console.log('div#bodyContent:', !!bodyContent)
