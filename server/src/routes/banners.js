import { Router } from 'express'
import * as store from '../store.js'
import { wrap } from '../lib/http.js'
import { saveBannerMediaDataUrl } from '../lib/uploads.js'
import { adminAuth, isAdminRequest } from '../middleware/auth.js'

const router = Router()

router.get('/', wrap((req) => store.listBanners(isAdminRequest(req))))
router.post('/', adminAuth, wrap((req) => store.createBanner(req.body)))
router.put('/:id', adminAuth, wrap((req) => store.updateBanner(req.params.id, req.body)))
router.delete('/:id', adminAuth, wrap((req) => store.deleteBanner(req.params.id)))
router.post('/upload/media', adminAuth, wrap(async (req) => ({
  url: await saveBannerMediaDataUrl(req.body?.dataUrl, req.body?.mediaType)
})))

export default router
