import { Router } from 'express'
import * as store from '../store.js'
import { wrap } from '../lib/http.js'
import { ADMIN_PERMISSION_GROUPS, MERCHANT_PERMISSION_GROUPS } from '../lib/permissions.js'
import { adminAuth, requireAdminPermission } from '../middleware/auth.js'

const router = Router()

router.use(adminAuth)

router.get('/me', wrap((req) => req.admin))
router.put('/password', wrap((req) => store.changeAdminPassword(req.admin.id, req.body?.oldPassword, req.body?.newPassword)))

router.get('/permission-options', requireAdminPermission('accounts.manage'), wrap(() => ({
  admin: ADMIN_PERMISSION_GROUPS,
  merchant: MERCHANT_PERMISSION_GROUPS
})))

router.get('/accounts', requireAdminPermission('accounts.manage'), wrap(() => store.listAdminAccounts()))
router.post('/accounts', requireAdminPermission('accounts.manage'), wrap((req) => store.createAdminAccount(req.body)))
router.put('/accounts/:id', requireAdminPermission('accounts.manage'), wrap((req) => store.updateAdminAccount(req.params.id, req.body, req.admin.id)))
router.put('/accounts/:id/password', requireAdminPermission('accounts.manage'), wrap((req) => store.changeAdminPassword(req.params.id, '', req.body?.newPassword, { force: true })))

router.get('/merchant-accounts', requireAdminPermission('accounts.manage'), wrap(() => store.listMerchantAccounts()))
router.put('/merchant-accounts/:id', requireAdminPermission('accounts.manage'), wrap((req) => store.updateMerchantAccount(req.params.id, req.body)))
router.put('/merchant-accounts/:id/password', requireAdminPermission('accounts.manage'), wrap((req) => store.resetMerchantPassword(req.params.id, req.body?.newPassword)))

export default router
