import { Router } from 'express'
import * as store from '../store.js'
import { wrap } from '../lib/http.js'
import { adminAuth } from '../middleware/auth.js'

const router = Router()

router.get('/', adminAuth, wrap(() => store.listCustomersForAdmin()))
router.get('/:id', adminAuth, wrap((req) => store.getCustomerAdminDetail(req.params.id)))
router.put('/:id', adminAuth, wrap((req) => store.updateCustomer(req.params.id, req.body)))

export default router
