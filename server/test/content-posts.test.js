import assert from 'node:assert/strict'
import test from 'node:test'
import {
  contentMediaUrl,
  normalizeContentBlocks,
  normalizeContentPost
} from '../src/lib/content-posts.js'

test('content blocks normalize supported media and discard empty blocks', () => {
  assert.deepEqual(
    normalizeContentBlocks([
      { type: 'text', text: ' 正文 ' },
      { type: 'text', text: '  ' },
      { type: 'image', src: '/assets/cover.jpg', caption: ' 封面 ' },
      { type: 'link', title: '查看详情', url: '/pages/detail/detail?id=1' }
    ]),
    [
      { type: 'text', text: '正文' },
      { type: 'image', src: '/assets/cover.jpg', caption: '封面' },
      { type: 'link', title: '查看详情', description: '', url: '/pages/detail/detail?id=1' }
    ]
  )
  assert.deepEqual(normalizeContentBlocks([], ' 备用正文 '), [{ type: 'text', text: '备用正文' }])
})

test('content media and links reject unsafe or unsupported addresses', () => {
  assert.equal(contentMediaUrl('https://example.com/image.jpg', '图片'), 'https://example.com/image.jpg')
  assert.throws(() => contentMediaUrl('http://example.com/image.jpg', '图片'), /地址格式不正确/)
  assert.throws(
    () => normalizeContentBlocks([{ type: 'link', title: '风险链接', url: 'javascript:alert(1)' }]),
    /仅支持HTTPS网址/
  )
})

test('content posts normalize type, status, and plain-text fallback', () => {
  const post = normalizeContentPost({
    type: 'unknown',
    title: ' 养老政策 ',
    content: '第一段',
    contentBlocks: [],
    status: 2,
    featured: 1
  })
  assert.equal(post.type, 'news')
  assert.equal(post.title, '养老政策')
  assert.equal(post.content, '第一段')
  assert.equal(post.status, 1)
  assert.equal(post.featured, true)
})
