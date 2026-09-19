import express from 'express'
import cors from 'cors'
import * as store from './store.js'

const app = express()
const PORT = process.env.PORT || 3000
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin-token'

app.use(cors())
app.use(express.json())

function adminAuth(req, res, next) {
  if (req.headers['x-admin-token'] !== ADMIN_TOKEN) {
    return res.status(401).json({ code: 401, message: '需要管理员权限' })
  }
  next()
}

const wrap = (fn) => (req, res) => {
  try {
    const result = fn(req, res)
    if (result !== undefined) res.json({ code: 0, data: result })
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message })
  }
}

// 首页数据
app.get('/api/home', wrap(() => {
  const db = store.get()
  return {
    banners: db.banners,
    categories: db.categories,
    activities: db.activities,
    config: db.config
  }
}))

// 分类管理（活动/资讯/视频通用）
app.get('/api/categories', wrap(() => store.getCategories()))
app.post('/api/categories', adminAuth, wrap((req) => store.createCategory(req.body)))
app.put('/api/categories/:id', adminAuth, wrap((req) => store.updateCategory(req.params.id, req.body)))
app.delete('/api/categories/:id', adminAuth, wrap((req) => store.deleteCategory(req.params.id)))

// 活动/商品
app.get('/api/activities', wrap((req) => store.searchActivities(req.query.keyword, req.query.category)))
app.get('/api/activities/:id', wrap((req) => store.get().activities.find((a) => String(a.id) === String(req.params.id))))
app.post('/api/activities', adminAuth, wrap((req) => {
  const db = store.get()
  const activity = { id: Date.now(), soldCount: 0, hasSku: false, skus: [], schedules: [], ...req.body }
  db.activities.unshift(activity)
  store.save()
  return activity
}))
app.put('/api/activities/:id', adminAuth, wrap((req) => {
  const db = store.get()
  const idx = db.activities.findIndex((a) => String(a.id) === String(req.params.id))
  if (idx < 0) return null
  db.activities[idx] = { ...db.activities[idx], ...req.body, id: db.activities[idx].id }
  store.save()
  return db.activities[idx]
}))
app.delete('/api/activities/:id', adminAuth, wrap((req) => {
  const db = store.get()
  db.activities = db.activities.filter((a) => String(a.id) !== String(req.params.id))
  store.save()
  return { ok: true }
}))

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
app.get('/api/coupons', wrap(() => store.get().coupons))
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
app.get('/api/participants', wrap(() => store.get().participants))
app.post('/api/participants', wrap((req) => {
  const db = store.get()
  const p = { id: Date.now(), ...req.body }
  db.participants.push(p)
  store.save()
  return p
}))
app.put('/api/participants/:id', wrap((req) => {
  const db = store.get()
  const p = db.participants.find((x) => String(x.id) === String(req.params.id))
  if (p) Object.assign(p, req.body)
  store.save()
  return p
}))
app.delete('/api/participants/:id', wrap((req) => {
  const db = store.get()
  db.participants = db.participants.filter((x) => String(x.id) !== String(req.params.id))
  store.save()
  return { ok: true }
}))

// 收货地址
app.get('/api/addresses', wrap(() => store.get().addresses))
app.post('/api/addresses', wrap((req) => {
  const db = store.get()
  const a = { id: `addr${Date.now()}`, ...req.body }
  db.addresses.push(a)
  store.save()
  return a
}))

// 订单
app.get('/api/orders', wrap(() => {
  store.autoCancelExpired()
  return store.get().orders
}))
app.get('/api/orders/:id', wrap((req) => {
  store.autoCancelExpired()
  return store.get().orders.find((o) => o.id === req.params.id)
}))
app.post('/api/orders', wrap((req) => store.createOrder(req.body)))
app.post('/api/orders/:id/pay', wrap((req) => store.payOrder(req.params.id)))
app.post('/api/orders/:id/cancel', wrap((req) => store.cancelOrder(req.params.id)))
app.post('/api/orders/:id/refund', wrap((req) => store.refundOrder(req.params.id, req.body.reason)))
app.post('/api/orders/:id/refund-audit', adminAuth, wrap((req) => store.auditRefund(req.params.id, req.body.approve, req.body.reason)))
app.post('/api/orders/:id/advance', wrap((req) => store.advanceOrder(req.params.id)))
app.post('/api/orders/:id/review', wrap((req) => store.submitReview(req.params.id, req.body)))
app.get('/api/orders/:id/refund-calc', wrap((req) => {
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
app.get('/api/managers', wrap(() => store.get().managers))
app.get('/api/manager-applications', wrap(() => store.get().managerApplications))
app.post('/api/manager-applications', wrap((req) => store.applyManager(req.body)))
app.post('/api/manager-applications/:id/approve', adminAuth, wrap((req) => store.approveManagerApp(req.params.id)))
app.post('/api/manager-applications/:id/reject', adminAuth, wrap((req) => store.rejectManagerApp(req.params.id, req.body.reason)))
app.post('/api/managers/:id/status', adminAuth, wrap((req) => store.setManagerStatus(req.params.id, req.body.status)))

// 客户与归属
app.get('/api/customers', wrap(() => store.get().customers))
app.put('/api/customers/:id', adminAuth, wrap((req) => store.updateCustomer(req.params.id, req.body)))
app.get('/api/bindings', wrap(() => store.get().bindings))
app.post('/api/bindings/unbind', adminAuth, wrap((req) => store.unbindCustomer(req.body.customerId, req.body.reason)))
app.post('/api/bindings/rebind', adminAuth, wrap((req) => store.rebindCustomer(req.body.customerId, req.body.managerId, req.body.reason)))
app.get('/api/users/:id', wrap((req) => store.getUserProfile(req.params.id)))
app.post('/api/customers/:id/bind', wrap((req) => store.bindCustomerByCodeOrId(req.params.id, req.body.code, req.body.managerId, req.body.source)))
app.post('/api/customers/:id/unbind', wrap((req) => store.unbindCustomerByUser(req.params.id, req.body.reason)))
app.get('/api/managers/:id/dashboard', wrap((req) => store.getManagerDashboard(req.params.id)))

// 佣金
app.get('/api/commissions', wrap(() => store.get().commissions))
app.post('/api/commissions/settle', adminAuth, wrap(() => store.settleCommissions()))
app.post('/api/commissions/:id/adjust', adminAuth, wrap((req) => store.adjustCommission(req.params.id, req.body.amount, req.body.reason)))

// 提现
app.get('/api/withdraws', wrap(() => store.get().withdraws))
app.post('/api/withdraws', wrap((req) => store.applyWithdraw(req.body.managerId, req.body.amount)))
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
app.get('/api/stats/dashboard', wrap(() => store.dashboardStats()))
app.get('/api/logs', wrap(() => store.getLogs()))

app.use((req, res) => res.status(404).json({ code: 404, message: '接口不存在' }))

store.init()
app.listen(PORT, () => {
  console.log(`岁悦里后端已启动：http://127.0.0.1:${PORT}`)
  console.log(`管理员 Token：${ADMIN_TOKEN}`)
})
