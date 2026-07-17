import http from "node:http"
import url from "node:url"

const STATIC_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Test Static Page</title>
  <meta name="description" content="A test page for scraper">
  <meta name="keywords" content="test, scraper, opencode">
  <meta property="og:title" content="Test OG Title">
  <meta property="og:description" content="Test OG Description">
</head>
<body>
  <h1>Hello World</h1>
  <p>This is a <strong>static</strong> test page.</p>
  <ul>
    <li><a href="/page1">Page 1</a></li>
    <li><a href="/page2">Page 2</a></li>
    <li><a href="https://external.com">External</a></li>
  </ul>
  <img src="/image.png" alt="test">
</body>
</html>`

const SPA_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Test SPA Page</title>
</head>
<body>
  <div id="root"></div>
  <script>
    document.getElementById("root").innerHTML = '<h1>Rendered by JS</h1><p>This content needs JS.</p>'
  </script>
</body>
</html>`

const PAGE1_HTML = `<!DOCTYPE html>
<html lang="en">
<head><title>Page 1</title></head>
<body>
  <h1>Page 1</h1>
  <p>Subpage content.</p>
  <a href="/page1-sub">Page 1 Sub</a>
  <a href="/page2">Page 2</a>
</body>
</html>`

const PAGE2_HTML = `<!DOCTYPE html>
<html lang="en">
<head><title>Page 2</title></head>
<body>
  <h1>Page 2</h1>
  <p>Another subpage.</p>
</body>
</html>`

const PAGE1_SUB_HTML = `<!DOCTYPE html>
<html lang="en">
<head><title>Page 1 Sub</title></head>
<body>
  <h1>Page 1 Sub</h1>
  <p>Deep subpage (depth 2).</p>
</body>
</html>`

const EMPTY_HTML = `<!DOCTYPE html>
<html lang="en">
<head><title>Empty</title></head>
<body></body>
</html>`

function sitemapXml(baseUrl) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${baseUrl}/</loc><priority>1.0</priority></url>
  <url><loc>${baseUrl}/page1</loc><priority>0.8</priority></url>
  <url><loc>${baseUrl}/page2</loc><priority>0.6</priority></url>
</urlset>`
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true)
  const path = parsed.pathname

  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*")

  if (path === "/static" || path === "/") {
    res.writeHead(200, { "Content-Type": "text/html" })
    res.end(STATIC_HTML)
  } else if (path === "/spa") {
    res.writeHead(200, { "Content-Type": "text/html" })
    res.end(SPA_HTML)
  } else if (path === "/page1") {
    res.writeHead(200, { "Content-Type": "text/html" })
    res.end(PAGE1_HTML)
  } else if (path === "/page2") {
    res.writeHead(200, { "Content-Type": "text/html" })
    res.end(PAGE2_HTML)
  } else if (path === "/page1-sub") {
    res.writeHead(200, { "Content-Type": "text/html" })
    res.end(PAGE1_SUB_HTML)
  } else if (path === "/empty") {
    res.writeHead(200, { "Content-Type": "text/html" })
    res.end(EMPTY_HTML)
  } else if (path === "/redirect") {
    res.writeHead(301, { "Location": "/static" })
    res.end()
  } else if (path === "/not-found") {
    res.writeHead(404, { "Content-Type": "text/html" })
    res.end("<h1>404 Not Found</h1>")
  } else if (path === "/pdf") {
    res.writeHead(200, { "Content-Type": "application/pdf" })
    res.end("%PDF-1.4 fake pdf content")
  } else if (path === "/sitemap.xml") {
    res.writeHead(200, { "Content-Type": "application/xml" })
    res.end(sitemapXml(`http://localhost:${server.address().port}`))
  } else if (path === "/slow") {
    setTimeout(() => {
      res.writeHead(200, { "Content-Type": "text/html" })
      res.end(STATIC_HTML)
    }, 5000)
  } else {
    res.writeHead(404, { "Content-Type": "text/html" })
    res.end("<h1>404 Not Found</h1>")
  }
})

const PORT = 3456
server.listen(PORT, () => {
  const addr = server.address()
  console.log(`Test server running at http://localhost:${addr.port}`)
})
