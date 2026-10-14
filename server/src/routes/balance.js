import { Router } from 'express'
import * as store from '../store.js'
import { wrap } from '../lib/http.js'
import { requestUserId, requireUser } from '../middleware/auth.js'
import { refreshWechatPayment, requestBalanceRechargePayment } from '../services/payments.js'

const router = Router()

router.get('/transactions', wrap((req) => {
  const userId = requestUserId(req)
  requireUser(req, userId)
  return store.listBalanceTransactions(userId)
}))

router.post('/recharges', wrap((req) => {
  const userId = requestUserId(req)
  requireUser(req, userId)
  return store.createBalanceRecharge(userId, req.body?.amount)
}))

router.post('/recharges/:id/pay', wrap(async (req) => {
  const userId = requestUserId(req)
  requireUser(req, userId)
  return requestBalanceRechargePayment(req.params.id, userId)
}))

router.post('/recharges/:id/payment-status/refresh', wrap(async (req) => {
  const userId = requestUserId(req)
  requireUser(req, userId)
  const recharge = (store.get().balanceRecharges || []).find((item) => String(item.id) === String(req.params.id))
  if (!recharge || String(recharge.userId) !== String(userId)) return null
  return refreshWechatPayment(req.params.id)
}))

export default router
