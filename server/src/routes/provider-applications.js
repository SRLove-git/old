import { Router } from 'express'
import * as store from '../store.js'
import { httpError, wrap } from '../lib/http.js'
import { passwordRecord } from '../lib/session.js'
import { adminAuth, requestUserId, requireUser } from '../middleware/auth.js'

const router = Router()

router.post('/', wrap((req) => {
  const userId = String(req.body?.userId || requestUserId(req)).trim()
  requireUser(req, userId)
  return store.applyProvider({ ...req.body, userId })
}))

router.get('/', adminAuth, wrap(() => store.get().providerApplications || []))

router.post('/:id/approve', adminAuth, wrap((req) => {
  const username = String(req.body?.username || '').trim().toLowerCase()
  const password = String(req.body?.password || '')
  const shopName = String(req.body?.shopName || '').trim()
  if (!/^[a-z0-9_]{4,24}$/.test(username)) throw httpError(400, '账号需为4-24位字母、数字或下划线')
  if (password.length < 8) throw httpError(400, '临时密码至少8位')
  const { password: ignoredPassword, ...approval } = req.body || {}
  return store.auditProvider(req.params.id, true, '', {
    ...approval,
    username,
    shopName,
    ...passwordRecord(password)
  })
}))

router.post('/:id/reject', adminAuth, wrap((req) => {
  return store.auditProvider(req.params.id, false, req.body?.reason)
}))

export default router
