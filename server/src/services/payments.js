import * as store from '../store.js'
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
  const deadline = Number(record?.payDeadline || 0)
  return deadline > Date.now() ? deadline : Date.now() + 30 * 60 * 1000
}

async function createOrReusePayment(prepared, description) {
  const cached = store.cachedWechatPrepay(prepared.id)
  if (cached) return cached
  store.markWechatPaymentRequested(prepared.id, prepared.expiresAt)
  try {
    const payment = await createJsapiPayment({
      outTradeNo: prepared.id,
      description,
      amountFen: prepared.amountFen,
      openid: prepared.openid,
      expiresAt: prepared.expiresAt
    })
    store.saveWechatPrepay(prepared.id, payment, prepared.expiresAt)
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
  assertNotificationMerchant(payment)
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
  }
  const timer = setInterval(() => run().catch(() => {}), 30_000)
  timer.unref?.()
  setImmediate(() => run().catch(() => {}))
  return timer
}
