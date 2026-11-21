import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import * as store from '../store.js'
import { httpError } from '../lib/http.js'
import { UPLOAD_DIR } from '../lib/uploads.js'
import { wechatMp } from '../lib/wechat-mp.js'
import { isImported } from '../lib/wechat-publication-state.js'

const BODY_IMAGE_LIMIT = 950_000
const SOURCE_FIELDS = ['title', 'summary', 'source', 'originalUrl', 'coverImage', 'contentBlocks']

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function httpsUrl(value, label) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  let url
  try {
    url = new URL(raw)
  } catch {
    throw httpError(400, `${label}必须是完整的 HTTPS 地址`)
  }
  if (url.protocol !== 'https:') throw httpError(400, `${label}必须使用 HTTPS`)
  return url.toString()
}

function publicationSource(post) {
  return Object.fromEntries(SOURCE_FIELDS.map((key) => [key, post?.[key] ?? '']))
}

function charLength(value) {
  return Array.from(String(value == null ? '' : value)).length
}

function validatePostBeforeUpload(post, uploadDir, author, format) {
  if (!String(post.title || '').trim()) throw httpError(400, '请先填写政策资讯标题')
  if (charLength(post.title) > 32) throw httpError(400, '公众号文章标题不能超过32个字')
  if (charLength(post.summary) > 120) throw httpError(400, '公众号文章摘要不能超过120个字')
  if (charLength(author) > 16) throw httpError(400, '公众号文章作者不能超过16个字')
  managedUploadPath(post.coverImage, '公众号封面', uploadDir)
  httpsUrl(post.originalUrl, '政府原文链接')
  const blocks = Array.isArray(post.contentBlocks) ? post.contentBlocks : []
  if (!blocks.length && format !== 'newspic') throw httpError(400, '请先填写政策资讯正文')
  blocks.forEach((block, index) => {
    if (block.type === 'video') {
      throw httpError(400, '公众号图文暂不支持小程序视频区块，请删除视频区块后再生成草稿')
    }
    if (block.type === 'image') managedUploadPath(block.src, `正文第${index + 1}张图片`, uploadDir)
    if (block.type === 'link') httpsUrl(block.url, `正文第${index + 1}个链接`)
  })
}

export function contentPublicationHash(post) {
  return crypto.createHash('sha256').update(JSON.stringify(publicationSource(post))).digest('hex')
}

function managedUploadPath(value, label, uploadDir) {
  const raw = String(value || '').trim()
  if (!raw) throw httpError(400, `请先上传${label}`)
  let pathname = raw
  if (/^https:\/\//.test(raw)) {
    try {
      pathname = new URL(raw).pathname
    } catch {
      throw httpError(400, `${label}地址不正确`)
    }
  }
  const prefix = '/api/uploads/files/'
  if (!pathname.startsWith(prefix)) {
    throw httpError(400, `${label}必须先上传到运营后台，不能直接使用外部图片地址`)
  }
  const filename = decodeURIComponent(pathname.slice(prefix.length))
  if (!filename || filename !== path.basename(filename)) throw httpError(400, `${label}地址不正确`)
  const resolved = path.resolve(uploadDir, filename)
  const root = `${path.resolve(uploadDir)}${path.sep}`
  if (!resolved.startsWith(root)) throw httpError(400, `${label}地址不正确`)
  return resolved
}

async function jpegForWechat(value, label, uploadDir, maxBytes = BODY_IMAGE_LIMIT) {
  const file = managedUploadPath(value, label, uploadDir)
  let input
  try {
    const info = await fs.stat(file)
    if (!info.isFile() || info.size > 12 * 1024 * 1024) throw new Error('invalid image size')
    input = await fs.readFile(file)
  } catch {
    throw httpError(400, `${label}文件不存在或无法读取，请重新上传`)
  }

  try {
    for (const width of [1600, 1280, 1024, 800]) {
      for (const quality of [86, 78, 70, 60]) {
        const output = await sharp(input, { limitInputPixels: 40_000_000 })
          .rotate()
          .resize({ width, withoutEnlargement: true })
          .flatten({ background: '#ffffff' })
          .jpeg({ quality, mozjpeg: true })
          .toBuffer()
        if (output.length < maxBytes) return output
      }
    }
  } catch {
    throw httpError(400, `${label}文件无效，请重新上传`)
  }
  throw httpError(400, `${label}转换后仍超过公众号图片大小限制，请压缩后重新上传`)
}

function textHtml(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="font-size:16px;line-height:1.8;color:#333333;margin:0 0 16px;">${escapeHtml(paragraph).replace(/\n/g, '<br/>')}</p>`)
    .join('')
}

async function articleContent(post, client, uploadDir) {
  const parts = []
  for (const [index, block] of (post.contentBlocks || []).entries()) {
    if (block.type === 'text') {
      parts.push(textHtml(block.text))
      continue
    }
    if (block.type === 'image') {
      const image = await jpegForWechat(block.src, `正文第${index + 1}张图片`, uploadDir)
      const uploaded = await client.uploadArticleImage({ buffer: image, filename: `content-${index + 1}.jpg` })
      parts.push(`<p style="margin:16px 0;text-align:center;"><img src="${escapeHtml(uploaded.url)}" style="max-width:100%;height:auto;"/></p>`)
      if (block.caption) parts.push(`<p style="font-size:13px;line-height:1.6;color:#888888;text-align:center;margin:0 0 16px;">${escapeHtml(block.caption)}</p>`)
      continue
    }
    if (block.type === 'link') {
      const url = httpsUrl(block.url, `正文第${index + 1}个链接`)
      parts.push(`<p style="font-size:15px;line-height:1.7;margin:16px 0;"><strong>${escapeHtml(block.title)}</strong>${block.description ? `<br/><span style="color:#666666;">${escapeHtml(block.description)}</span>` : ''}<br/><a href="${escapeHtml(url)}">查看详情</a></p>`)
      continue
    }
    if (block.type === 'video') {
      throw httpError(400, '公众号图文暂不支持小程序视频区块，请删除视频区块后再生成草稿')
    }
  }
  if (!parts.length) throw httpError(400, '请先填写政策资讯正文')
  if (post.source) {
    parts.push(`<p style="font-size:13px;line-height:1.6;color:#888888;margin-top:24px;">来源：${escapeHtml(post.source)}</p>`)
  }
  return `<section>${parts.join('')}</section>`
}

export function createWechatContentPublisher({
  client = wechatMp,
  storeApi = store,
  uploadDir = UPLOAD_DIR,
  author = String(process.env.WECHAT_MP_AUTHOR || '').trim(),
  now = () => new Date().toISOString()
} = {}) {
  const busy = new Set()
  async function exclusive(id, operation) {
    const primaryId = storeApi.findContentPost(id)?.id || id
    if (busy.has(primaryId)) throw httpError(409, '该资讯正在处理，请稍后刷新')
    busy.add(primaryId)
    try {
      return await operation()
    } finally {
      busy.delete(primaryId)
    }
  }

  async function createDraft(id, format = 'news', replaceUncertainDraftId) {
    const post = storeApi.findContentPost(id)
    if (!post) throw httpError(404, '政策资讯不存在')
    if (post.type !== 'news') throw httpError(400, '只有政策资讯可以发布到公众号')
    if (!['news', 'newspic'].includes(format)) throw httpError(400, '不支持的草稿格式')
    const previous = post.wechat || {}
    if (isImported(previous)) throw httpError(409, '这篇资讯已从公众号导入')
    if (previous.publishId && previous.publishStatus === 1) throw httpError(409, '微信正在发表，请先查询结果')
    if (previous.submissionPending && replaceUncertainDraftId !== previous.draftMediaId) {
      throw httpError(409, '上次提交结果待核实，请先核对公众号发表记录')
    }

    validatePostBeforeUpload(post, uploadDir, author, format)
    const sourceUrl = httpsUrl(post.originalUrl, '政府原文链接')

    const draft = format === 'newspic' ? await createPictureDraft(post) : await createArticleDraft(post, sourceUrl)
    const { history = [], ...oldState } = storeApi.findContentPost(id).wechat || {}
    const updated = storeApi.updateContentWechat(id, {
      draftMediaId: draft.mediaId,
      draftFormat: format,
      draftCreatedAt: now(),
      draftContentHash: contentPublicationHash(post),
      history: previous.publishId || previous.submissionPending ? [...history, oldState] : history,
      submissionPending: false, msgDataId: '', failIdx: [],
      publishId: '', publishStatus: null, publishSubmittedAt: '',
      articleId: '', publicationKey: '', articleUrls: [], lastCheckedAt: ''
    })
    return updated.wechat
  }

  async function createPictureDraft(post) {
    const images = [...new Set([post.coverImage, ...post.contentBlocks.filter(b => b.type === 'image').map(b => b.src)])]
    if (images.length > 20) throw httpError(400, '贴图最多包含20张图片（含封面）')
    const paragraphs = post.contentBlocks.map(block => {
      if (block.type === 'link') return [block.title, block.description, block.url].filter(Boolean).join('\n')
      return block.text || block.caption || ''
    })
    if (!paragraphs.some(Boolean)) paragraphs.push(post.summary || post.title)
    if (post.source) paragraphs.push(`来源：${post.source}`)
    if (post.originalUrl) paragraphs.push(post.originalUrl)
    const content = paragraphs.filter(Boolean).join('\n\n')
    const imageMediaIds = []
    for (const [index, src] of images.entries()) {
      const buffer = await jpegForWechat(src, `贴图第${index + 1}张图片`, uploadDir, 9 * 1024 * 1024)
      const image = await client.uploadPermanentImage({ buffer, filename: `picture-${index + 1}.jpg` })
      imageMediaIds.push(image.mediaId)
    }
    return client.addImageDraft({ title: post.title, content, imageMediaIds })
  }

  async function createArticleDraft(post, sourceUrl) {
    const cover = await jpegForWechat(post.coverImage, '公众号封面', uploadDir, 9 * 1024 * 1024)
    const [coverMaterial, content] = await Promise.all([
      client.uploadPermanentImage({ buffer: cover, filename: 'cover.jpg' }),
      articleContent(post, client, uploadDir)
    ])
    return client.addDraft({
      title: post.title,
      author,
      digest: post.summary,
      content,
      sourceUrl,
      thumbMediaId: coverMaterial.mediaId,
      needOpenComment: false,
      onlyFansCanComment: false
    })
  }

  async function publishDraft(id, reviewedMediaId) {
    const post = storeApi.findContentPost(id)
    if (!post) throw httpError(404, '政策资讯不存在')
    const state = post.wechat || {}
    if (!state.draftMediaId) throw httpError(400, '请先生成公众号草稿并在公众号后台预览')
    if (post.type !== 'news' || state.draftMediaId !== reviewedMediaId) throw httpError(409, '草稿已变更，请刷新列表并预览当前草稿')
    if (state.submissionPending) throw httpError(409, '上次提交结果待核实，请先核对公众号发表记录')
    if (state.draftContentHash !== contentPublicationHash(post)) {
      throw httpError(409, '政策资讯在草稿生成后已修改，请重新生成草稿并预览')
    }
    if (state.publishId) {
      throw httpError(409, '该草稿已有发表记录，请查询状态或重新生成草稿')
    }
    storeApi.updateContentWechat(id, { submissionPending: true, publishSubmittedAt: now() })
    let result
    try {
      result = await client.submitPublish(reviewedMediaId)
    } catch (error) {
      if (error.publishOutcomeUnknown) throw httpError(502, '微信提交结果待核实，请到公众号发表记录核对')
      storeApi.updateContentWechat(id, { submissionPending: false })
      throw error
    }
    const updated = storeApi.updateContentWechat(id, {
      publishId: result.publishId,
      submissionPending: false,
      msgDataId: result.msgDataId,
      publishStatus: 1,
      publishSubmittedAt: now(),
      articleId: '',
      articleUrls: [],
      lastCheckedAt: ''
    })
    return updated.wechat
  }

  async function syncStatus(id) {
    const post = storeApi.findContentPost(id)
    if (!post) throw httpError(404, '政策资讯不存在')
    const state = post.wechat || {}
    if (!state.publishId) throw httpError(400, '该政策资讯尚未提交公众号发布')
    const result = await client.getPublishStatus(state.publishId)
    const updated = storeApi.updateContentWechat(id, {
      publishStatus: [5, 6].includes(state.publishStatus) && ![5, 6].includes(result.status) ? state.publishStatus : result.status,
      articleId: result.articleId || state.articleId || '',
      articleUrls: result.articleUrls?.length ? result.articleUrls : state.articleUrls || [],
      failIdx: result.failIdx,
      lastCheckedAt: now()
    })
    return updated.wechat
  }

  return {
    createDraft: (id, format, replaceId) => exclusive(id, () => createDraft(id, format, replaceId)),
    publishDraft: (id, mediaId) => exclusive(id, () => publishDraft(id, mediaId)),
    syncStatus: id => exclusive(id, () => syncStatus(id)),
    deletePost: id => exclusive(id, () => {
      const state = storeApi.findContentPost(id)?.wechat
      if (state?.submissionPending || (state?.publishId && state.publishStatus === 1)) {
        throw httpError(409, '请先核对公众号发表结果再删除')
      }
      return storeApi.deleteContentPost(id)
    })
  }
}

export const wechatContentPublisher = createWechatContentPublisher()
