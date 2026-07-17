const resp = await fetch("https://en.wikipedia.org/wiki/Web_scraping")
const html = await resp.text()

const CONTENT_PATTERNS = [
  [/<div[^>]*\bid\s*=\s*["'](?:mw-content-text|bodyContent|readme|markdown-body)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i, 'div#mw-content-text'],
  [/<div[^>]*\bclass\s*=\s*["'][^"']*(?:post-content|article-content|entry-content|article-body|doc-content|markdown-body)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i, 'div.content class'],
  [/<article[^>]*>([\s\S]*?)<\/article>/i, 'article'],
  [/<div[^>]*\bid\s*=\s*["'](?:content|main-content|page-content|docs-content)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i, 'div#content'],
  [/<main[^>]*>([\s\S]*?)<\/main>/i, 'main'],
  [/<div[^>]*\bclass\s*=\s*["'][^"']*(?:content|main-content|page-content)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i, 'div.content'],
]

for (const [re, name] of CONTENT_PATTERNS) {
  const m = re.exec(html)
  console.log(name + ":", m ? "matched, len=" + m[1].length : "no")
}

// Find exact id= content areas
const mw = html.match(/id\s*=\s*["']mw-content-text["']/)
console.log('id=mw-content-text exists:', !!mw)

const bc = html.match(/id\s*=\s*["']bodyContent["']/)
console.log('id=bodyContent exists:', !!bc)
