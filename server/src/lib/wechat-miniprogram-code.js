import crypto from 'node:crypto'
import { httpError } from './http.js'

const TOKEN_URL = 'https://api.weixin.qq.com/cgi-bin/stable_token'
const CODE_URL = 'https://api.weixin.qq.com/wxa/getwxacodeunlimit'
const MAX_IMAGE_BYTES = 1024 * 1024
const IMAGE_TTL_MS = 15 * 60 * 1000
const MAX_CACHE_ENTRIES = 64
const MAX_CACHE_BYTES = 16 * 1024 * 1024
const MAX_PENDING_CODES = 32
const INVALID_TOKEN_CODES = new Set([40001, 40014, 42001])

function configuration() {
  const appId = String(process.env.WECHAT_APPID || '').trim()
  const secret = String(process.env.WECHAT_APP_SECRET || '').trim()
  const envVersion = String(process.env.WECHAT_CODE_ENV_VERSION || 'release').trim()
  if (!appId || !secret) throw httpError(503, '服务端未配置小程序 AppID 或 AppSecret，暂时无法生成推广码')
  if (!['release', 'trial', 'develop'].includes(envVersion)) throw httpError(503, '小程序码环境配置不正确')
  const timeout = Number(process.env.WECHAT_CODE_TIMEOUT_MS || 8000)
  const timeoutMs = Number.isFinite(timeout) && timeout >= 1000 && timeout <= 30000 ? timeout : 8000
  // 密钥轮换后不复用旧 token 或图片；缓存键不保存明文 AppSecret。
  const credentialKey = `${appId}:${crypto.createHash('sha256').update(secret).digest('hex')}`
  return { appId, secret, envVersion, timeoutMs, credentialKey }
}

function providerError(code) {
  const messages = {
    40001: '微信小程序凭证暂时不可用，请稍后重试',
    40014: '微信小程序凭证暂时不可用，请稍后重试',
    42001: '微信小程序凭证已过期，请稍后重试',
    40013: '小程序 AppID 配置不正确，请联系管理员',
    40125: '小程序 AppSecret 配置不正确，请联系管理员',
    40164: '请管理员检查微信接口 IP 白名单',
    41030: '小程序首页尚未发布，请管理员检查小程序版本',
    45009: '微信小程序码调用额度已用完，请稍后重试'
  }
  const error = httpError(502, messages[code] || '微信暂时无法生成小程序码，请稍后重试')
  error.wechatCode = Number(code)
  return error
}

function parseJson(buffer) {
  try { return JSON.parse(buffer.toString('utf8')) } catch { return null }
}

function imageType(buffer) {
  if (buffer.length >= 33
    && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    && buffer.readUInt32BE(8) === 13 && buffer.toString('ascii', 12, 16) === 'IHDR'
    && buffer.readUInt32BE(16) > 0 && buffer.readUInt32BE(20) > 0) return 'image/png'
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
    && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9) return 'image/jpeg'
  return ''
}

export function createWechatMiniProgramCodeClient({ fetchImpl = (...args) => globalThis.fetch(...args), now = () => Date.now() } = {}) {
  const tokens = new Map()
  const images = new Map()
  const pendingImages = new Map()
  let cacheBytes = 0

  async function request(url, body, cfg, byteLimit) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs)
    try {
      const response = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal })
      if (Number(response.headers.get('content-length') || 0) > byteLimit) {
        await response.body?.cancel()
        throw httpError(502, '微信返回的数据超过大小限制')
      }
      const chunks = []
      let size = 0
      if (response.body) {
        const reader = response.body.getReader()
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            size += value.byteLength
            if (size > byteLimit) {
              await reader.cancel()
              throw httpError(502, '微信返回的数据超过大小限制')
            }
            chunks.push(Buffer.from(value))
          }
        } finally { reader.releaseLock() }
      }
      return { ok: response.ok, buffer: Buffer.concat(chunks, size) }
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError' || error?.name === 'TimeoutError') throw httpError(504, '生成小程序码超时，请稍后重试')
      if (error?.status) throw error
      // 不向客户端透传网络错误 URL、access_token 或微信原始 errmsg。
      throw httpError(502, '微信服务暂时无法连接，请稍后重试')
    } finally { clearTimeout(timer) }
  }

  function tokenEntry(cfg) {
    let entry = tokens.get(cfg.credentialKey)
    if (!entry) {
      if (tokens.size >= 4) tokens.delete(tokens.keys().next().value)
      entry = { value: '', expiresAt: 0, pending: null }
      tokens.set(cfg.credentialKey, entry)
    }
    return entry
  }

  async function accessToken(cfg) {
    const entry = tokenEntry(cfg)
    if (entry.value && entry.expiresAt > now()) return entry.value
    if (entry.pending) return entry.pending
    entry.pending = (async () => {
      const { ok, buffer } = await request(TOKEN_URL, { grant_type: 'client_credential', appid: cfg.appId, secret: cfg.secret, force_refresh: false }, cfg, 64 * 1024)
      const result = parseJson(buffer)
      if (result?.errcode) throw providerError(result.errcode)
      const lifetime = Number(result?.expires_in)
      if (!ok || typeof result?.access_token !== 'string' || !result.access_token || !Number.isFinite(lifetime) || lifetime <= 0) throw httpError(502, '微信未返回有效的小程序凭证，请稍后重试')
      const ttl = Math.min(lifetime, 86400) * 1000
      entry.value = result.access_token
      entry.expiresAt = now() + ttl - Math.min(120000, ttl * 0.1)
      return entry.value
    })()
    try { return await entry.pending } finally { entry.pending = null }
  }

  async function generate(cfg, managerId) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const token = await accessToken(cfg)
      const { ok, buffer } = await request(`${CODE_URL}?access_token=${encodeURIComponent(token)}`, {
        page: 'pages/index/index', scene: `ref=${managerId}`, width: 430,
        check_path: cfg.envVersion === 'release', env_version: cfg.envVersion
      }, cfg, MAX_IMAGE_BYTES)
      const mimeType = imageType(buffer)
      if (ok && mimeType) return { imageBase64: buffer.toString('base64'), mimeType, envVersion: cfg.envVersion }
      const result = parseJson(buffer)
      if (result?.errcode) {
        if (attempt === 0 && INVALID_TOKEN_CODES.has(Number(result.errcode))) {
          const entry = tokenEntry(cfg)
          // 并发请求只失效自己使用过的 token，不覆盖其他请求刚刷新的凭证。
          if (entry.value === token) { entry.value = ''; entry.expiresAt = 0 }
          continue
        }
        throw providerError(result.errcode)
      }
      throw httpError(502, '微信未返回有效的小程序码图片，请稍后重试')
    }
  }

  function removeImage(key) {
    const item = images.get(key)
    if (item) { cacheBytes -= item.size; images.delete(key) }
  }

  return async function getManagerPromotionCode(managerId) {
    const id = String(managerId == null ? '' : managerId)
    if (!/^[A-Za-z0-9_-]{1,28}$/.test(id)) throw httpError(400, '主理人编号不正确')
    const cfg = configuration()
    const key = `${cfg.credentialKey}:${cfg.envVersion}:${id}`
    const cached = images.get(key)
    if (cached?.expiresAt > now()) {
      images.delete(key)
      images.set(key, cached)
      return { ...cached.value }
    }
    removeImage(key)
    if (pendingImages.has(key)) return { ...await pendingImages.get(key) }
    if (pendingImages.size >= MAX_PENDING_CODES) throw httpError(429, '小程序码生成请求较多，请稍后重试')
    const pending = generate(cfg, id).then(value => {
      for (const [cachedKey, item] of images) if (item.expiresAt <= now()) removeImage(cachedKey)
      const size = Buffer.byteLength(value.imageBase64)
      while (images.size >= MAX_CACHE_ENTRIES || cacheBytes + size > MAX_CACHE_BYTES) removeImage(images.keys().next().value)
      images.set(key, { value, size, expiresAt: now() + IMAGE_TTL_MS })
      cacheBytes += size
      return value
    })
    pendingImages.set(key, pending)
    try { return { ...await pending } } finally { pendingImages.delete(key) }
  }
}

export const getManagerPromotionCode = createWechatMiniProgramCodeClient()
