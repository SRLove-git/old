import { Router } from 'express'
import * as store from '../store.js'
import { wrap } from '../lib/http.js'
import { adminAuth, isAdminRequest } from '../middleware/auth.js'

const router = Router()

router.get('/', wrap((req) => store.listReviews(isAdminRequest(req))))
router.put('/:id/visibility', adminAuth, wrap((req) => store.setReviewHidden(req.params.id, req.body?.hidden)))
router.put('/:id/reply', adminAuth, wrap((req) => store.replyReview(req.params.id, req.body?.reply)))
router.delete('/:id/reply', adminAuth, wrap((req) => store.deleteReviewReply(req.params.id)))
router.delete('/:id', adminAuth, wrap((req) => store.deleteReview(req.params.id)))

export default router
