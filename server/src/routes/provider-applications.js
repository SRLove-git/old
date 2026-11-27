import { Router } from 'express'
import * as store from '../store.js'
import { wrap } from '../lib/http.js'
import { adminAuth, requestUserId, requireUser } from '../middleware/auth.js'

const router = Router()

router.post('/', wrap((req) => {
  const userId = String(req.body?.userId || requestUserId(req)).trim()
  requireUser(req, userId)
  return store.applyProvider({ ...req.body, userId })
}))

router.get('/', adminAuth, wrap(() => store.listProviderApplications()))

router.post('/:id/approve', adminAuth, wrap((req) => {
  const { username: _ignoredUsername, password: _ignoredPassword, ...approval } = req.body || {}
  return store.auditProvider(req.params.id, true, '', approval)
}))

router.post('/:id/reject', adminAuth, wrap((req) => {
  return store.auditProvider(req.params.id, false, req.body?.reason)
}))

export default router
