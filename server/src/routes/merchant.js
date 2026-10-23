import { Router } from 'express'
import * as store from '../store.js'
import { httpError, wrap } from '../lib/http.js'
import { encodeSession, passwordMatches, SESSION_TTL_SECONDS } from '../lib/session.js'
import { saveCourseVideoDataUrl, saveImageDataUrl, saveVideoDataUrl } from '../lib/uploads.js'
import { merchantAuth, merchantSession, requireMerchantResource } from '../middleware/auth.js'

const router = Router()

router.post('/login', wrap((req) => {
  const username = String(req.body?.username || '').trim().toLowerCase()
  const password = String(req.body?.password || '')
  const account = store.get().merchantAccounts.find((item) => item.username === username)
  if (!account || account.status !== 1 || !passwordMatches(password, account)) throw httpError(401, '账号或密码错误')
  const token = encodeSession({
    userId: account.id,
    role: 'merchant',
    merchantId: account.merchantId,
    name: account.shopName,
    permissions: account.permissions || [],
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
  })
  return {
    token,
    merchant: {
      merchantId: account.merchantId,
      username: account.username,
      phone: account.phone,
      shopName: account.shopName,
      contactName: account.contactName,
      permissions: account.permissions || []
    }
  }
}))

router.get('/me', merchantAuth, wrap((req) => {
  const session = merchantSession(req)
  const account = store.get().merchantAccounts.find((item) => String(item.merchantId) === String(session.merchantId))
  if (!account) throw httpError(404, '商户账号不存在')
  return {
    merchantId: account.merchantId,
    username: account.username,
    phone: account.phone,
    shopName: account.shopName,
    contactName: account.contactName,
    permissions: account.permissions || []
  }
}))

router.get('/activities', merchantAuth, wrap((req) => store.listActivitiesForDisplay().filter((item) => String(item.managerId) === String(merchantSession(req).merchantId))))
router.post('/activities', merchantAuth, wrap((req) => store.createActivity({ ...req.body, publisherType: 'merchant', managerId: merchantSession(req).merchantId })))
router.put('/activities/:id', merchantAuth, wrap((req) => {
  requireMerchantResource(req, 'activities', req.params.id)
  return store.updateActivity(req.params.id, { ...req.body, publisherType: 'merchant', managerId: merchantSession(req).merchantId })
}))
router.delete('/activities/:id', merchantAuth, wrap((req) => {
  requireMerchantResource(req, 'activities', req.params.id)
  return store.deleteActivity(req.params.id)
}))

router.get('/products', merchantAuth, wrap((req) => store.listProducts().filter((item) => String(item.managerId) === String(merchantSession(req).merchantId))))
router.post('/products', merchantAuth, wrap((req) => store.createProduct({ ...req.body, publisherType: 'merchant', managerId: merchantSession(req).merchantId })))
router.put('/products/:id', merchantAuth, wrap((req) => {
  requireMerchantResource(req, 'products', req.params.id)
  return store.updateProduct(req.params.id, { ...req.body, publisherType: 'merchant', managerId: merchantSession(req).merchantId })
}))
router.delete('/products/:id', merchantAuth, wrap((req) => {
  requireMerchantResource(req, 'products', req.params.id)
  return store.deleteProduct(req.params.id)
}))

router.get('/courses', merchantAuth, wrap((req) => (store.get().lives || []).filter((item) => String(item.managerId) === String(merchantSession(req).merchantId))))
router.post('/courses', merchantAuth, wrap((req) => store.createLive({ ...req.body, managerId: merchantSession(req).merchantId })))
router.put('/courses/:id', merchantAuth, wrap((req) => {
  requireMerchantResource(req, 'lives', req.params.id)
  return store.updateLive(req.params.id, { ...req.body, managerId: merchantSession(req).merchantId })
}))
router.delete('/courses/:id', merchantAuth, wrap((req) => {
  requireMerchantResource(req, 'lives', req.params.id)
  return store.deleteLive(req.params.id)
}))

router.post('/uploads/image', merchantAuth, wrap(async (req) => {
  const merchantId = merchantSession(req).merchantId
  return { url: await saveImageDataUrl(req.body?.dataUrl, `merchant-${merchantId}`) }
}))

router.post('/uploads/video', merchantAuth, wrap((req) => {
  const merchantId = merchantSession(req).merchantId
  return { url: saveVideoDataUrl(req.body?.dataUrl, `merchant-${merchantId}`) }
}))

router.post('/uploads/course-video', merchantAuth, wrap((req) => {
  const merchantId = merchantSession(req).merchantId
  return { url: saveCourseVideoDataUrl(req.body?.dataUrl, `merchant-${merchantId}-course`, req.body?.fileName) }
}))

export default router
