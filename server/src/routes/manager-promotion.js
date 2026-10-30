import { Router } from 'express'
import * as store from '../store.js'
import { httpError, wrap } from '../lib/http.js'
import { sessionFromRequest } from '../lib/session.js'
import { getManagerPromotionCode } from '../lib/wechat-miniprogram-code.js'

const router = Router()

function requireOwnActiveManager(req) {
  const session = sessionFromRequest(req)
  if (!session || (session.role && session.role !== 'member')) throw httpError(401, '请先登录会员账号')
  const db = store.get()
  if (!db.customers.some(user => String(user.id) === String(session.userId))) throw httpError(401, '会员账号不存在，请重新登录')
  const manager = db.managers.find(item => String(item.id) === String(req.params.id))
  if (!manager) throw httpError(404, '主理人不存在')
  if (!manager.userId || String(manager.userId) !== String(session.userId)) throw httpError(403, '只能获取自己的主理人推广码')
  if (Number(manager.status) !== 1) throw httpError(403, '主理人账号已停用')
  return manager
}

router.get('/:id/promotion-code', wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store')
  const manager = requireOwnActiveManager(req)
  const image = await getManagerPromotionCode(manager.id)
  // 包括命中缓存的请求在内都校验身份；生成期间被停用也不继续返回图片。
  requireOwnActiveManager(req)
  return image
}))

export default router
