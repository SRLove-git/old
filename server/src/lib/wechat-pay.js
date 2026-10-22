import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { httpError } from './http.js'

const DEFAULT_API_HOSTS = ['https://api.mch.weixin.qq.com', 'https://api2.mch.weixin.qq.com']
const DEFAULT_TIMEOUT_MS = 8_000

function required(name, value) {
  const result = String(value || '').trim()
  if (!result) throw httpError(503, `服务端未配置 ${name}，暂时无法发起真实微信支付`)
  return result
}

function readPem(name, inlineValue, filePath) {
  if (String(inlineValue || '').trim()) return String(inlineValue).replace(/\\n/g, '\n')
  const target = String(filePath || '').trim()
  if (!target) throw httpError(503, `服务端未配置 ${name}，暂时无法发起真实微信支付`)
  try {
    return fs.readFileSync(path.resolve(target), 'utf8')
  } catch {
    throw httpError(503, `${name}文件无法读取`)
  }
}

function optionalPem(name, inlineValue, filePath) {
  if (!String(inlineValue || '').trim() && !String(filePath || '').trim()) return ''
  return readPem(name, inlineValue, filePath)
}

function verificationKeys() {
  const keys = new Map()
  const add = (suffix = '') => {
    const serial = String(process.env[`WECHAT_PAY_PLATFORM_SERIAL${suffix}`] || '').trim()
    const publicKey = optionalPem(
      `WECHAT_PAY_PLATFORM_PUBLIC_KEY${suffix}`,
      process.env[`WECHAT_PAY_PLATFORM_PUBLIC_KEY${suffix}`],
      process.env[`WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH${suffix}`]
    )
    if (serial && publicKey) keys.set(serial, publicKey)
  }
  add()
  add('_PREVIOUS')
  return keys
}

function config({ verify = false } = {}) {
  const timeout = Number(process.env.WECHAT_PAY_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)
  const result = {
    appId: required('WECHAT_APPID', process.env.WECHAT_APPID),
    mchId: required('WECHAT_PAY_MCH_ID', process.env.WECHAT_PAY_MCH_ID),
    serialNo: required('WECHAT_PAY_CERT_SERIAL', process.env.WECHAT_PAY_CERT_SERIAL),
    privateKey: readPem('WECHAT_PAY_PRIVATE_KEY', process.env.WECHAT_PAY_PRIVATE_KEY, process.env.WECHAT_PAY_PRIVATE_KEY_PATH),
    apiV3Key: required('WECHAT_PAY_API_V3_KEY', process.env.WECHAT_PAY_API_V3_KEY),
    notifyUrl: required('WECHAT_PAY_NOTIFY_URL', process.env.WECHAT_PAY_NOTIFY_URL),
    timeoutMs: Number.isFinite(timeout) && timeout >= 1_000 && timeout <= 60_000 ? timeout : DEFAULT_TIMEOUT_MS,
    verifyKeys: new Map()
  }
  if (!/^https:\/\//i.test(result.notifyUrl)) throw httpError(503, 'WECHAT_PAY_NOTIFY_URL 必须是公网 HTTPS 地址')
  if (Buffer.byteLength(result.apiV3Key) !== 32) throw httpError(503, 'WECHAT_PAY_API_V3_KEY 必须为32字节')
  if (verify) {
    result.verifyKeys = verificationKeys()
    if (!result.verifyKeys.size) throw httpError(503, '服务端未配置微信支付平台证书或微信支付公钥，暂时无法验签')
  }
  return result
}

function nonce() {
  return crypto.randomBytes(16).toString('hex')
}

function rsaSign(message, privateKey) {
  return crypto.sign('RSA-SHA256', Buffer.from(message), privateKey).toString('base64')
}

function authorization(method, requestPath, body, cfg) {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const nonceStr = nonce()
  const message = `${method}\n${requestPath}\n${timestamp}\n${nonceStr}\n${body}\n`
  const signature = rsaSign(message, cfg.privateKey)
  return `WECHATPAY2-SHA256-RSA2048 mchid="${cfg.mchId}",nonce_str="${nonceStr}",timestamp="${timestamp}",serial_no="${cfg.serialNo}",signature="${signature}"`
}

function responseHeaders(response) {
  return {
    'wechatpay-timestamp': response.headers.get('wechatpay-timestamp'),
    'wechatpay-nonce': response.headers.get('wechatpay-nonce'),
    'wechatpay-signature': response.headers.get('wechatpay-signature'),
    'wechatpay-serial': response.headers.get('wechatpay-serial')
  }
}

function hasWechatSignature(headers) {
  return Boolean(headers['wechatpay-timestamp'] && headers['wechatpay-nonce'] && headers['wechatpay-signature'] && headers['wechatpay-serial'])
}

function verifyWithConfig(headers, rawBody, cfg) {
  const timestamp = String(headers['wechatpay-timestamp'] || '')
  const nonceStr = String(headers['wechatpay-nonce'] || '')
  const signature = String(headers['wechatpay-signature'] || '')
  const serial = String(headers['wechatpay-serial'] || '')
  const publicKey = cfg.verifyKeys.get(serial)
  if (!timestamp || !nonceStr || !signature || !publicKey) return false
  const timestampNumber = Number(timestamp)
  if (!Number.isFinite(timestampNumber) || Math.abs(Math.floor(Date.now() / 1000) - timestampNumber) > 300) return false
  return crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${timestamp}\n${nonceStr}\n${rawBody}\n`),
    publicKey,
    Buffer.from(signature, 'base64')
  )
}

function parseResponse(raw) {
  if (!raw) return {}
  try { return JSON.parse(raw) } catch { return { message: raw } }
}

function apiHosts() {
  const configured = String(process.env.WECHAT_PAY_API_HOSTS || '')
    .split(',')
    .map((item) => item.trim().replace(/\/$/, ''))
    .filter((item) => /^https:\/\//i.test(item))
  return configured.length ? [...new Set(configured)] : DEFAULT_API_HOSTS
}

function apiFailure(status, result, requestId, indeterminate = false) {
  const message = result?.message || result?.detail?.issue || `微信支付请求失败(${status})`
  const error = httpError(502, message)
  error.wechatStatus = status
  error.wechatCode = String(result?.code || '')
  error.requestId = String(requestId || '')
  error.indeterminate = Boolean(indeterminate)
  return error
}

function logRequest({ ok, method, requestPath, status, requestId, code, host, contextId }) {
  const level = ok ? 'info' : 'error'
  console[level]('[wechat-pay]', {
    contextId: String(contextId || ''),
    method,
    requestPath,
    status,
    requestId: requestId || '',
    code: code || '',
    host
  })
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function apiRequest(method, requestPath, payload, { contextId = '', extraHeaders = {} } = {}) {
  const cfg = config({ verify: true })
  const body = payload == null ? '' : JSON.stringify(payload)
  const hosts = apiHosts()
  let lastError = null

  for (let index = 0; index < hosts.length; index += 1) {
    const host = hosts[index]
    try {
      const response = await fetchWithTimeout(`${host}${requestPath}`, {
        method,
        headers: {
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...extraHeaders,
          Authorization: authorization(method, requestPath, body, cfg),
          'User-Agent': 'suiyueli-miniprogram/1.0'
        },
        body: body || undefined
      }, cfg.timeoutMs)
      const raw = await response.text()
      const result = parseResponse(raw)
      const headers = responseHeaders(response)
      const requestId = response.headers.get('request-id') || ''
      const signed = hasWechatSignature(headers)
      if (!signed || !verifyWithConfig(headers, raw, cfg)) {
        throw apiFailure(response.status, { code: 'INVALID_SIGNATURE', message: '微信支付应答验签失败' }, requestId, method !== 'GET')
      }
      logRequest({ ok: response.ok, method, requestPath, status: response.status, requestId, code: result?.code, host, contextId })
      if (response.ok) return result

      const retryable = response.status >= 500 && index < hosts.length - 1
      lastError = apiFailure(response.status, result, requestId, method !== 'GET' && response.status >= 500)
      if (!retryable) throw lastError
    } catch (error) {
      if (error?.wechatStatus && !(error.wechatStatus >= 500 && index < hosts.length - 1)) throw error
      const isLast = index === hosts.length - 1
      const failure = error?.wechatStatus
        ? error
        : apiFailure(0, { code: error?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR', message: error?.name === 'AbortError' ? '微信支付请求超时' : '微信支付网络请求失败' }, '', method !== 'GET')
      lastError = failure
      logRequest({ ok: false, method, requestPath, status: failure.wechatStatus || 0, requestId: failure.requestId, code: failure.wechatCode, host, contextId })
      if (isLast) throw failure
    }
  }
  throw lastError || apiFailure(0, { code: 'NETWORK_ERROR', message: '微信支付网络请求失败' }, '', method !== 'GET')
}

function rfc3339InChina(timestampMs) {
  const value = new Date(Number(timestampMs))
  if (!Number.isFinite(value.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(value).reduce((result, part) => ({ ...result, [part.type]: part.value }), {})
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+08:00`
}

export function paymentConfigured() {
  try {
    config({ verify: true })
    return true
  } catch {
    return false
  }
}

export function isWechatResultUnknown(error) {
  return Boolean(error?.indeterminate)
}

export async function createJsapiPayment({ outTradeNo, description, amountFen, openid, expiresAt }) {
  const totalFen = Number(amountFen)
  if (!Number.isInteger(totalFen) || totalFen < 1) throw httpError(400, '支付金额最低为0.01元，不能为0元')
  const cfg = config()
  const payload = {
    appid: cfg.appId,
    mchid: cfg.mchId,
    description: String(description || '岁悦里订单').slice(0, 127),
    out_trade_no: String(outTradeNo),
    notify_url: cfg.notifyUrl,
    amount: { total: totalFen, currency: 'CNY' },
    payer: { openid: required('微信用户 openid', openid) }
  }
  const timeExpire = rfc3339InChina(expiresAt)
  if (timeExpire) payload.time_expire = timeExpire
  const result = await apiRequest('POST', '/v3/pay/transactions/jsapi', payload, { contextId: outTradeNo })
  const packageValue = `prepay_id=${required('微信支付 prepay_id', result.prepay_id)}`
  const timeStamp = String(Math.floor(Date.now() / 1000))
  const nonceStr = nonce()
  return {
    timeStamp,
    nonceStr,
    package: packageValue,
    signType: 'RSA',
    paySign: rsaSign(`${cfg.appId}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`, cfg.privateKey)
  }
}

export async function queryWechatPayment(outTradeNo) {
  const cfg = config()
  const id = encodeURIComponent(String(outTradeNo))
  return apiRequest('GET', `/v3/pay/transactions/out-trade-no/${id}?mchid=${encodeURIComponent(cfg.mchId)}`, null, { contextId: outTradeNo })
}

export async function closeWechatPayment(outTradeNo) {
  const cfg = config()
  const id = encodeURIComponent(String(outTradeNo))
  return apiRequest('POST', `/v3/pay/transactions/out-trade-no/${id}/close`, { mchid: cfg.mchId }, { contextId: outTradeNo })
}

export async function createWechatRefund({ outTradeNo, outRefundNo, reason, refundFen, totalFen }) {
  const refund = Number(refundFen)
  const total = Number(totalFen)
  if (!Number.isInteger(refund) || refund < 1 || !Number.isInteger(total) || total < refund) {
    throw httpError(400, '退款金额不正确')
  }
  const cfg = config()
  return apiRequest('POST', '/v3/refund/domestic/refunds', {
    out_trade_no: String(outTradeNo),
    out_refund_no: String(outRefundNo),
    reason: String(reason || '订单退款').slice(0, 80),
    notify_url: String(process.env.WECHAT_PAY_REFUND_NOTIFY_URL || cfg.notifyUrl),
    amount: { refund, total, currency: 'CNY' }
  }, { contextId: outRefundNo })
}

export async function queryWechatRefund(outRefundNo) {
  const id = encodeURIComponent(String(outRefundNo))
  return apiRequest('GET', `/v3/refund/domestic/refunds/${id}`, null, { contextId: outRefundNo })
}

export function verifyWechatSignature(headers, rawBody) {
  return verifyWithConfig(headers, rawBody, config({ verify: true }))
}

export function decryptNotification(resource) {
  const cfg = config()
  if (!resource || resource.algorithm !== 'AEAD_AES_256_GCM') throw httpError(400, '不支持的微信支付通知加密算法')
  const encrypted = Buffer.from(String(resource.ciphertext || ''), 'base64')
  if (encrypted.length <= 16) throw httpError(400, '微信支付通知密文无效')
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(cfg.apiV3Key), Buffer.from(String(resource.nonce || '')))
  decipher.setAAD(Buffer.from(String(resource.associated_data || '')))
  decipher.setAuthTag(encrypted.subarray(encrypted.length - 16))
  const plain = Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()]).toString('utf8')
  return JSON.parse(plain)
}

export function assertNotificationMerchant(payment, options = {}) {
  const cfg = config()
  if (!payment?.mchid) throw httpError(400, '微信支付结果缺少商户号')
  if (options.requireAppId && !payment?.appid) throw httpError(400, '微信支付结果缺少 AppID')
  const appIdMismatch = payment.appid != null && String(payment.appid) !== cfg.appId
  if (appIdMismatch || String(payment.mchid) !== cfg.mchId) {
    throw httpError(400, '微信支付通知商户信息不匹配')
  }
}

// 商家转账复用同一套商户证书与 APIv3 配置，因此把底层签名/请求能力暴露给转账模块。
export const wechatPayConfig = config
export const wechatPayRequest = apiRequest

// 敏感字段（如收款人姓名）需要用微信支付公钥或平台证书加密后传输。
export function wechatPayPlatformKey() {
  const serial = String(process.env.WECHAT_PAY_PLATFORM_SERIAL || '').trim()
  const publicKey = optionalPem(
    'WECHAT_PAY_PLATFORM_PUBLIC_KEY',
    process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY,
    process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH
  )
  if (!serial || !publicKey) throw httpError(503, '服务端未配置微信支付公钥，无法加密转账收款人姓名')
  return { serial, publicKey }
}

export const __test = { authorization, verifyWithConfig, rfc3339InChina }
