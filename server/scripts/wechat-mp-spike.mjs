import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { Buffer } from 'node:buffer'
import sharp from 'sharp'
import { createWechatMpClient } from '../src/lib/wechat-mp.js'

const args = process.argv.slice(2)
const shouldPublish = args.includes('--publish')
const imageArgument = args.find((arg) => arg.startsWith('--image='))
const imagePath = imageArgument ? imageArgument.slice('--image='.length) : ''

function testImageSvg() {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="383" viewBox="0 0 900 383">
  <rect width="900" height="383" fill="#b98555"/>
  <text x="450" y="176" fill="#ffffff" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="46" text-anchor="middle">公众号发布联调</text>
  <text x="450" y="238" fill="#f6eee4" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="24" text-anchor="middle">仅生成草稿，确认后才会提交发布</text>
</svg>`)
}

async function loadTestImage() {
  if (imagePath) return fs.readFile(imagePath)
  return sharp(testImageSvg()).png().toBuffer()
}

async function main() {
  const client = createWechatMpClient()
  if (shouldPublish) {
    const mediaId = args.find((arg) => arg.startsWith('--media-id='))?.slice('--media-id='.length).trim()
    if (!mediaId) throw new Error('请用 --publish --media-id=已预览的草稿ID 指定草稿')
    const result = await client.submitPublish(mediaId)
    console.log(`已提交该草稿，publish_id=${result.publishId}`)
    return
  }
  if (!client.configured()) {
    throw new Error('请先在 server/.env 或 .env.local 配置 WECHAT_MP_APPID 和 WECHAT_MP_APPSECRET')
  }
  const image = await loadTestImage()
  const filename = imagePath ? path.basename(imagePath) : 'wechat-mp-spike.png'

  console.log('公众号发布联调开始（默认只建草稿，不发布）')
  console.log('提示：请先将当前出口 IP 加入公众号后台“开发-基本配置-IP白名单”。')

  console.log('1/4 上传封面永久素材...')
  const cover = await client.uploadPermanentImage({ buffer: image, filename })
  console.log(`    cover media_id=${cover.mediaId}`)

  console.log('2/4 上传正文图片...')
  const body = await client.uploadArticleImage({ buffer: image, filename })
  console.log(`    body image url=${body.url}`)

  console.log('3/4 新增草稿...')
  const draft = await client.addDraft({
    title: '公众号发布联调测试',
    author: '运营',
    digest: '用于验证公众号草稿接口连通性，请勿群发。',
    content: `<section><p>这是一篇用于联调的测试文章。</p><p>如果你在公众号后台草稿箱看到这张封面和正文图片，说明 token、IP 白名单、图片上传和草稿接口都已打通。</p><p><img src="${body.url}" style="max-width:100%;" /></p></section>`,
    thumbMediaId: cover.mediaId,
    needOpenComment: 0,
    onlyFansCanComment: 0
  })
  console.log(`    draft media_id=${draft.mediaId}`)

  console.log('4/4 完成')
  console.log('请到公众号后台“内容与互动 -> 草稿箱”查看并预览排版。')
  console.log('确认后可用 --publish --media-id=已预览的草稿ID 提交。')
}

main().catch((error) => {
  console.error(`联调失败：${error.message || error}`)
  if (error.wechatCode) console.error(`微信错误码：${error.wechatCode}`)
  process.exitCode = 1
})
