import * as store from '../store.js'
import crypto from 'node:crypto'
import { httpError } from '../lib/http.js'
import { carrierCode, carrierName, kdniaoConfigured, normalizeKdniaoQuery, queryKdniao, subscribeKdniao } from '../lib/kdniao.js'

const directQueryLimits = new Map()
const DIRECT_QUERY_INTERVAL_MS = 30_000
const MAX_REQUESTS_PER_WINDOW = 3
const MAX_TRACKED_USERS = 2000
const MAX_CONCURRENT_QUERIES = 32
let activeDirectQueries = 0

function verificationResult(trackingNo, code, options) {
  const requiredField = code === 'SF' && !options.phoneLast4 ? 'phoneLast4'
    : code === 'JD' && !options.jdCustomerCode ? 'jdCustomerCode' : ''
  if (!requiredField) return null
  const guidance = requiredField === 'phoneLast4'
    ? '顺丰查询需要验证手机号，请填写收件人或寄件人手机号后4位后重试'
    : '京东查询需要该包裹发件方的10位青龙商家编码，请向发件商家索取；不能填写收件人姓名或使用其他商家的编码'
  return { provider: 'kdniao', trackingNo, carrierCode: code, carrier: carrierName(code), status: '待补充验证信息', events: [], queryStatus: 'verification_required', requiredField, guidance, reason: guidance, latestDescription: guidance }
}

function noTrackingGuidance(code) {
  if (!code) return '暂未识别快递公司或未获取到轨迹，请手动选择快递公司后重试'
  return '该快递公司暂未返回物流轨迹，请核对单号和公司；刚发货的包裹可稍后再查，持续无轨迹请联系发件商家'
}

export async function queryLogisticsNumber(trackingNo, userId, input = {}) {
  const normalizedNo = String(trackingNo || '').replace(/\s+/g, '').trim()
  if (!/^[A-Za-z0-9-]{6,32}$/.test(normalizedNo)) throw httpError(400, '请输入正确的快递单号')
  if (/^(SYL|JF)\d{13}$/i.test(normalizedNo)) throw httpError(400, '这是平台订单号，请从自己的订单详情查看物流，或填写实际快递单号')
  if (!userId) throw httpError(401, '请先登录后查询物流')
  for (const field of ['carrierCode', 'phoneLast4', 'jdCustomerCode']) {
    if (input?.[field] != null && typeof input[field] !== 'string') throw httpError(400, '快递公司编码和验证信息须使用文本填写')
  }
  const options = {
    carrierCode: carrierCode('', input?.carrierCode),
    phoneLast4: String(input?.phoneLast4 || '').trim(),
    jdCustomerCode: String(input?.jdCustomerCode || '').trim()
  }
  if (options.carrierCode && !/^[A-Za-z0-9_-]{1,64}$/.test(options.carrierCode)) throw httpError(400, '快递公司编码须为1至64位字母、数字、下划线或连字符')
  if (options.phoneLast4 && !/^\d{4}$/.test(options.phoneLast4)) throw httpError(400, '请填写4位手机号尾号，不要填写完整手机号')
  if (options.jdCustomerCode && !/^[A-Za-z0-9]{10}$/.test(options.jdCustomerCode)) throw httpError(400, '京东青龙商家编码须为10位字母或数字，请向发件商家确认')
  const required = verificationResult(normalizedNo, options.carrierCode, options)
  if (required) return required
  if (!kdniaoConfigured()) throw httpError(503, '物流查询服务暂不可用，请联系平台客服')
  const now = Date.now()
  for (const [key, item] of directQueryLimits) if (!item.pending && now - item.windowStartedAt >= DIRECT_QUERY_INTERVAL_MS) directQueryLimits.delete(key)
  const key = String(userId)
  let limit = directQueryLimits.get(key)
  if (!limit) {
    if (directQueryLimits.size >= MAX_TRACKED_USERS) throw httpError(429, '物流查询较繁忙，请稍后再试')
    limit = { windowStartedAt: now, requests: 0, pending: false, cache: new Map() }
    directQueryLimits.set(key, limit)
  }
  // 验证信息只参与哈希，不作为明文缓存键；同请求30秒内复用结果，补填后使用不同键。
  const cacheKey = crypto.createHash('sha256').update(JSON.stringify({ trackingNo: normalizedNo, ...options })).digest('hex')
  if (limit.cache.has(cacheKey)) return structuredClone(limit.cache.get(cacheKey))
  if (limit.pending) throw httpError(429, '上一笔物流正在查询，请稍后再试')
  if (activeDirectQueries >= MAX_CONCURRENT_QUERIES) throw httpError(429, '物流查询较繁忙，请稍后再试')
  const beforeRequest = () => {
    if (limit.requests >= MAX_REQUESTS_PER_WINDOW) throw httpError(429, '查询过于频繁，请30秒后再试')
    limit.requests += 1
  }
  limit.pending = true
  activeDirectQueries += 1
  try {
    let result
    try {
      result = await queryKdniao({ orderId: '', trackingNo: normalizedNo, carrier: '', ...options, directQuery: true }, { beforeRequest })
    } catch (error) {
      const detectedCode = options.carrierCode || error.carrierCode || ''
      if (['verification', 'no_tracking'].includes(error.logisticsKind)) {
        const required = verificationResult(normalizedNo, detectedCode, options)
        if (required) { limit.cache.set(cacheKey, required); return structuredClone(required) }
        if (error.logisticsKind === 'no_tracking') result = { LogisticCode: normalizedNo, ShipperCode: detectedCode, Traces: [] }
        else throw error
      } else throw error
    }
    const item = Array.isArray(result.Data) ? result.Data[0] || {} : result
    const normalized = normalizeKdniaoQuery(item)
    normalized.trackingNo ||= normalizedNo
    normalized.carrierCode ||= options.carrierCode
    normalized.carrier ||= carrierName(normalized.carrierCode)
    const required = !normalized.events.length && verificationResult(normalizedNo, normalized.carrierCode, options)
    const response = required || {
      ...normalized, queryStatus: normalized.events.length ? 'ok' : 'no_tracking',
      reason: '', guidance: normalized.events.length ? '' : noTrackingGuidance(normalized.carrierCode)
    }
    if (!response.events.length) {
      response.reason = response.guidance
      response.latestDescription = response.guidance
    }
    limit.cache.set(cacheKey, response)
    return structuredClone(response)
  } finally {
    // 失败仍计入实际请求次数，避免通过错误单号/验证资料持续消耗第三方额度。
    limit.pending = false
    activeDirectQueries -= 1
  }
}

export async function subscribeOrderLogistics(order, orderType = 'order') {
  let shipment = store.registerLogisticsShipment(order, orderType)
  if (!shipment) return null
  if (!kdniaoConfigured()) return store.updateLogisticsSubscription(shipment.id, null, new Error('快递鸟未配置'))
  try {
    if (!shipment.carrierCode) {
      const detected = await queryKdniao(shipment)
      store.applyKdniaoTracking(detected, 'query')
      shipment = store.getLogisticsShipment(shipment.id)
    }
    const result = await subscribeKdniao(shipment)
    return store.updateLogisticsSubscription(shipment.id, result)
  } catch (error) {
    return store.updateLogisticsSubscription(shipment.id, null, error)
  }
}

export async function refreshLogisticsShipment(shipment) {
  if (!shipment) throw httpError(404, '物流记录不存在')
  if (!kdniaoConfigured()) throw httpError(503, '快递鸟未配置')
  const result = await queryKdniao(shipment)
  const [updated] = store.applyKdniaoTracking(result, 'query')
  return updated || shipment
}

export function startLogisticsRefreshJob() {
  if (!kdniaoConfigured()) return null
  const interval = Math.max(30 * 60_000, Number(process.env.LOGISTICS_REFRESH_INTERVAL_MS || 6 * 60 * 60_000))
  const timer = setInterval(async () => {
    for (const shipment of store.listActiveLogisticsShipments()) {
      try {
        await refreshLogisticsShipment(shipment)
      } catch (error) {
        store.updateLogisticsSubscription(shipment.id, null, error)
      }
    }
  }, interval)
  timer.unref()
  return timer
}
