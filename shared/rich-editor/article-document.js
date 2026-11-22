import { Node, getHTMLFromFragment } from '@tiptap/core'

export const ArticleDocument = Node.create({
  name: 'doc',
  topNode: true,
  content: '(block | articleMedia)+'
})

function safeMediaUrl(value) {
  return /^(?:https:\/\/|\/api\/uploads\/files\/|\/assets\/)/.test(value || '') ? value : ''
}

const fields = {
  image: ['src', 'caption', 'width', 'align', 'emoji', 'tone'],
  video: ['url', 'caption', 'emoji', 'tone'],
  link: ['url', 'title', 'description']
}

function mediaAttrs(block) {
  const attrs = { 'data-article-media': block.type }
  for (const key of fields[block.type]) attrs['data-' + key] = block[key] || ''
  return attrs
}

export function articleMedia(previewUrl, allowVideo, allowCards) {
  return Node.create({
    name: 'articleMedia',
    atom: true,
    draggable: true,
    selectable: true,
    addAttributes() {
      return Object.fromEntries(
        ['kind', ...new Set(Object.values(fields).flat())].map((key) => [key, { default: '' }])
      )
    },
    parseHTML() {
      return [
        {
          tag: 'figure[data-article-media]',
          getAttrs: (el) => {
            const kind = el.dataset.articleMedia
            if (!Object.hasOwn(fields, kind) || (kind === 'video' && !allowVideo) || (kind === 'link' && !allowCards)) return false
            return { kind, ...Object.fromEntries(fields[kind].map((key) => [key, el.dataset[key] || ''])) }
          }
        },
        {
          tag: 'img',
          getAttrs: (el) => {
            const src = safeMediaUrl(el.getAttribute('data-src') || el.getAttribute('src'))
            if (!src) return false
            const width = /^([1-9]\d?|100)%$/.exec(el.style.width || el.getAttribute('width') || '')
            const align = el.style.textAlign || el.parentElement?.style.textAlign
            return { kind: 'image', src, caption: el.getAttribute('alt') || '',
              width: width?.[1] || '', align: ['left', 'center', 'right'].includes(align) ? align : '' }
          }
        }
      ]
    },
    renderHTML({ node }) {
      const a = node.attrs
      const attrs = mediaAttrs({ ...a, type: a.kind })
      if ((a.kind === 'image' && !a.src || a.kind === 'video' && !a.url) && (a.emoji || a.tone)) {
        return ['figure', attrs, ['span', a.emoji || ''], ['figcaption', a.caption || '']]
      }
      if (a.kind === 'image') {
        const width = Number(a.width)
        const size = width >= 1 && width <= 100 ? 'width:' + width + '%;' : ''
        attrs.style =
          size +
          'margin-left:' +
          (a.align === 'left' ? '0' : 'auto') +
          ';margin-right:' +
          (a.align === 'right' ? '0' : 'auto')
        return [
          'figure',
          attrs,
          [
            'img',
            { src: previewUrl(safeMediaUrl(a.src)), alt: a.caption, ...(size ? { style: 'width:100%' } : {}) }
          ],
          ...(a.caption ? [['figcaption', a.caption]] : [])
        ]
      }
      if (a.kind === 'video')
        return [
          'figure',
          attrs,
          ['video', { src: previewUrl(safeMediaUrl(a.url)), controls: '', preload: 'metadata' }],
          ...(a.caption ? [['figcaption', a.caption]] : [])
        ]
      return [
        'figure',
        attrs,
        ['b', a.title],
        ...(a.description ? [['figcaption', a.description]] : []),
        ['small', a.url]
      ]
    }
  })
}

export function editorContent(blocks) {
  const container = document.createElement('template')
  for (const block of blocks) {
    if (block.type === 'text') {
      if (block.html) {
        const part = document.createElement('template')
        part.innerHTML = block.html
        container.content.append(part.content)
      } else {
        const text = (block.text || '').replace(/\r\n?/g, '\n')
        for (const paragraph of text.split('\n\n')) {
          const p = document.createElement('p')
          for (const [i, line] of paragraph.split('\n').entries()) {
            if (i) p.append(document.createElement('br'))
            p.append(line)
          }
          container.content.append(p)
        }
      }
    } else if (Object.hasOwn(fields, block.type)) {
      const figure = document.createElement('figure')
      for (const [k, v] of Object.entries(mediaAttrs(block))) figure.setAttribute(k, v)
      container.content.append(figure)
    }
  }
  return container.innerHTML || '<p></p>'
}

export function articleBlocks(editor) {
  const doc = editor.state.doc
  const blocks = []
  let start = 0
  function flush(end) {
    if (start >= end) return
    const html = getHTMLFromFragment(doc.content.cut(start, end), editor.schema)
    const text = doc.textBetween(start, end, '\n', (node) => (node.type.name === 'hardBreak' ? '\n' : ''))
    if (text.trim() || html.includes('<hr')) blocks.push({ type: 'text', text, html })
  }
  doc.forEach((node, pos) => {
    if (node.type.name !== 'articleMedia') return
    flush(pos)
    const block = { type: node.attrs.kind }
    for (const key of fields[block.type]) {
      if (['align', 'width', 'emoji', 'tone'].includes(key) && !node.attrs[key]) continue
      block[key] = node.attrs[key] || ''
    }
    blocks.push(block)
    start = pos + node.nodeSize
  })
  flush(doc.content.size)
  return blocks
}

// Convert common clipboard units before copying inherited styles into the editor's marks.
function normalizeClipboardStyles(root) {
  const sizes = new WeakMap()
  for (const el of root.querySelectorAll('*')) {
    if (!el.style) continue
    const parent = el.parentElement
    const inheritedSize = sizes.get(parent) || 16
    const font = /^(\d*\.?\d+)(px|pt|em|rem|%)$/.exec(el.style.fontSize)
    let size = inheritedSize
    if (font) {
      const factors = { px: 1, pt: 4 / 3, em: inheritedSize, rem: 16, '%': inheritedSize / 100 }
      size = Math.max(8, Math.min(72, Number(font[1]) * factors[font[2]]))
      el.style.fontSize = Number(size.toFixed(2)) + 'px'
    }
    sizes.set(el, size)
    const height = /^(\d*\.?\d+)(px|pt|em|%)?$/.exec(el.style.lineHeight)
    if (height) {
      const factors = { px: 1 / size, pt: 4 / (3 * size), em: 1, '%': 0.01 }
      const ratio = Number(height[1]) * (factors[height[2]] || 1)
      el.style.lineHeight = String(Number(Math.min(3, Math.max(1, ratio)).toFixed(2)))
    }
    if (parent?.style) {
      if (!el.style.textAlign) el.style.textAlign = parent.style.textAlign
      if (!el.style.lineHeight) el.style.lineHeight = parent.style.lineHeight
    }
  }
}

// 公众号和办公软件常把字号、颜色写在段落或外层 section 上。把继承的样式带到文字选区。
export function preparePastedHtml(html) {
  const template = document.createElement('template')
  template.innerHTML = html
  for (const el of template.content.querySelectorAll('script,style,iframe,object,svg,math')) el.remove()
  normalizeClipboardStyles(template.content)
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT)
  const texts = []
  while (walker.nextNode()) texts.push(walker.currentNode)
  for (const text of texts) {
    if (!text.textContent.trim()) continue
    const span = document.createElement('span')
    for (let el = text.parentElement; el; el = el.parentElement) {
      for (const key of [
        'fontFamily',
        'fontSize',
        'color',
        'backgroundColor',
        'fontWeight',
        'fontStyle',
        'textDecoration'
      ]) {
        if (!span.style[key] && el.style?.[key]) span.style[key] = el.style[key]
      }
    }
    if (span.style.length) {
      text.replaceWith(span)
      span.append(text)
    }
  }
  for (const el of template.content.querySelectorAll('section,div')) {
    if (el.querySelector('p,div,section,ol,ul,blockquote,h1,h2,h3,figure')) continue
    const p = document.createElement('p')
    p.style.textAlign = el.style.textAlign
    p.style.lineHeight = el.style.lineHeight
    p.append(...el.childNodes)
    el.replaceWith(p)
  }
  return template.innerHTML
}
