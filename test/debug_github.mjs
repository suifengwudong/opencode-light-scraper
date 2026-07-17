const resp = await fetch("https://github.com", { redirect: "follow" })
const html = await resp.text()
console.log("size:", html.length, "chars")

const patterns = [
  [/<div\s[^>]*id\s*=\s*["'](?:root|app|__next|__nuxt|mount)[^"']*["']/i, "div#root|app|__next|__nuxt|mount"],
  [/<div\s[^>]*id\s*=\s*["'](?:react-root|app-root)[^"']*["']/i, "div#react-root|app-root"],
  [/<script[^>]*src\s*=\s*["'][^"']*(?:react|vue|angular|svelte|nuxt|next)[^"']*["']/i, "script src framework"],
  [/<noscript>[^<]*<[^>]*>enable JavaScript/i, "noscript enable JS"],
]

for (const [re, name] of patterns) {
  const m = html.match(re)
  console.log(name + ":", m ? "MATCHED: " + m[0].slice(0, 100) : "no")
}
