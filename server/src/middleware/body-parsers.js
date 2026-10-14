import express from 'express'
import { adminSession, merchantAuth } from './auth.js'

function requireAdminSession(req, res, next) {
  if (!adminSession(req)) return res.status(401).json({ code: 401, message: '登录已失效，请重新登录' })
  next()
}

export function registerBodyParsers(app) {
  app.use('/api/uploads/course-video', requireAdminSession, express.json({ limit: '270mb' }))
  app.use('/api/merchant/uploads/course-video', merchantAuth, express.json({ limit: '270mb' }))
  app.use(['/api/uploads/image', '/api/uploads/video', '/api/banners/upload/media'], requireAdminSession, express.json({ limit: '25mb' }))
  app.use(['/api/merchant/uploads/image', '/api/merchant/uploads/video'], merchantAuth, express.json({ limit: '25mb' }))
  app.use(express.json({ limit: '5mb' }))
}
