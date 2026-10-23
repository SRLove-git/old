import { Router } from 'express'
import * as store from '../store.js'
import { httpError, wrap } from '../lib/http.js'
import { adminAuth, isAdminRequest, requestUserId, requireOrderOwner, requireUser } from '../middleware/auth.js'
import { queryLogisticsNumber, refreshLogisticsShipment, subscribeOrderLogistics } from '../services/logistics.js'
import { refreshWechatPayment, requestOrderPayment, requestWechatRefund } from '../services/payments.js'

const router = Router()

router.get('/', wrap((req) => {
  store.autoCancelExpired()
  const db = store.get()
  if (isAdminRequest(req)) return db.orders
  const userId = requestUserId(req)
  requireUser(req, userId)
  return db.orders.filter((order) => String(order.userId || '') === userId)
}))

router.get('/code/:code', adminAuth, wrap((req) => store.getOrderByCode(req.params.code)))
router.post('/logistics/query', wrap(async (req) => {
  const userId = requestUserId(req)
  requireUser(req, userId)
  return queryLogisticsNumber(req.body?.trackingNo, userId)
}))
router.get('/:id', wrap((req) => {
  requireOrderOwner(req, req.params.id)
  store.autoCancelExpired()
  return store.get().orders.find((order) => String(order.id) === String(req.params.id))
}))
router.post('/', wrap((req) => {
  const userId = String(req.body?.userId || requestUserId(req)).trim()
  requireUser(req, userId)
  return store.createOrder({ ...req.body, userId })
}))
router.post('/:id/pay', wrap(async (req) => {
  const userId = requestUserId(req)
  requireUser(req, userId)
  requireOrderOwner(req, req.params.id)
  return requestOrderPayment(req.params.id, userId)
}))
router.post('/:id/payment-status/refresh', wrap(async (req) => {
  requireOrderOwner(req, req.params.id)
  return refreshWechatPayment(req.params.id)
}))
router.post('/:id/cancel', wrap((req) => {
  requireOrderOwner(req, req.params.id)
  return store.cancelOrder(req.params.id)
}))
router.post('/:id/refund', wrap(async (req) => {
  requireOrderOwner(req, req.params.id)
  const result = store.refundOrder(req.params.id, req.body.reason)
  if (result.autoApprove && result.order) await requestWechatRefund(result.order, result.order.refundReason, result.order.refundRatio)
  return result
}))
router.post('/:id/refund-audit', adminAuth, wrap(async (req) => {
  if (!req.body.approve) return store.auditRefund(req.params.id, false, req.body.reason)
  const order = store.get().orders.find((item) => String(item.id) === String(req.params.id))
  if (!order) throw httpError(404, '订单不存在')
  const ratio = order.status === '退款中' && order.refundRatio != null ? Number(order.refundRatio) : 1
  return requestWechatRefund(order, req.body.reason || order.refundReason || '运营退款', ratio)
}))
router.post('/:id/verify', adminAuth, wrap((req) => store.verifyOrder(req.params.id)))
router.post('/:id/advance', wrap((req) => {
  requireOrderOwner(req, req.params.id)
  return store.advanceOrder(req.params.id)
}))
router.post('/:id/ship', adminAuth, wrap(async (req) => {
  const order = store.shipOrder(req.params.id, req.body || {})
  await subscribeOrderLogistics(order, 'order')
  return order
}))
router.get('/:id/logistics', wrap((req) => {
  requireOrderOwner(req, req.params.id)
  return store.getOrderLogistics(req.params.id, 'order')
}))
router.post('/:id/logistics/refresh', wrap(async (req) => {
  requireOrderOwner(req, req.params.id)
  const shipment = store.getOrderLogistics(req.params.id, 'order')
  if (!shipment) throw httpError(404, '暂无物流记录')
  const last = Date.parse(String(shipment.lastQueryAt || '').replace(' ', 'T'))
  if (Number.isFinite(last) && Date.now() - last < 30_000) throw httpError(429, '刷新过于频繁，请稍后再试')
  return refreshLogisticsShipment(shipment)
}))
router.post('/:id/review', wrap((req) => {
  requireOrderOwner(req, req.params.id)
  return store.submitReview(req.params.id, req.body)
}))
router.get('/:id/refund-calc', wrap((req) => {
  requireOrderOwner(req, req.params.id)
  const order = store.get().orders.find((item) => String(item.id) === String(req.params.id))
  return order ? store.calcRefund(order) : null
}))

export default router
