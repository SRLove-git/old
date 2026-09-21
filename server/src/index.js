import express from 'express'
import cors from 'cors'
import crypto from 'node:crypto'
import * as store from './store.js'

const app = express()
const PORT = process.env.PORT || 3000
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin-token'
const WECHAT_APPID = process.env.WECHAT_APPID || 'wx5d1ccdf824e45e73'
const WECHAT_APP_SECRET = process.env.WECHAT_APP_SECRET || ''
const SESSION_SECRET = process.env.SESSION_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'suiyueli-local-session-secret')
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60

app.use(cors())
app.use(express.json())

function adminAuth(req, res, next) {
  if (req.headers['x-admin-token'] !== ADMIN_TOKEN) {
    return res.status(401).json({ code: 401, message: '需要管理员权限' })
  }
  next()
}

// 公开接口上的可选管理端身份：Token 正确时返回全量数据（如主理人余额）
function isAdminRequest(req) {
  return req.headers['x-admin-token'] === ADMIN_TOKEN
}

function encodeSession(payload) {
  if (!SESSION_SECRET) throw httpError(503, '服务端未配置 SESSION_SECRET')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url')
  return `${body}.${signature}`
}

function decodeSession(token) {
  if (!token || !SESSION_SECRET) return null
  const [body, signature] = String(token).split('.')
  if (!body || !signature) return null
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url')
  const left = Buffer.from(signature)
  const right = Buffer.from(expected)
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (!payload.userId || !payload.exp || Number(payload.exp) <= Math.floor(Date.now() / 1000)) return null
    return payload
  } catch (e) {
    return null
  }
}

function sessionFromRequest(req) {
  const authorization = String((req.headers && req.headers.authorization) || '')
  if (!authorization.startsWith('Bearer ')) return null
  return decodeSession(authorization.slice(7).trim())
}

// 会员身份优先由签名会话解析；x-user-id 仅保留给非生产环境的历史联调。
function requestUserId(req) {
  const session = sessionFromRequest(req)
  if (session) return String(session.userId)
  const legacyAllowed = process.env.NODE_ENV !== 'production'
  const raw = legacyAllowed && ((req.headers && req.headers['x-user-id'])
    || (req.query && req.query.userId)
    || (req.body && req.body.userId))
  return String(raw == null ? '' : raw).trim()
}

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

// 会员数据只允许本人访问，管理端令牌可绕过
function requireUser(req, targetUserId) {
  if (isAdminRequest(req)) return true
  const caller = requestUserId(req)
  if (!caller) throw httpError(401, '登录已失效，请重新登录')
  if (String(targetUserId == null ? '' : targetUserId) !== caller) throw httpError(403, '无权访问其他会员的数据')
  return true
}

// 按订单归属校验（订单不存在时交给业务逻辑返回空）
function requireOrderOwner(req, orderId) {
  if (isAdminRequest(req)) return
  const order = store.get().orders.find((o) => String(o.id) === String(orderId))
  if (!order) return
  requireUser(req, order.userId)
}

// 按集合里的资源归属校验（报名人 / 地址）
function requireRowOwner(req, collection, id) {
  if (isAdminRequest(req)) return
  const row = (store.get()[collection] || []).find((r) => String(r.id) === String(id))
  if (!row) return
  requireUser(req, row.userId)
}

const wrap = (fn) => (req, res) => {
  try {
    const result = fn(req, res)
    if (result !== undefined) res.json({ code: 0, data: result })
  } catch (e) {
    const status = e && e.status ? e.status : 500
    res.status(status).json({ code: status, message: e.message })
  }
}

// 微信静默登录：小程序只提交 wx.login 得到的临时 code，AppSecret 始终只保留在服务端。
app.post('/api/auth/wechat', async (req, res) => {
  try {
    const code = String((req.body && req.body.code) || '').trim()
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
      if (!response.ok || result.errcode || !result.openid) {
        const message = result.errmsg || `微信登录失败(${response.status})`
        throw httpError(401, message)
      }
      openid = result.openid
      unionid = result.unionid || ''
    }
    const user = store.findOrCreateWechatCustomer(openid, unionid)
    const now = Math.floor(Date.now() / 1000)
    const token = encodeSession({ userId: user.id, iat: now, exp: now + SESSION_TTL_SECONDS })
    res.json({ code: 0, data: { token, expiresIn: SESSION_TTL_SECONDS, user } })
  } catch (e) {
    const status = e && e.status ? e.status : 500
    res.status(status).json({ code: status, message: e.message || '登录失败' })
  }
})

// 首页数据
app.get('/api/home', wrap(() => {
  const db = store.get()
  return {
    banners: db.banners,
    categories: db.categories,
    activities: db.activities,
    products: db.products || [],
    regions: store.listRegions({ enabledOnly: true }),
    contentPosts: store.listContentPosts({ publishedOnly: true }),
    config: db.config
  }
}))

// 分类管理（活动/资讯/视频通用）
app.get('/api/categories', wrap(() => store.getCategories()))
app.post('/api/categories', adminAuth, wrap((req) => store.createCategory(req.body)))
app.put('/api/categories/:id', adminAuth, wrap((req) => store.updateCategory(req.params.id, req.body)))
app.delete('/api/categories/:id', adminAuth, wrap((req) => store.deleteCategory(req.params.id)))

// 地区管理：历史关联不删除，停用后仅从前台筛选和新发布选项中隐藏
app.get('/api/regions', wrap((req) => store.listRegions({ enabledOnly: req.query.enabled === '1' })))
app.post('/api/regions', adminAuth, wrap((req) => store.createRegion(req.body)))
app.put('/api/regions/:id', adminAuth, wrap((req) => store.updateRegion(req.params.id, req.body)))

// 政务资讯与视频内容
app.get('/api/content-posts', wrap((req) => store.listContentPosts({ type: req.query.type, publishedOnly: req.query.published === '1' })))
app.get('/api/content-posts/:id', wrap((req) => store.listContentPosts().find((item) => String(item.id) === String(req.params.id))))
app.post('/api/content-posts', adminAuth, wrap((req) => store.createContentPost(req.body)))
app.put('/api/content-posts/:id', adminAuth, wrap((req) => store.updateContentPost(req.params.id, req.body)))
app.delete('/api/content-posts/:id', adminAuth, wrap((req) => store.deleteContentPost(req.params.id)))

// 活动/商品
app.get('/api/activities', wrap((req) => store.searchActivities(req.query.keyword, req.query.category)))
app.get('/api/activities/:id', wrap((req) => store.get().activities.find((a) => String(a.id) === String(req.params.id))))
app.post('/api/activities', adminAuth, wrap((req) => store.createActivity(req.body)))
app.put('/api/activities/:id', adminAuth, wrap((req) => store.updateActivity(req.params.id, req.body)))
app.delete('/api/activities/:id', adminAuth, wrap((req) => {
  const db = store.get()
  db.activities = db.activities.filter((a) => String(a.id) !== String(req.params.id))
  store.save()
  return { ok: true }
}))

// 商品
app.get('/api/products', wrap(() => store.listProducts()))
app.post('/api/products', adminAuth, wrap((req) => store.createProduct(req.body)))
app.put('/api/products/:id', adminAuth, wrap((req) => store.updateProduct(req.params.id, req.body)))
app.delete('/api/products/:id', adminAuth, wrap((req) => store.deleteProduct(req.params.id)))

// Banner 管理
app.get('/api/banners', wrap(() => store.get().banners))
app.post('/api/banners', adminAuth, wrap((req) => {
  const db = store.get()
  const banner = { id: Date.now(), ...req.body }
  db.banners.push(banner)
  store.save()
  return banner
}))
app.put('/api/banners/:id', adminAuth, wrap((req) => {
  const db = store.get()
  const b = db.banners.find((x) => String(x.id) === String(req.params.id))
  if (b) Object.assign(b, req.body)
  store.save()
  return b
}))
app.delete('/api/banners/:id', adminAuth, wrap((req) => {
  const db = store.get()
  db.banners = db.banners.filter((x) => String(x.id) !== String(req.params.id))
  store.save()
  return { ok: true }
}))

// 优惠券
// 优惠券含入会赠送券等归属某个会员的券，列表只对管理端开放（小程序走 /users/:id 取自己的券）
app.get('/api/coupons', adminAuth, wrap(() => store.get().coupons))
app.post('/api/coupons', adminAuth, wrap((req) => {
  const db = store.get()
  const coupon = { id: Date.now(), used: false, ...req.body }
  db.coupons.push(coupon)
  store.save()
  return coupon
}))
app.put('/api/coupons/:id', adminAuth, wrap((req) => {
  const db = store.get()
  const c = db.coupons.find((x) => String(x.id) === String(req.params.id))
  if (c) Object.assign(c, req.body)
  store.save()
  return c
}))
app.delete('/api/coupons/:id', adminAuth, wrap((req) => {
  const db = store.get()
  db.coupons = db.coupons.filter((x) => String(x.id) !== String(req.params.id))
  store.save()
  return { ok: true }
}))

// 报名人
app.get('/api/participants', wrap((req) => {
  const db = store.get()
  if (isAdminRequest(req)) return db.participants
  const userId = requestUserId(req)
  requireUser(req, userId)
  return db.participants.filter((p) => String(p.userId || '') === userId)
}))
app.post('/api/participants', wrap((req) => {
  const db = store.get()
  const userId = requestUserId(req)
  requireUser(req, userId)
  const p = { id: Date.now(), ...req.body, userId }
  db.participants.push(p)
  store.save()
  return p
}))
app.put('/api/participants/:id', wrap((req) => {
  requireRowOwner(req, 'participants', req.params.id)
  const db = store.get()
  const p = db.participants.find((x) => String(x.id) === String(req.params.id))
  if (p) Object.assign(p, req.body, { id: p.id, userId: p.userId })
  store.save()
  return p
}))
app.delete('/api/participants/:id', wrap((req) => {
  requireRowOwner(req, 'participants', req.params.id)
  const db = store.get()
  db.participants = db.participants.filter((x) => String(x.id) !== String(req.params.id))
  store.save()
  return { ok: true }
}))

// 收货地址
app.get('/api/addresses', wrap((req) => {
  const db = store.get()
  if (isAdminRequest(req)) return db.addresses
  const userId = requestUserId(req)
  requireUser(req, userId)
  return db.addresses.filter((a) => String(a.userId || '') === userId)
}))
app.post('/api/addresses', wrap((req) => {
  const db = store.get()
  const userId = requestUserId(req)
  requireUser(req, userId)
  const a = { id: `addr${Date.now()}`, ...req.body, userId }
  db.addresses.push(a)
  store.save()
  return a
}))
app.put('/api/addresses/:id', wrap((req) => {
  requireRowOwner(req, 'addresses', req.params.id)
  const db = store.get()
  const a = db.addresses.find((x) => String(x.id) === String(req.params.id))
  if (!a) return null
  Object.assign(a, req.body, { id: a.id, userId: a.userId })
  if (a.isDefault) {
    db.addresses.forEach((x) => {
      if (String(x.id) !== String(a.id) && x.userId === a.userId) x.isDefault = false
    })
  }
  store.save()
  return a
}))
app.delete('/api/addresses/:id', wrap((req) => {
  requireRowOwner(req, 'addresses', req.params.id)
  const db = store.get()
  db.addresses = db.addresses.filter((x) => String(x.id) !== String(req.params.id))
  store.save()
  return { ok: true }
}))

// 订单
app.get('/api/orders', wrap((req) => {
  store.autoCancelExpired()
  const db = store.get()
  if (isAdminRequest(req)) return db.orders
  const userId = requestUserId(req)
  requireUser(req, userId)
  return db.orders.filter((o) => String(o.userId || '') === userId)
}))
app.get('/api/orders/code/:code', adminAuth, wrap((req) => store.getOrderByCode(req.params.code)))
app.get('/api/orders/:id', wrap((req) => {
  requireOrderOwner(req, req.params.id)
  store.autoCancelExpired()
  return store.get().orders.find((o) => o.id === req.params.id)
}))
app.post('/api/orders', wrap((req) => {
  const userId = String((req.body && req.body.userId) || requestUserId(req)).trim()
  requireUser(req, userId)
  return store.createOrder({ ...req.body, userId })
}))
app.post('/api/orders/:id/pay', wrap((req) => {
  requireOrderOwner(req, req.params.id)
  return store.payOrder(req.params.id)
}))
app.post('/api/orders/:id/cancel', wrap((req) => {
  requireOrderOwner(req, req.params.id)
  return store.cancelOrder(req.params.id)
}))
app.post('/api/orders/:id/refund', wrap((req) => {
  requireOrderOwner(req, req.params.id)
  return store.refundOrder(req.params.id, req.body.reason)
}))
app.post('/api/orders/:id/refund-audit', adminAuth, wrap((req) => store.auditRefund(req.params.id, req.body.approve, req.body.reason)))
app.post('/api/orders/:id/verify', adminAuth, wrap((req) => store.verifyOrder(req.params.id)))
app.post('/api/orders/:id/advance', wrap((req) => {
  requireOrderOwner(req, req.params.id)
  return store.advanceOrder(req.params.id)
}))
app.post('/api/orders/:id/ship', adminAuth, wrap((req) => store.shipOrder(req.params.id, req.body || {})))
app.post('/api/orders/:id/review', wrap((req) => {
  requireOrderOwner(req, req.params.id)
  return store.submitReview(req.params.id, req.body)
}))
app.get('/api/orders/:id/refund-calc', wrap((req) => {
  requireOrderOwner(req, req.params.id)
  const order = store.get().orders.find((o) => o.id === req.params.id)
  return order ? store.calcRefund(order) : null
}))

// 评价
app.get('/api/reviews', wrap(() => store.get().reviews))
app.delete('/api/reviews/:id', adminAuth, wrap((req) => {
  const db = store.get()
  db.reviews = db.reviews.filter((r) => r.id !== req.params.id)
  store.save()
  return { ok: true }
}))

// 主理人
app.get('/api/managers', wrap((req) => (isAdminRequest(req) ? store.listManagers() : store.listPublicManagers())))
app.get('/api/manager-applications', adminAuth, wrap(() => store.get().managerApplications))
app.post('/api/manager-applications', wrap((req) => {
  const userId = String((req.body && req.body.userId) || requestUserId(req)).trim()
  requireUser(req, userId)
  return store.applyManager({ ...req.body, userId })
}))
app.post('/api/manager-applications/:id/approve', adminAuth, wrap((req) => store.approveManagerApp(req.params.id)))
app.post('/api/manager-applications/:id/reject', adminAuth, wrap((req) => store.rejectManagerApp(req.params.id, req.body.reason)))
app.post('/api/managers/:id/status', adminAuth, wrap((req) => store.setManagerStatus(req.params.id, req.body.status)))

// 客户与归属
app.get('/api/customers', adminAuth, wrap(() => store.get().customers))
app.put('/api/customers/:id', adminAuth, wrap((req) => store.updateCustomer(req.params.id, req.body)))
app.get('/api/bindings', adminAuth, wrap(() => store.get().bindings))
app.post('/api/bindings/unbind', adminAuth, wrap((req) => store.unbindCustomer(req.body.customerId, req.body.reason)))
app.post('/api/bindings/rebind', adminAuth, wrap((req) => store.rebindCustomer(req.body.customerId, req.body.managerId, req.body.reason)))
app.get('/api/users/:id', wrap((req) => {
  requireUser(req, req.params.id)
  return store.getUserProfile(req.params.id)
}))
app.post('/api/members/join', wrap((req) => {
  const userId = String((req.body && req.body.userId) || requestUserId(req)).trim()
  requireUser(req, userId)
  return store.joinMember(userId)
}))
app.post('/api/cards/:id/checkin', wrap((req) => {
  const userId = requestUserId(req)
  requireUser(req, userId)
  return store.selfCheckInCard(req.params.id, userId, req.body)
}))
app.post('/api/cards/:id/makeup-checkin', adminAuth, wrap((req) => store.makeupCheckInCard(req.params.id, req.body)))
app.post('/api/customers/:id/bind', wrap((req) => {
  requireUser(req, req.params.id)
  return store.bindCustomerByCodeOrId(req.params.id, req.body.code, req.body.managerId, req.body.source)
}))
app.post('/api/customers/:id/unbind', wrap((req) => {
  requireUser(req, req.params.id)
  return store.unbindCustomerByUser(req.params.id, req.body.reason)
}))
app.post('/api/customers/:id/unbind-apply', wrap((req) => {
  requireUser(req, req.params.id)
  return store.applyUnbind(req.params.id, req.body.reason)
}))
app.get('/api/managers/:id/dashboard', wrap((req) => store.getManagerDashboard(req.params.id, {
  userId: isAdminRequest(req) ? req.query.userId : requestUserId(req),
  isAdmin: isAdminRequest(req)
})))

// 解绑申请
app.get('/api/unbind-applications', adminAuth, wrap(() => store.get().unbindApplications || []))
app.post('/api/unbind-applications/:id/approve', adminAuth, wrap((req) => store.auditUnbind(req.params.id, true)))
app.post('/api/unbind-applications/:id/reject', adminAuth, wrap((req) => store.auditUnbind(req.params.id, false, req.body.reason)))

// 服务商申请
app.post('/api/provider-applications', wrap((req) => {
  const userId = String((req.body && req.body.userId) || requestUserId(req)).trim()
  requireUser(req, userId)
  return store.applyProvider({ ...req.body, userId })
}))
app.get('/api/provider-applications', adminAuth, wrap(() => store.get().providerApplications || []))
app.post('/api/provider-applications/:id/approve', adminAuth, wrap((req) => store.auditProvider(req.params.id, true)))
app.post('/api/provider-applications/:id/reject', adminAuth, wrap((req) => store.auditProvider(req.params.id, false, req.body.reason)))

// 佣金
app.get('/api/commissions', adminAuth, wrap(() => store.get().commissions))
app.get('/api/commission-settlements', adminAuth, wrap((req) => store.getSettlementRecords(req.query.managerId)))
app.post('/api/commissions/settle', adminAuth, wrap((req) => store.settleCommissions(req.body || {})))
app.post('/api/commissions/:id/adjust', adminAuth, wrap((req) => store.adjustCommission(req.params.id, req.body.amount, req.body.reason)))

// 提现
app.get('/api/withdraws', adminAuth, wrap(() => store.get().withdraws))
app.post('/api/withdraws', wrap((req) => {
  const managerId = req.body.managerId
  // 只能为绑定了自己的主理人账号发起提现，避免替别人锁单
  if (!isAdminRequest(req)) {
    const caller = requestUserId(req)
    if (!caller) throw httpError(401, '登录已失效，请重新登录')
    const own = store.findManagerByUser(caller)
    if (!own || String(own.id) !== String(managerId)) throw httpError(403, '只能为自己的主理人账号发起提现')
  }
  return store.applyWithdraw(managerId, req.body.amount, { source: req.body.source })
}))
app.post('/api/withdraws/:id/approve', adminAuth, wrap((req) => store.approveWithdraw(req.params.id)))
app.post('/api/withdraws/:id/reject', adminAuth, wrap((req) => store.rejectWithdraw(req.params.id, req.body.reason)))

// 配置
app.get('/api/config', wrap(() => store.get().config))
app.put('/api/config', adminAuth, wrap((req) => {
  const db = store.get()
  db.config = { ...db.config, ...req.body }
  store.save()
  return db.config
}))

// 统计
app.get('/api/stats/dashboard', adminAuth, wrap(() => store.dashboardStats()))
app.get('/api/logs', adminAuth, wrap(() => store.getLogs()))

// 私域直播
app.get('/api/lives', wrap((req) => store.listLives(isAdminRequest(req) ? req.query.userId : (requestUserId(req) || null))))
app.post('/api/lives/:id/purchase', wrap((req) => {
  const userId = String((req.body && req.body.userId) || requestUserId(req)).trim()
  requireUser(req, userId)
  return store.purchaseLive(req.params.id, userId)
}))
app.post('/api/lives', adminAuth, wrap((req) => store.createLive(req.body)))
app.put('/api/lives/:id', adminAuth, wrap((req) => store.updateLive(req.params.id, req.body)))
app.delete('/api/lives/:id', adminAuth, wrap((req) => store.deleteLive(req.params.id)))

app.use((req, res) => res.status(404).json({ code: 404, message: '接口不存在' }))

store.init()
app.listen(PORT, () => {
  console.log(`岁悦里后端已启动：http://127.0.0.1:${PORT}`)
  console.log(`管理员 Token：${ADMIN_TOKEN}`)
  console.log(`微信登录 AppID：${WECHAT_APPID}（AppSecret ${WECHAT_APP_SECRET ? '已配置' : '未配置'}）`)
})
