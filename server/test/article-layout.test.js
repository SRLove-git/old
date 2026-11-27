import assert from 'node:assert/strict'
import test from 'node:test'
import { articleBlocks } from '../src/lib/article-layout.js'
import { normalizeContentBlocks } from '../src/lib/content-posts.js'

const article = `<section style="font-size:15px;line-height:1.75em">
  <section>
    <p style="text-align:center"><img class="rich_pages" src="data:image/gif;base64,AAAA" data-src="http://mmbiz.qpic.cn/mmbiz_jpg/cover/640?wx_fmt=jpeg"></p>
    <p><span style="color:#333333">第一段</span><strong>重点</strong></p>
    <p><a href="https://example.com/policy">政策原文</a></p>
    <script>alert(1)</script>
    <iframe src="https://mp.weixin.qq.com/mp/videoplayer"></iframe>
    <p style="text-align:center"><img data-src="https://mmbiz.qpic.cn/mmbiz_png/body/640?wx_fmt=png"></p>
    <p>第二段</p>
  </section>
</section>`

test('公众号正文按图片切成小程序可渲染的文字与图片区块', () => {
  const blocks = articleBlocks(article)
  assert.deepEqual(blocks.map(block => block.type), ['image', 'text', 'image', 'text'])
  assert.equal(blocks[0].src, 'https://mmbiz.qpic.cn/mmbiz_jpg/cover/640?wx_fmt=jpeg')
  assert.equal(blocks[1].text, '第一段重点\n政策原文')
  assert.match(blocks[1].html, /color:#333333/)
  assert.deepEqual(blocks[1].links, [{ url: 'https://example.com/policy', title: '政策原文' }])
  assert.equal(blocks[3].text, '第二段')
  const json = JSON.stringify(blocks)
  assert.equal(json.includes('alert'), false)
  assert.equal(json.includes('videoplayer'), false)
  assert.equal(json.includes('<br></p>'), false)
})

test('同步正文再次归一化结果稳定，定时同步不会反复改写', () => {
  const once = normalizeContentBlocks(articleBlocks(article), '', true)
  assert.deepEqual(normalizeContentBlocks(once, '', true), once)
})

test('没有正文或只有占位图时返回空区块', () => {
  assert.deepEqual(articleBlocks(''), [])
  assert.deepEqual(articleBlocks('   '), [])
  assert.deepEqual(articleBlocks('<p><img src="data:image/gif;base64,AAAA"></p>'), [])
})
