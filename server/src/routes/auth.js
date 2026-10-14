import crypto from 'node:crypto'
import { Router } from 'express'
import * as store from '../store.js'
import { httpError, wrap } from '../lib/http.js'
import { encodeSession, SESSION_TTL_SECONDS } from '../lib/session.js'

const router = Router()
const WECHAT_APPID = process.env.WECHAT_APPID || 'wx5d1ccdf824e45e73'
const WECHAT_APP_SECRET = process.env.WECHAT_APP_SECRET || ''

router.post('/admin/login', wrap((req) => {
  const username = String(req.body?.username || '').trim()
  const password = String(req.body?.password || '')
  if (!username || !password) throw httpError(400, '请输入账号和密码')
  const account = store.authenticateAdmin(username, password)
  if (!account) throw httpError(401, '账号或密码错误')
  const token = encodeSession({
    userId: account.id,
    accountId: account.id,
    role: 'admin',
    name: account.name,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
  })
  return { token, account }
}))

router.post('/auth/wechat', async (req, res) => {
  try {
    const code = String(req.body?.code || '').trim()
    if (!code) throw httpError(400, '缺少微信登录 code')
    let openid = ''
    let unionid = ''
    if (process.env.WECHAT_LOGIN_MOCK === 'true' && process.env.NODE_ENV !== 'production') {
      openid = `mock_${crypto.createHash('sha256').update(code).digest('hex').slice(0, 24)}`
    } else {
      if (!WECHAT_APP_SECRET) throw httpError(503, '服务端未配置 WECHAT_APP_SECRET')
      const params = new URLSearchParams({ appid: WECHAT_APPID, secret: WECHAT_APP_SECRET, js_code: code, grant_type: 'authorization_code' })
      const response = await fetch(`https://api.weixin.qq.com/sns/jscode2session?${params.toString()}`)
      const result = await response.json()
      if (!response.ok || result.errcode || !result.openid) throw httpError(401, result.errmsg || `微信登录失败(${response.status})`)
      openid = result.openid
      unionid = result.unionid || ''
    }
    const user = store.findOrCreateWechatCustomer(openid, unionid)
    const now = Math.floor(Date.now() / 1000)
    const token = encodeSession({ userId: user.id, iat: now, exp: now + SESSION_TTL_SECONDS })
    res.json({ code: 0, data: { token, expiresIn: SESSION_TTL_SECONDS, user } })
  } catch (error) {
    const status = error?.status || 500
    res.status(status).json({ code: status, message: error?.message || '登录失败' })
  }
})

export default router
