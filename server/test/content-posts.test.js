import assert from 'node:assert/strict'
import test from 'node:test'
import {
  contentBlocksFingerprint,
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

test('文章保存、再次读取时保留版式、媒体顺序与兼容的纯文本', () => {
  const blocks = [
    {type: 'text', text: '旧文本', html: '<h2 style="text-align:center">标题</h2><p style="line-height:2;text-indent:2em;margin-bottom:24px"><strong>甲</strong><br>乙</p>'},
    {type: 'image', src: '/assets/cover.jpg', caption: '照片', width: '55', align: 'right'},
    {type: 'text', html: '<blockquote><p><span style="color:#226644;font-size:20px">引文</span></p></blockquote><ol start="3"><li>项目</li></ol><hr>'}
  ]
  const post = normalizeContentPost({title: '测试', contentBlocks: blocks})
  const [first, image, last] = post.contentBlocks
  assert.equal(first.text, '标题\n甲\n乙')
  assert.match(first.html, /text-indent:2em;margin-bottom:24px/)
  assert.match(first.html, /text-align:center/)
  assert.equal(image.width, 55)
  assert.equal(image.align, 'right')
  assert.match(last.html, /start="3"/)
  assert.match(last.html, /font-size:20px/)
  assert.match(last.html, /<hr /)
  assert.equal(post.content, [first.text, last.text].join('\n\n'))
  assert.deepEqual(normalizeContentPost(structuredClone(post)), post)
  assert.deepEqual(normalizeContentBlocks(blocks.slice(0, 2)), [
    {type:'text', text:'旧文本'}, {type:'image', src:'/assets/cover.jpg', caption:'照片'}
  ])
})

test('正文从排版生成链接列表，并忽略未支持的装饰样式和属性', () => {
  const url = 'https://example.org/info'
  const html = `<p class="custom" style="letter-spacing:7px;color:#336655"><a href="${url}">说明</a>与<a href="${url}">详情</a></p>`
  const [block] = normalizeContentPost({title: '链接', contentBlocks: [{type:'text', html}]}).contentBlocks
  assert.equal(block.text, '说明与详情')
  assert.equal(block.links.length, 1)
  assert.equal(block.links[0].url, url)
  assert.match(block.html, /color:#336655/)
  assert.doesNotMatch(block.html, /class=|letter-spacing/)
})

test('办公文档字体与小四字号仅保留在选中文字上，再次保存后仍一致', () => {
  const html = `<p>周五<span style="font-family:SimSun, 'Songti SC', serif;font-size:16px">上午</span>出发</p>`
  const post = normalizeContentPost({title: '活动通知', contentBlocks: [{type:'text', html}]})
  const block = post.contentBlocks[0]
  assert.match(block.html, /周五<span style="font-family:simsun, songti sc, serif;font-size:16px">上午<\/span>出发/)
  assert.equal(block.text, '周五上午出发')
  assert.deepEqual(normalizeContentPost(structuredClone(post)), post)
})
test('正文指纹与字段顺序无关，用于判断运营是否改动过同步正文', () => {
  const first = [{ type: 'text', html: '<p>正文</p>', text: '正文' }]
  const reordered = [{ text: '正文', type: 'text', html: '<p>正文</p>' }]
  assert.equal(contentBlocksFingerprint(first), contentBlocksFingerprint(reordered))
  assert.notEqual(contentBlocksFingerprint(first), contentBlocksFingerprint([{ type: 'text', text: '改动' }]))
})
