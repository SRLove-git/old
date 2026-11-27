import crypto from 'node:crypto'
import { httpError } from './http.js'

const API_BASE = 'https://api.weixin.qq.com'
export const OFFICIAL_ACCOUNT_APPID = 'wx4ff9702f8188c0c0'
const TOKEN_URL = `${API_BASE}/cgi-bin/stable_token`
const INVALID_TOKEN_CODES = new Set([40001, 40014, 42001])
const MAX_ARTICLE_IMAGE_BYTES = 1024 * 1024
const MAX_PERMANENT_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_TITLE_CHARS = 32
const MAX_AUTHOR_CHARS = 16
const MAX_DIGEST_CHARS = 120
const MAX_CONTENT_CHARS = 20000
const MAX_CONTENT_BYTES = 1024 * 1024
const MAX_SOURCE_URL_BYTES = 1024
const MAX_IMAGE_DRAFT_IMAGES = 20
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

const PROVIDER_MESSAGES = {
  40001: '公众号 access_token 无效，请稍后重试',
  40014: '公众号 access_token 无效，请稍后重试',
  42001: '公众号 access_token 已过期，请稍后重试',
  40005: '图片格式不支持，请使用 JPG 或 PNG',
  40009: '图片尺寸或大小不符合公众号要求',
  40013: '公众号 AppID 配置不正确',
  40125: '公众号 AppSecret 配置不正确',
  40164: '调用接口的 IP 不在公众号 IP 白名单中，请先加入白名单',
  45009: '公众号接口调用额度已用完，请稍后重试',
  48001: '公众号未获得该接口权限，请在公众平台开发者中心检查“草稿箱/发布能力”',
  53503: '草稿未通过发布检查，请先检查标题、正文、封面和图片',
  53504: '该草稿需要在公众平台官网使用，不能通过接口直接发布',
  53505: '请先在公众平台官网手动保存草稿后再发布'
}

function providerError(code, message) {
  const error = httpError(502, PROVIDER_MESSAGES[code] || '公众号接口调用失败，请稍后重试')
  error.wechatCode = Number(code)
  error.wechatMessage = String(message || '')
  return error
}

function configuration(env) {
  const appId = String(env.WECHAT_MP_APPID || '').trim()
  const appSecret = String(env.WECHAT_MP_APPSECRET || '').trim()
  if (!appId || !appSecret) throw httpError(503, '未配置公众号 WECHAT_MP_APPID 或 WECHAT_MP_APPSECRET')
  if (appId !== OFFICIAL_ACCOUNT_APPID) throw httpError(503, '当前 AppID 与目标公众号「岁悦里文化科技」不匹配')
  const configuredTimeout = Number(env.WECHAT_MP_TIMEOUT_MS || 10000)
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout >= 1000 && configuredTimeout <= 30000
    ? configuredTimeout
    : 10000
  const credentialKey = `${appId}:${crypto.createHash('sha256').update(appSecret).digest('hex')}`
  return { appId, appSecret, timeoutMs, credentialKey }
}

function charLength(value) {
  return Array.from(String(value == null ? '' : value)).length
}

function byteLength(value) {
  return Buffer.byteLength(String(value == null ? '' : value), 'utf8')
}

function imageType(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return 'image/png'
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  return ''
}

function normalizeImage(input, maxBytes) {
  const buffer = input && input.buffer
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw httpError(400, '请提供图片文件')
  const contentType = imageType(buffer)
  if (!contentType) throw httpError(400, '图片格式不支持，请使用 JPG 或 PNG')
  if (buffer.length >= maxBytes) throw httpError(400, `图片不能超过 ${Math.floor(maxBytes / 1024 / 1024)}MB`)
  const rawName = String(input.filename || '').trim().split(/[\\/]/).pop() || 'image'
  const extension = contentType === 'image/png' ? '.png' : '.jpg'
  return {
    buffer,
    contentType,
    filename: `${rawName.replace(/\.[^.]+$/, '') || 'image'}${extension}`
  }
}

function draftPayload(article = {}) {
  const title = String(article.title || '').trim()
  const author = String(article.author || '').trim()
  const digest = String(article.digest || '').trim()
  const content = String(article.content || '').trim()
  const sourceUrl = String(article.sourceUrl || '').trim()
  const thumbMediaId = String(article.thumbMediaId || '').trim()

  if (!title) throw httpError(400, '请填写公众号文章标题')
  if (charLength(title) > MAX_TITLE_CHARS) throw httpError(400, `公众号文章标题不能超过${MAX_TITLE_CHARS}个字`)
  if (charLength(author) > MAX_AUTHOR_CHARS) throw httpError(400, `公众号文章作者不能超过${MAX_AUTHOR_CHARS}个字`)
  if (charLength(digest) > MAX_DIGEST_CHARS) throw httpError(400, `公众号文章摘要不能超过${MAX_DIGEST_CHARS}个字`)
  if (!content) throw httpError(400, '请填写公众号文章正文')
  if (charLength(content) >= MAX_CONTENT_CHARS) throw httpError(400, '公众号文章正文不能超过2万字符')
  if (byteLength(content) >= MAX_CONTENT_BYTES) throw httpError(400, '公众号文章正文不能超过1MB')
  if (!thumbMediaId) throw httpError(400, '请提供封面永久素材 media_id')
  if (byteLength(sourceUrl) > MAX_SOURCE_URL_BYTES) throw httpError(400, '公众号“阅读原文”地址不能超过1KB')

  const payload = {
    article_type: 'news',
    title,
    content,
    thumb_media_id: thumbMediaId,
    need_open_comment: article.needOpenComment ? 1 : 0,
    only_fans_can_comment: article.onlyFansCanComment ? 1 : 0
  }
  if (author) payload.author = author
  if (digest) payload.digest = digest
  if (sourceUrl) payload.content_source_url = sourceUrl
  return payload
}

function imageDraftPayload(article = {}) {
  const title = String(article.title || '').trim()
  const content = String(article.content || '').trim()
  const imageMediaIds = Array.isArray(article.imageMediaIds)
    ? article.imageMediaIds.map((value) => String(value || '').trim()).filter(Boolean)
    : []

  if (!title) throw httpError(400, '请填写公众号贴图标题')
  if (charLength(title) > MAX_TITLE_CHARS) throw httpError(400, `公众号贴图标题不能超过${MAX_TITLE_CHARS}个字`)
  if (!content) throw httpError(400, '请填写公众号贴图正文')
  if (charLength(content) >= MAX_CONTENT_CHARS) throw httpError(400, '公众号贴图正文不能超过2万字符')
  if (byteLength(content) >= MAX_CONTENT_BYTES) throw httpError(400, '公众号贴图正文不能超过1MB')
  if (!imageMediaIds.length) throw httpError(400, '请至少提供一张贴图永久素材')
  if (imageMediaIds.length > MAX_IMAGE_DRAFT_IMAGES) {
    throw httpError(400, `公众号贴图不能超过${MAX_IMAGE_DRAFT_IMAGES}张`)
  }

  return {
    article_type: 'newspic',
    title,
    content,
    image_info: {
      image_list: imageMediaIds.map((imageMediaId) => ({ image_media_id: imageMediaId }))
    },
    need_open_comment: article.needOpenComment ? 1 : 0,
    only_fans_can_comment: article.onlyFansCanComment ? 1 : 0
  }
}

export function createWechatMpClient({
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => Date.now(),
  env = process.env
} = {}) {
  const tokens = new Map()

  async function requestJson(url, options, cfg) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs)
    let response
    let body
    try {
      response = await fetchImpl(url, { ...options, signal: controller.signal })
      body = await response.text()
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') throw httpError(504, '调用微信接口超时，请稍后重试')
      throw httpError(502, '微信接口暂时无法连接，请稍后重试')
    } finally {
      clearTimeout(timer)
    }
    let data
    try {
      data = JSON.parse(body)
    } catch (error) {
      throw httpError(502, '微信接口返回格式不正确')
    }
    if (data && data.errcode) throw providerError(data.errcode, data.errmsg)
    if (!response.ok) throw httpError(502, `微信接口返回 HTTP ${response.status}`)
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw httpError(502, '微信接口返回格式不正确')
    return data
  }

  function tokenEntry(cfg) {
    let entry = tokens.get(cfg.credentialKey)
    if (!entry) {
      entry = { value: '', expiresAt: 0, pending: null }
      tokens.set(cfg.credentialKey, entry)
    }
    return entry
  }

  async function accessToken(cfg, { force = false } = {}) {
    const entry = tokenEntry(cfg)
    if (!force && entry.value && entry.expiresAt > now()) return entry.value
    if (entry.pending) return entry.pending
    entry.pending = (async () => {
      const data = await requestJson(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'client_credential',
          appid: cfg.appId,
          secret: cfg.appSecret,
          force_refresh: false
        })
      }, cfg)
      const lifetime = Number(data.expires_in)
      if (typeof data.access_token !== 'string' || !data.access_token || !Number.isFinite(lifetime) || lifetime <= 0) {
        throw httpError(502, '微信未返回有效的公众号 access_token')
      }
      const ttl = Math.min(lifetime, 86400) * 1000
      entry.value = data.access_token
      entry.expiresAt = now() + ttl - Math.min(120000, ttl * 0.1)
      return entry.value
    })().finally(() => { entry.pending = null })
    return entry.pending
  }

  async function withToken(cfg, task) {
    let token = await accessToken(cfg)
    try {
      return await task(token)
    } catch (error) {
      if (!INVALID_TOKEN_CODES.has(Number(error?.wechatCode))) throw error
      token = await accessToken(cfg, { force: true })
      return task(token)
    }
  }

  function configured() {
    return Boolean(String(env.WECHAT_MP_APPID || '').trim() && String(env.WECHAT_MP_APPSECRET || '').trim())
  }

  async function uploadArticleImage(input = {}) {
    const cfg = configuration(env)
    const image = normalizeImage(input, MAX_ARTICLE_IMAGE_BYTES)
    return withToken(cfg, async (token) => {
      const form = new FormData()
      form.append('media', new Blob([image.buffer], { type: image.contentType }), image.filename)
      const data = await requestJson(
        `${API_BASE}/cgi-bin/media/uploadimg?access_token=${encodeURIComponent(token)}`,
        { method: 'POST', body: form },
        cfg
      )
      const url = String(data.url || '')
      if (!/^https?:\/\//.test(url)) throw httpError(502, '微信未返回有效的正文图片地址')
      return { url }
    })
  }

  async function uploadPermanentImage(input = {}) {
    const cfg = configuration(env)
    const image = normalizeImage(input, MAX_PERMANENT_IMAGE_BYTES)
    return withToken(cfg, async (token) => {
      const form = new FormData()
      form.append('media', new Blob([image.buffer], { type: image.contentType }), image.filename)
      const data = await requestJson(
        `${API_BASE}/cgi-bin/material/add_material?access_token=${encodeURIComponent(token)}&type=image`,
        { method: 'POST', body: form },
        cfg
      )
      const mediaId = String(data.media_id || '')
      if (!mediaId) throw httpError(502, '微信未返回封面永久素材 media_id')
      return { mediaId, url: String(data.url || '') }
    })
  }

  async function requestAddDraft(payload) {
    const cfg = configuration(env)
    return withToken(cfg, async (token) => {
      const data = await requestJson(
        `${API_BASE}/cgi-bin/draft/add?access_token=${encodeURIComponent(token)}`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ articles: [payload] }) },
        cfg
      )
      const mediaId = String(data.media_id || '')
      if (!mediaId) throw httpError(502, '微信未返回草稿 media_id')
      return { mediaId }
    })
  }

  async function addDraft(article = {}) {
    return requestAddDraft(draftPayload(article))
  }

  async function addImageDraft(article = {}) {
    return requestAddDraft(imageDraftPayload(article))
  }

  async function submitPublish(mediaId) {
    const id = String(mediaId || '').trim()
    if (!id) throw httpError(400, '请提供草稿 media_id')
    const cfg = configuration(env)
    return withToken(cfg, async (token) => {
      let data
      try {
        data = await requestJson(
          `${API_BASE}/cgi-bin/freepublish/submit?access_token=${encodeURIComponent(token)}`,
          { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ media_id: id }) },
          cfg
        )
        if (data.publish_id == null || data.publish_id === '') throw httpError(502, '微信未返回发布任务 ID')
      } catch (error) {
        if (!error.wechatCode) error.publishOutcomeUnknown = true
        throw error
      }
      return { publishId: String(data.publish_id), msgDataId: String(data.msg_data_id || '') }
    })
  }

  async function getPublishStatus(publishId) {
    const id = String(publishId || '').trim()
    if (!id) throw httpError(400, '请提供发布任务 ID')
    const cfg = configuration(env)
    return withToken(cfg, async (token) => {
      const data = await requestJson(
        `${API_BASE}/cgi-bin/freepublish/get?access_token=${encodeURIComponent(token)}`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ publish_id: id }) },
        cfg
      )
      const status = data.publish_status
      if (!Number.isInteger(status) || status < 0) throw httpError(502, '微信未返回有效的发布状态')
      const items = Array.isArray(data.article_detail?.item) ? data.article_detail.item : []
      return {
        publishId: String(data.publish_id || id),
        status,
        articleId: String(data.article_id || ''),
        articleUrls: items.map((item) => String(item?.article_url || '')).filter(Boolean),
        failIdx: Array.isArray(data.fail_idx) ? data.fail_idx.map(Number) : []
      }
    })
  }

  async function listPublications(offset, count = 20) {
    const cfg = configuration(env)
    return withToken(cfg, async (token) => {
      const data = await requestJson(`${API_BASE}/cgi-bin/freepublish/batchget?access_token=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ offset, count, no_content: 0 })
      }, cfg)
      if (!Number.isInteger(data.total_count) || data.total_count < 0 || !Array.isArray(data.item)) {
        throw httpError(502, '微信发表记录格式异常')
      }
      return { total: data.total_count, items: data.item }
    })
  }

  return {
    configured,
    getAccessToken: async () => accessToken(configuration(env)),
    uploadArticleImage,
    uploadPermanentImage,
    addDraft,
    addImageDraft,
    listPublications,
    submitPublish,
    getPublishStatus
  }
}

export const wechatMp = createWechatMpClient()
