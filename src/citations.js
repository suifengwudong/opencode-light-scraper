const LINK_RE = /\[([^\]]*)\]\(([^)]*)\)/g

export function citations(input) {
  const refMap = new Map()
  let index = 0

  const content = input.replace(LINK_RE, (match, text, url) => {
    const key = url.toLowerCase()
    if (!refMap.has(key)) {
      index++
      refMap.set(key, { index, url: url.trim(), text: text.trim() || url.trim() })
    }
    const ref = refMap.get(key)
    return `${text}[${ref.index}]`
  })

  const references = [...refMap.values()].sort((a, b) => a.index - b.index)

  return { content, references }
}
