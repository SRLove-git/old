import * as store from '../store.js'
import { httpError } from '../lib/http.js'
import { kdniaoConfigured, queryKdniao, subscribeKdniao } from '../lib/kdniao.js'

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
