import { Router } from 'express'
import * as store from '../store.js'
import { wrap } from '../lib/http.js'
import { adminAuth } from '../middleware/auth.js'

const router = Router()

router.get('/', adminAuth, wrap(() => store.listCouponsForAdmin()))
router.get('/:id/records', adminAuth, wrap((req) => store.listCouponRecords(req.params.id)))
router.post('/', adminAuth, wrap((req) => store.createCoupon(req.body)))
router.put('/:id', adminAuth, wrap((req) => store.updateCoupon(req.params.id, req.body)))
router.delete('/:id', adminAuth, wrap((req) => store.deleteCoupon(req.params.id)))

export default router
