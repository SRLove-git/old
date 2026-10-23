import * as store from '../store.js'
import { httpError } from '../lib/http.js'
import { kdniaoConfigured, normalizeKdniaoQuery, queryKdniao, subscribeKdniao } from '../lib/kdniao.js'

const directQueryTimes = new Map()
const DIRECT_QUERY_INTERVAL_MS = 30_000

export async function queryLogisticsNumber(trackingNo, userId) {
  const normalizedNo = String(trackingNo || '').replace(/\s+/g, '').trim()
  if (!/^[A-Za-z0-9-]{6,32}$/.test(normalizedNo)) throw httpError(400, '请输入正确的快递单号')
  if (!kdniaoConfigured()) throw httpError(503, '物流查询服务暂不可用')

  const throttleKey = String(userId || '')
  const lastQueryAt = directQueryTimes.get(throttleKey) || 0
  if (lastQueryAt && Date.now() - lastQueryAt < DIRECT_QUERY_INTERVAL_MS) {
    throw httpError(429, '查询过于频繁，请稍后再试')
  }
  directQueryTimes.set(throttleKey, Date.now())

  try {
    const result = await queryKdniao({ orderId: '', trackingNo: normalizedNo, carrier: '', carrierCode: '' })
    return normalizeKdniaoQuery(result)
  } catch (error) {
    // 服务异常时不占用冷却时间，用户可以立即重试。
    directQueryTimes.delete(throttleKey)
    throw error
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
