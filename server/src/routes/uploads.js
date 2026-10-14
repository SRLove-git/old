import { Router } from 'express'
import { wrap } from '../lib/http.js'
import { saveCourseVideoDataUrl, saveImageDataUrl, saveVideoDataUrl } from '../lib/uploads.js'
import { adminAuth } from '../middleware/auth.js'

const router = Router()

router.use(adminAuth)
router.post('/image', wrap((req) => ({ url: saveImageDataUrl(req.body?.dataUrl) })))
router.post('/video', wrap((req) => ({ url: saveVideoDataUrl(req.body?.dataUrl) })))
router.post('/course-video', wrap((req) => ({
  url: saveCourseVideoDataUrl(req.body?.dataUrl, 'course-video', req.body?.fileName)
})))

export default router
