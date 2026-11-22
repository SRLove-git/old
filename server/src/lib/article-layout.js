import { parseFragment } from 'parse5'
import { badRequest } from './domain-values.js'

const blockTags = new Set(['p', 'h1', 'h2', 'h3', 'blockquote', 'ul', 'ol', 'li'])
const inlineTags = new Set(['strong', 'em', 'u', 's', 'span', 'a'])
const discard = new Set(['script', 'style', 'template', 'iframe', 'object', 'svg', 'math'])
const aliases = { div: 'p', section: 'p', b: 'strong', i: 'em', strike: 's' }
const color = /^(?:#[\da-f]{3,4}|#[\da-f]{6}(?:[\da-f]{2})?|rgba?\([\d.,%/\s]+\)|[a-z]{1,24})$/i
const styles = {
  color,
  'background-color': color,
  'font-size': /^(?:[89]|[1-6]\d|7[0-2])(?:\.\d+)?px$/,
  'text-align': /^(?:left|right|center|justify)$/,
  'text-indent': /^[1-4]em$/,
  'margin-bottom': /^(?:0|4|8|12|16|24|32)px$/,
  'line-height': /^(?:1(?:\.\d+)?|2(?:\.\d+)?|3(?:\.0+)?)$/,
  'font-weight': /^(?:bold|normal|[1-9]00)$/,
  'font-style': /^(?:italic|normal)$/,
  'text-decoration': /^(?:underline|line-through|none)$/
}
const defaults = {
  p: 'margin:0 0 12px',
  h1: 'font-size:26px;font-weight:bold;margin:18px 0 10px',
  h2: 'font-size:22px;font-weight:bold;margin:16px 0 8px',
  h3: 'font-size:18px;font-weight:bold;margin:12px 0 8px',
  blockquote: 'margin:12px 0;padding-left:12px;border-left:3px solid #9aaea4',
  ul: 'padding-left:24px;list-style-type:disc',
  ol: 'padding-left:24px;list-style-type:decimal',
  hr: 'border:0;border-top:1px solid #d4dcd7;margin:16px 0'
}

export function escapeArticleText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function safeStyles(tag, input) {
  const result = new Map(
    (defaults[tag] || '')
      .split(';')
      .filter(Boolean)
      .map((pair) => pair.split(':'))
  )
  for (const part of input.split(';')) {
    const [key, value] = part.split(':').map((s) => s.trim().toLowerCase())
    if (key === 'font-family' && value) {
      const names = value.split(',').map(name => name.trim().replace(/^(['"])(.*)\1$/, '$2'))
      if (names.length <= 6 && names.every(name => /^[a-z\u3400-\u9fff][a-z0-9\u3400-\u9fff -]{0,39}$/.test(name))) {
        result.set(key, names.join(', '))
      }
    }
    if (Object.hasOwn(styles, key) && styles[key].test(value || '')) result.set(key, value)
  }
  const css = Array.from(result, ([key, value]) => key + ':' + value).join(';')
  return css ? ' style="' + css + '"' : ''
}

// 只从允许的节点、属性和值重新生成正文。纯文本和小程序可点击的链接都从同一棵树派生。
export function articleLayout(input) {
  if (typeof input !== 'string' || input.length > 160000) throw badRequest('单段图文过长，请分段编辑')
  const links = new Map()
  const plain = []
  let count = 0
  function render(node, depth) {
    if (depth > 45 || ++count > 12000) throw badRequest('图文格式过于复杂，请简化嵌套')
    if (node.nodeName === '#text') {
      plain.push(node.value)
      return escapeArticleText(node.value)
    }
    const name = node.tagName
    if (!name || discard.has(name)) return ''
    const tag = Object.hasOwn(aliases, name) ? aliases[name] : name
    if (tag === 'br') {
      plain.push('\n')
      return '<br>'
    }
    if (tag === 'hr') {
      plain.push('\n')
      return '<hr' + safeStyles(tag, '') + '>'
    }
    const start = plain.length
    const body = node.childNodes.map((child) => render(child, depth + 1)).join('')
    if (!blockTags.has(tag) && !inlineTags.has(tag)) return body
    const attrs = Object.fromEntries(node.attrs.map((attr) => [attr.name, attr.value]))
    let extra = safeStyles(tag, attrs.style || '')
    if (tag === 'a') {
      let url
      try {
        url = new URL(attrs.href)
      } catch {
        return body
      }
      if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return body
      extra += ' href="' + escapeArticleText(url.href) + '"'
      links.set(url.href, { url: url.href, title: plain.slice(start).join('').trim() || url.href })
    }
    if (tag === 'ol' && /^[1-9]\d{0,5}$/.test(attrs.start)) extra += ' start="' + attrs.start + '"'
    if (blockTags.has(tag)) plain.push('\n')
    return '<' + tag + extra + '>' + (body || (tag === 'p' ? '<br>' : '')) + '</' + tag + '>'
  }
  const html = parseFragment(input)
    .childNodes.map((node) => render(node, 0))
    .join('')
  const text = plain
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { type: 'text', text, html, ...(links.size ? { links: [...links.values()] } : {}) }
}
