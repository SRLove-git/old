import express, { Router } from 'express'
import * as store from '../store.js'
import { httpError } from '../lib/http.js'
import { assertNotificationMerchant, decryptNotification, verifyWechatSignature } from '../lib/wechat-pay.js'
import { verifyKdniaoSignature } from '../lib/kdniao.js'
import { processPendingWechatNotifications } from '../services/payments.js'

const router = Router()

router.post('/payments/wechat/notify', express.raw({ type: 'application/json', limit: '1mb' }), (req, res) => {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : ''
    if (!rawBody || !verifyWechatSignature(req.headers, rawBody)) throw httpError(401, '微信支付通知验签失败')
    const notice = JSON.parse(rawBody)
    const payment = decryptNotification(notice.resource)
    assertNotificationMerchant(payment)
    store.enqueueWechatNotification(notice, payment)
    res.status(204).end()
    setImmediate(() => processPendingWechatNotifications().catch(() => {}))
  } catch (error) {
    res.status(error?.status || 400).json({ code: 'FAIL', message: error?.message || '微信支付通知处理失败' })
  }
})

router.post('/logistics/kdniao/callback', express.urlencoded({ extended: false, limit: '2mb' }), (req, res) => {
  const requestData = String(req.body?.RequestData || '')
  const requestType = String(req.body?.RequestType || '')
  const verified = verifyKdniaoSignature(requestData, req.body?.DataSign)
  let payload = null
  try { payload = requestData ? JSON.parse(requestData) : null } catch {}
  if (!verified || !payload) {
    store.recordLogisticsWebhook({ verified, processed: false, requestType, payload, error: '验签或报文解析失败' })
    return res.status(401).json({ Success: false, Reason: '验签失败' })
  }
  try {
    store.applyKdniaoTracking(payload, 'callback')
    store.recordLogisticsWebhook({ verified: true, processed: true, requestType, payload })
    return res.json({ EBusinessID: payload.EBusinessID || process.env.KDNIAO_EBUSINESS_ID || '', UpdateTime: new Date().toISOString(), Success: true, Reason: '' })
  } catch (error) {
    store.recordLogisticsWebhook({ verified: true, processed: false, requestType, payload, error: error.message })
    return res.status(500).json({ Success: false, Reason: error.message || '处理失败' })
  }
})

export default router
