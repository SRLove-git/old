import { Buffer } from 'node:buffer'
import process from 'node:process'
import sharp from 'sharp'
import { createWechatMpClient } from '../src/lib/wechat-mp.js'

function testImageSvg() {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440" viewBox="0 0 1080 1440">
  <rect width="1080" height="1440" fill="#b98555"/>
  <circle cx="540" cy="510" r="250" fill="#d9b48f" opacity="0.55"/>
  <text x="540" y="480" fill="#ffffff" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="72" font-weight="600" text-anchor="middle">公众号贴图联调</text>
  <text x="540" y="590" fill="#fff8f0" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="40" text-anchor="middle">岁悦里文化科技</text>
  <rect x="130" y="990" width="820" height="170" rx="32" fill="#ffffff" opacity="0.92"/>
  <text x="540" y="1060" fill="#725034" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="34" text-anchor="middle">仅生成草稿</text>
  <text x="540" y="1120" fill="#8f6847" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="28" text-anchor="middle">确认显示正常后再接入正式内容</text>
</svg>`)
}

async function main() {
  const client = createWechatMpClient()
  if (!client.configured()) throw new Error('请先配置公众号 AppID 和 AppSecret')

  const image = await sharp(testImageSvg()).jpeg({ quality: 90 }).toBuffer()
  const uploaded = await client.uploadPermanentImage({
    buffer: image,
    filename: 'wechat-newspic-spike.jpg'
  })
  const draft = await client.addImageDraft({
    title: '公众号贴图联调测试',
    content: '这是一条接口创建的贴图草稿，仅用于验证草稿箱展示，请勿发布或群发。',
    imageMediaIds: [uploaded.mediaId]
  })

  console.log(JSON.stringify({ ok: true, type: 'newspic', title: '公众号贴图联调测试', imageCount: 1, mediaId: draft.mediaId }))
}

main().catch((error) => {
  console.error(`贴图联调失败：${error.message || error}`)
  if (error.wechatCode) console.error(`微信错误码：${error.wechatCode}`)
  process.exitCode = 1
})
