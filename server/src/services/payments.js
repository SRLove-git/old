import * as store from '../store.js'
import { httpError } from '../lib/http.js'
import {
  assertNotificationMerchant,
  closeWechatPayment,
  createJsapiPayment,
  createWechatRefund,
  isWechatResultUnknown,
  paymentConfigured,
  queryWechatPayment,
  queryWechatRefund
} from '../lib/wechat-pay.js'

function prepayExpiry(record) {
  const deadline = Number(record?.payDeadline || record?.prepayExpiresAt || 0)
  // 已生成过截止时间的业务单必须一直复用，避免同一 out_trade_no 重试时改变 time_expire。
  return deadline > 0 ? deadline : Date.now() + 30 * 60 * 1000
}

async function createOrReusePayment(prepared, description) {
  const request = store.bindWechatPaymentRequest(prepared.id, {
    outTradeNo: prepared.id,
    description,
    amountFen: prepared.amountFen,
    openid: prepared.openid,
    expiresAt: prepared.expiresAt
  })
  const cached = store.cachedWechatPrepay(prepared.id)
  if (cached) return cached
  store.markWechatPaymentRequested(request.outTradeNo, request.expiresAt)
  try {
    const payment = await createJsapiPayment(request)
    store.saveWechatPrepay(request.outTradeNo, payment, request.expiresAt)
    return payment
  } catch (error) {
    if (!isWechatResultUnknown(error)) store.markWechatPaymentRequestFailed(prepared.id, error)
    throw error
  }
}

export async function requestOrderPayment(orderId, userId) {
  const prepared = store.prepareOrderPayment(orderId, userId)
  if (prepared.balanceOnly) {
    return { paid: true, balanceOnly: true, order: store.confirmBalanceOnlyPayment(orderId, userId) }
  }
  const payment = await createOrReusePayment({
    id: prepared.order.id,
    amountFen: prepared.amountFen,
    openid: prepared.openid,
    expiresAt: prepayExpiry(prepared.order)
  }, prepared.order.title)
  return { paid: false, orderId: prepared.order.id, payment }
}

export async function refreshWechatPayment(outTradeNo, { closeExpired = false } = {}) {
  const payment = await queryWechatPayment(outTradeNo)
  assertNotificationMerchant(payment, { requireAppId: true })
  if (!payment?.out_trade_no || String(payment.out_trade_no) !== String(outTradeNo)) {
    throw httpError(502, '微信支付查单结果的商户订单号不匹配')
  }
  store.markWechatPaymentQuery(outTradeNo, payment)
  if (payment.trade_state === 'SUCCESS') return store.confirmWechatPayment(outTradeNo, payment).record
  const database = store.get()
  const record = database.orders.find((item) => String(item.id) === String(outTradeNo))
    || (database.balanceRecharges || []).find((item) => String(item.id) === String(outTradeNo))
    || (database.managerApplications || []).find((item) => String(item.id) === String(outTradeNo))
  const expiresAt = Number(record?.payDeadline || record?.prepayExpiresAt || 0)
  if (closeExpired && expiresAt > 0 && Date.now() >= expiresAt && payment.trade_state === 'NOTPAY') {
    await closeWechatPayment(outTradeNo)
    return store.markWechatPaymentClosed(outTradeNo)
  }
  return record
}

export async function requestWechatRefund(order, reason, ratio = 1) {
  const prepared = store.prepareWechatRefund(order, reason, ratio)
  if (prepared.balanceOnly) return store.confirmBalanceRefund(prepared.order.id, reason, ratio).order
  try {
    const result = await createWechatRefund(prepared)
    return store.markWechatRefundRequested(prepared.order.id, prepared, result)
  } catch (error) {
    if (error?.wechatCode === 'RESOURCE_NOT_EXISTS') {
      const result = await createWechatRefund(prepared)
      return store.markWechatRefundRequested(prepared.order.id, prepared, result)
    }
    if (!isWechatResultUnknown(error)) throw error
    try {
      const result = await queryWechatRefund(prepared.outRefundNo)
      if (result.status === 'SUCCESS') return store.confirmWechatRefund(result).order
      return store.markWechatRefundRequested(prepared.order.id, prepared, result)
    } catch (queryError) {
      if (queryError?.wechatCode !== 'RESOURCE_NOT_EXISTS') throw queryError
      const result = await createWechatRefund(prepared)
      return store.markWechatRefundRequested(prepared.order.id, prepared, result)
    }
  }
}

export async function requestManagerApplicationRefund(applicationOrId, reason = '主理人申请未通过，原路退款') {
  const prepared = store.prepareManagerApplicationRefund(applicationOrId, reason)
  try {
    const result = await createWechatRefund(prepared)
    if (result.status === 'SUCCESS') return store.confirmWechatRefund(result).application
    return store.markManagerApplicationRefundRequested(prepared.application.id, prepared, result)
  } catch (error) {
    if (!isWechatResultUnknown(error)) throw error
    try {
      const result = await queryWechatRefund(prepared.outRefundNo)
      if (result.status === 'SUCCESS') return store.confirmWechatRefund(result).application
      return store.markManagerApplicationRefundRequested(prepared.application.id, prepared, result)
    } catch (queryError) {
      if (queryError?.wechatCode !== 'RESOURCE_NOT_EXISTS') throw queryError
      const result = await createWechatRefund(prepared)
      if (result.status === 'SUCCESS') return store.confirmWechatRefund(result).application
      return store.markManagerApplicationRefundRequested(prepared.application.id, prepared, result)
    }
  }
}

export async function rejectManagerApplication(applicationId, reason) {
  const application = store.rejectManagerApp(applicationId, reason)
  if (application?.paymentStatus !== '待退款') return application
  try {
    return await requestManagerApplicationRefund(application, reason || '主理人申请未通过，原路退款')
  } catch (error) {
    // 拒绝申请已经落库，退款失败由后台按原退款单继续查单/重试，避免管理员重复拒绝。
    return store.markManagerApplicationRefundError(application.id, error)
  }
}

async function reconcileWechatRefund(order) {
  const prepared = store.prepareWechatRefund(order, order.refundRequest?.reason || order.refundReason, order.refundRequest?.ratio ?? order.refundRatio ?? 1)
  try {
    const result = await queryWechatRefund(prepared.outRefundNo)
    if (result.status === 'SUCCESS') return store.confirmWechatRefund(result).order
    return store.markWechatRefundRequested(order.id, prepared, result)
  } catch (error) {
    const requestedAt = Date.parse(String(order.refundRequestedAt || '').replace(' ', 'T'))
    const resultStillUnknown = isWechatResultUnknown(error) || Number(error?.wechatStatus || 0) >= 500
    const retryApplication = error?.wechatCode === 'RESOURCE_NOT_EXISTS'
      || (resultStillUnknown && Number.isFinite(requestedAt) && Date.now() - requestedAt >= 60_000)
    if (!retryApplication) throw error
    const result = await createWechatRefund(prepared)
    return store.markWechatRefundRequested(order.id, prepared, result)
  }
}

async function reconcileManagerApplicationRefund(application) {
  const prepared = store.prepareManagerApplicationRefund(application, application.refundRequest?.reason)
  try {
    const result = await queryWechatRefund(prepared.outRefundNo)
    if (result.status === 'SUCCESS') return store.confirmWechatRefund(result).application
    return store.markManagerApplicationRefundRequested(application.id, prepared, result)
  } catch (error) {
    const requestedAt = Date.parse(String(application.refundRequestedAt || '').replace(' ', 'T'))
    const resultStillUnknown = isWechatResultUnknown(error) || Number(error?.wechatStatus || 0) >= 500
    const retryApplication = error?.wechatCode === 'RESOURCE_NOT_EXISTS'
      || (resultStillUnknown && Number.isFinite(requestedAt) && Date.now() - requestedAt >= 60_000)
    if (!retryApplication) throw error
    const result = await createWechatRefund(prepared)
    if (result.status === 'SUCCESS') return store.confirmWechatRefund(result).application
    return store.markManagerApplicationRefundRequested(application.id, prepared, result)
  }
}

export async function requestBalanceRechargePayment(rechargeId, userId) {
  const prepared = store.prepareBalanceRechargePayment(rechargeId, userId)
  const payment = await createOrReusePayment({
    id: prepared.recharge.id,
    amountFen: prepared.amountFen,
    openid: prepared.openid,
    expiresAt: prepayExpiry(prepared.recharge)
  }, '岁悦里账户余额充值')
  return { paid: false, rechargeId: prepared.recharge.id, payment }
}

export async function requestManagerApplicationPayment(applicationId, userId) {
  const prepared = store.prepareManagerApplicationPayment(applicationId, userId)
  const payment = await createOrReusePayment({
    id: prepared.application.id,
    amountFen: prepared.amountFen,
    openid: prepared.openid,
    expiresAt: prepayExpiry(prepared.application)
  }, '岁悦里主理人申请费用')
  return { paid: false, applicationId: prepared.application.id, payment }
}

let notificationWorkerRunning = false

export async function processPendingWechatNotifications() {
  if (notificationWorkerRunning) return
  notificationWorkerRunning = true
  try {
    for (const item of store.pendingWechatNotifications()) {
      store.updateWechatNotification(item.id, 'processing')
      try {
        if (item.eventType === 'TRANSACTION.SUCCESS' && item.resource?.trade_state === 'SUCCESS') {
          const result = store.confirmWechatPayment(item.resource.out_trade_no, item.resource)
          if (result?.requiresRefund) await requestWechatRefund(result.record, '订单支付时已取消或失效，自动原路退款', 1)
        } else if (item.eventType === 'REFUND.SUCCESS' && item.resource?.refund_status === 'SUCCESS') {
          store.confirmWechatRefund(item.resource)
        }
        store.updateWechatNotification(item.id, 'done')
      } catch (error) {
        store.updateWechatNotification(item.id, 'failed', error?.message)
      }
    }
  } finally {
    notificationWorkerRunning = false
  }
}

export function startWechatPaymentJob() {
  if (!paymentConfigured()) return null
  const run = async () => {
    await processPendingWechatNotifications()
    const records = [
      ...(store.get().orders || []),
      ...(store.get().balanceRecharges || []),
      ...(store.get().managerApplications || [])
    ].filter((item) => item.paymentStatus === 'USERPAYING').slice(0, 20)
    for (const record of records) {
      try { await refreshWechatPayment(record.id, { closeExpired: true }) } catch (error) {
        console.error('[wechat-pay-reconcile]', { outTradeNo: record.id, message: error?.message, requestId: error?.requestId || '' })
      }
    }
    const refunds = (store.get().orders || [])
      .filter((item) => ['CREATED', 'PROCESSING'].includes(item.refundRequestStatus) && item.refundRequest?.outRefundNo)
      .slice(0, 20)
    for (const order of refunds) {
      try { await reconcileWechatRefund(order) } catch (error) {
        console.error('[wechat-refund-reconcile]', { outRefundNo: order.outRefundNo, message: error?.message, requestId: error?.requestId || '' })
      }
    }
    const applicationRefunds = (store.get().managerApplications || [])
      .filter((item) => ['CREATED', 'PROCESSING'].includes(item.refundRequestStatus) && item.refundRequest?.outRefundNo)
      .slice(0, 20)
    for (const application of applicationRefunds) {
      try { await reconcileManagerApplicationRefund(application) } catch (error) {
        console.error('[wechat-manager-application-refund]', { outRefundNo: application.outRefundNo, message: error?.message, requestId: error?.requestId || '' })
      }
    }
  }
  const timer = setInterval(() => run().catch(() => {}), 30_000)
  timer.unref?.()
  setImmediate(() => run().catch(() => {}))
  return timer
}
