import crypto from 'node:crypto'
import { articleLayout } from './article-layout.js'
import { badRequest } from './domain-values.js'

// 正文区块的指纹：键顺序不影响结果，用来判断运营是否改过同步下来的正文。
function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]))
  }
  return value
}

export function contentBlocksFingerprint(blocks) {
  return crypto.createHash('sha256').update(JSON.stringify(stableValue(blocks || []))).digest('hex')
}

export function contentMediaUrl(value, label) {
  const url = String(value || '').trim()
  if (!url) return ''
  if (!/^(\/api\/uploads\/files\/|\/assets\/|https:\/\/)/.test(url)) {
    throw badRequest(`${label}地址格式不正确`)
  }
  return url
}

export function normalizeContentBlocks(blocks, fallbackText = '', richText = false) {
  const source = Array.isArray(blocks) ? blocks : []
  // 公众号图文同步会按图片切分区块，单篇文章最多约100张图，需要留出文字区块的余量。
  if (source.length > 200) throw badRequest('正文内容不能超过200个区块')
  const normalized = source
    .map((block) => {
      const type = String(block?.type || '')
      if (type === 'text' && richText && block.html) return articleLayout(block.html)
      if (type === 'text') return { type, text: String(block.text || '').trim() }
      if (type === 'image') {
        const width = Number(block.width)
        return {
          type,
          src: contentMediaUrl(block.src, '正文图片'),
          caption: String(block.caption || '').trim(),
          ...(richText && Number.isInteger(width) && width >= 1 && width <= 100 ? {width} : {}),
          ...(richText && ['left','center','right'].includes(block.align) ? {align: block.align} : {})
        }
      }
      if (type === 'video') {
        return {
          type,
          url: contentMediaUrl(block.url, '正文视频'),
          caption: String(block.caption || '').trim()
        }
      }
      if (type === 'link') {
        const url = String(block.url || '').trim()
        if (url && !/^(https:\/\/|\/pages\/)/.test(url)) {
          throw badRequest('正文链接仅支持HTTPS网址或小程序页面路径')
        }
        return {
          type,
          title: String(block.title || '').trim(),
          description: String(block.description || '').trim(),
          url
        }
      }
      throw badRequest('正文包含不支持的内容类型')
    })
    .filter((block) => {
      if (block.type === 'text') return block.text || block.html?.includes('<hr')
      if (block.type === 'image') return block.src
      if (block.type === 'video') return block.url
      return block.title && block.url
    })

  if (!normalized.length && String(fallbackText || '').trim()) {
    return [{ type: 'text', text: String(fallbackText).trim() }]
  }
  return normalized
}

export function normalizeContentPost(post) {
  post.type = post.type === 'video' ? 'video' : 'news'
  post.title = String(post.title || '').trim()
  if (!post.title) throw badRequest('标题不能为空')
  post.coverImage = contentMediaUrl(post.coverImage, '封面图片')
  post.videoUrl = contentMediaUrl(post.videoUrl, '视频')
  post.contentBlocks = normalizeContentBlocks(post.contentBlocks, post.content, true)
  post.content = post.contentBlocks
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n\n')
  post.status = post.status === 0 ? 0 : 1
  post.featured = Boolean(post.featured)
  return post
}
