import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { seed } from './seed.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_FILE = path.join(__dirname, '..', 'data.json')

let db = null

function clone(v) {
  return JSON.parse(JSON.stringify(v))
}

export function init() {
  if (db) return db
  if (fs.existsSync(DATA_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
      return db
    } catch (e) {
      db = null
    }
  }
  db = clone(seed)
  save()
  return db
}

export function get() {
  return init()
}

export function save() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf8')
}

export function reset() {
  db = clone(seed)
  save()
  return db
}

function findManager(id) {
  return db.managers.find((m) => String(m.id) === String(id)) || null
}

function resolveRate(activity, manager) {
  if (activity && activity.managerCommissionRate) return Number(activity.managerCommissionRate)
  if (manager && manager.commissionRate) return Number(manager.commissionRate)
  return Number(db.config.globalCommissionRate || 8)
}

export function couponApplicable(coupon, activity, amount) {
  if (!coupon || coupon.used) return false
  if (coupon.expireAt && new Date(coupon.expireAt) < new Date()) return false
  if (coupon.minAmount && amount < coupon.minAmount) return false
  if (coupon.type === 3 && coupon.scopeCategory && activity.category !== coupon.scopeCategory) return false
  if (coupon.type === 4 && coupon.scopeProductId && String(activity.id) !== String(coupon.scopeProductId)) return false
  return true
}

export function scheduleDaysUntil(schedule) {
  if (!schedule || !schedule.full) return 999
  return Math.ceil((new Date(`${schedule.full}T00:00:00`).getTime() - Date.now()) / 86400000)
}

export function calcRefund(order) {
  const activity = db.activities.find((a) => String(a.id) === String(order.activityId))
  if (!activity) return { can: false, ratio: 0, amount: 0, reason: '活动不存在' }
  if (['已核销', '待评价', '已完成', '已退款', '已取消'].includes(order.status)) {
    return { can: false, ratio: 0, amount: 0, reason: '当前状态不可退款' }
  }
  const rule = activity.refundRule || {}
  if (rule.type === 'always') {
    return { can: true, ratio: 1, amount: Number(order.payAmount.toFixed(2)), reason: '未核销前可随时全额退款' }
  }
  const days = scheduleDaysUntil(order.schedule)
  if (rule.type === 'ladder') {
    const ladder = (rule.ladder || []).slice().sort((a, b) => b.days - a.days)
    for (const rung of ladder) {
      if (days >= rung.days) {
        if (rung.rate <= 0) return { can: false, ratio: 0, amount: 0, reason: '已进入不可退时段' }
        return { can: true, ratio: rung.rate, amount: Number((order.payAmount * rung.rate).toFixed(2)), reason: `距出发${days}天，可退${Math.round(rung.rate * 100)}%` }
      }
    }
    return { can: false, ratio: 0, amount: 0, reason: '已进入不可退时段' }
  }
  const fullDays = rule.fullDays || 0
  const partialDays = rule.partialDays || 0
  const partialRate = rule.partialRate || 0
  if (days >= fullDays) return { can: true, ratio: 1, amount: Number(order.payAmount.toFixed(2)), reason: `距开始${days}天，可全额退款` }
  if (days >= partialDays && partialRate > 0) return { can: true, ratio: partialRate, amount: Number((order.payAmount * partialRate).toFixed(2)), reason: `距开始不足${fullDays}天，可退${Math.round(partialRate * 100)}%` }
  return { can: false, ratio: 0, amount: 0, reason: '距开始时间过近，不可退款' }
}

function releaseSchedule(order) {
  const activity = db.activities.find((a) => String(a.id) === String(order.activityId))
  const schedule = activity && order.schedule ? activity.schedules.find((s) => s.id === order.schedule.id) : null
  if (schedule) {
    schedule.soldQuota = Math.max(0, (schedule.soldQuota || 0) - order.count)
    schedule.remaining = Math.max(0, schedule.totalQuota - schedule.soldQuota)
  }
}

function returnCoupon(order) {
  if (order.couponId) {
    const coupon = db.coupons.find((c) => c.id === order.couponId)
    if (coupon) coupon.used = false
  }
}

function generateCommission(order) {
  if (!order.managerId) return
  const manager = findManager(order.managerId)
  if (!manager) return
  const activity = db.activities.find((a) => String(a.id) === String(order.activityId))
  const rate = resolveRate(activity, manager)
  const amount = Number((order.payAmount * rate / 100).toFixed(2))
  order.commissionRate = rate
  order.commissionAmount = amount
  db.commissions.unshift({
    id: `CM${Date.now()}`,
    managerId: manager.id,
    orderId: order.id,
    customerId: order.userId,
    customerName: order.participants,
    productName: order.title,
    payAmount: order.payAmount,
    commissionRate: rate,
    commissionAmount: amount,
    status: '待结算',
    createTime: '刚刚'
  })
}

export function createOrder(payload) {
  const activity = db.activities.find((a) => String(a.id) === String(payload.activityId))
  if (!activity) return null
  const limit = activity.limitPerUser || 99
  if (payload.count > limit) throw new Error(`每人限购${limit}份`)
  const sku = activity.hasSku ? activity.skus.find((s) => s.id === payload.skuId) || activity.skus[0] : null
  const memberPrice = sku ? sku.memberPrice : activity.memberPrice
  const schedule = activity.schedules.find((s) => s.id === payload.scheduleId) || activity.schedules[0]
  if (schedule && schedule.remaining < payload.count) throw new Error('该时间段名额不足')
  let coupon = null
  let discount = 0
  if (payload.couponId) {
    coupon = db.coupons.find((c) => c.id === payload.couponId)
    if (!couponApplicable(coupon, activity, memberPrice * payload.count)) coupon = null
  }
  if (coupon) {
    discount = coupon.value
    coupon.used = true
  }
  const payAmount = Number((memberPrice * payload.count - discount).toFixed(2))
  const deferred = !!payload.deferred
  const order = {
    id: `SYL${Date.now()}`,
    userId: payload.userId || 'u1',
    activityId: activity.id,
    title: activity.title,
    category: activity.category,
    cover: activity.cover,
    coverTone: activity.coverTone,
    skuName: sku ? sku.name : '',
    schedule,
    participants: payload.participants,
    count: payload.count,
    memberPrice,
    payAmount,
    discount,
    address: payload.address || null,
    status: deferred ? '待付款' : '待发货',
    coupon: coupon ? coupon.title : '未使用',
    couponId: coupon ? coupon.id : null,
    code: `${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)}`,
    managerId: db.customers.find((c) => c.id === (payload.userId || 'u1'))?.managerId || null,
    commissionRate: 0,
    commissionAmount: 0,
    createdAt: '刚刚',
    payDeadline: deferred ? Date.now() + 30 * 60 * 1000 : null
  }
  db.orders.unshift(order)
  if (schedule) {
    schedule.soldQuota = (schedule.soldQuota || 0) + payload.count
    schedule.remaining = Math.max(0, schedule.totalQuota - schedule.soldQuota)
  }
  if (!deferred) generateCommission(order)
  save()
  return order
}

export function autoCancelExpired() {
  const now = Date.now()
  db.orders.forEach((o) => {
    if (o.status === '待付款' && o.payDeadline && now > o.payDeadline) {
      o.status = '已取消'
      releaseSchedule(o)
      returnCoupon(o)
    }
  })
  save()
}

export function payOrder(id) {
  const order = db.orders.find((o) => o.id === id)
  if (!order || order.status !== '待付款') return null
  order.status = '待发货'
  order.payDeadline = null
  generateCommission(order)
  save()
  return order
}

export function cancelOrder(id) {
  const order = db.orders.find((o) => o.id === id)
  if (!order || order.status !== '待付款') return null
  order.status = '已取消'
  releaseSchedule(order)
  returnCoupon(order)
  save()
  return order
}

export function refundOrder(id, reason) {
  const order = db.orders.find((o) => o.id === id)
  if (!order) return { order: null, error: '订单不存在' }
  const calc = calcRefund(order)
  if (!calc.can) return { order, error: calc.reason }
  order.status = '已退款'
  order.refundAmount = calc.amount
  order.refundReason = reason || '用户申请退款'
  releaseSchedule(order)
  const commission = db.commissions.find((c) => c.orderId === id)
  if (commission) {
    if (calc.ratio >= 1) commission.status = '已扣回'
    else commission.commissionAmount = Number((commission.commissionAmount * (1 - calc.ratio)).toFixed(2))
  }
  returnCoupon(order)
  save()
  return { order }
}

export function advanceOrder(id) {
  const order = db.orders.find((o) => o.id === id)
  if (!order) return null
  if (order.status === '待发货') order.status = order.category === 4 ? '已核销' : '待收货'
  else if (order.status === '待收货' || order.status === '已核销') order.status = '待评价'
  save()
  return order
}

export function submitReview(orderId, review) {
  const order = db.orders.find((o) => o.id === orderId)
  if (!order) return null
  order.status = '已完成'
  if (review && (review.content || review.rating)) {
    db.reviews.unshift({
      id: `RV${Date.now()}`,
      activityId: order.activityId,
      orderId,
      name: review.name || '用户',
      rating: review.rating || 5,
      content: review.content || '',
      time: '刚刚'
    })
  }
  save()
  return order
}

export function applyWithdraw(managerId, amount) {
  const record = { id: `WD${Date.now()}`, managerId, amount, status: '待审核', applyTime: '刚刚', payChannel: '微信零钱' }
  db.withdraws.unshift(record)
  db.commissions.forEach((c) => {
    if (c.status === '可结算' && String(c.managerId) === String(managerId)) {
      c.status = '提现中'
      c.withdrawId = record.id
    }
  })
  save()
  return record
}

export function approveWithdraw(id) {
  const record = db.withdraws.find((w) => w.id === id)
  if (!record) return null
  record.status = '已到账'
  record.payTime = '刚刚'
  db.commissions.forEach((c) => {
    if (c.withdrawId === id) {
      c.status = '已结算'
      c.settleTime = '刚刚'
    }
  })
  save()
  return record
}

export function rejectWithdraw(id, reason) {
  const record = db.withdraws.find((w) => w.id === id)
  if (!record) return null
  record.status = '已拒绝'
  record.rejectReason = reason || '资料不全'
  db.commissions.forEach((c) => {
    if (c.withdrawId === id) {
      c.status = '可结算'
      c.withdrawId = null
    }
  })
  save()
  return record
}

export function settleCommissions() {
  db.commissions.forEach((c) => {
    if (c.status === '待结算') c.status = '可结算'
  })
  save()
  return db.commissions
}

export function adjustCommission(id, amount, reason) {
  const c = db.commissions.find((x) => x.id === id)
  if (!c) return null
  c.commissionAmount = Number(amount)
  c.adjustReason = reason
  save()
  return c
}

export function applyManager(form) {
  const app = { id: `APP${Date.now()}`, ...form, status: '待审核', submittedAt: '刚刚' }
  db.managerApplications.unshift(app)
  save()
  return app
}

export function approveManagerApp(id) {
  const app = db.managerApplications.find((a) => a.id === id)
  if (!app) return null
  app.status = '已通过'
  const manager = {
    id: Date.now(),
    name: app.name,
    phone: app.phone,
    inviteCode: `SYL${Math.floor(100 + Math.random() * 900)}`,
    commissionRate: null,
    status: 1,
    totalPerformance: 0,
    totalCommission: 0,
    totalCustomers: 0
  }
  db.managers.push(manager)
  save()
  return manager
}

export function rejectManagerApp(id, reason) {
  const app = db.managerApplications.find((a) => a.id === id)
  if (!app) return null
  app.status = '已拒绝'
  app.rejectReason = reason
  save()
  return app
}

export function setManagerStatus(id, status) {
  const m = db.managers.find((x) => String(x.id) === String(id))
  if (!m) return null
  m.status = status
  if (status === 3) {
    db.customers.forEach((c) => {
      if (String(c.managerId) === String(id)) c.managerId = null
    })
    db.bindings.forEach((b) => {
      if (String(b.managerId) === String(id)) b.status = 2
    })
  }
  save()
  return m
}

export function unbindCustomer(customerId, reason) {
  const c = db.customers.find((x) => x.id === customerId)
  if (!c) return null
  c.managerId = null
  const b = db.bindings.find((x) => x.customerId === customerId && x.status === 1)
  if (b) {
    b.status = 2
    b.unbindTime = '刚刚'
    b.unbindReason = reason
  }
  save()
  return c
}

export function rebindCustomer(customerId, managerId, reason) {
  const c = db.customers.find((x) => x.id === customerId)
  if (!c) return null
  c.managerId = managerId
  db.bindings.forEach((b) => {
    if (b.customerId === customerId && b.status === 1) {
      b.status = 3
      b.unbindTime = '刚刚'
      b.unbindReason = reason
    }
  })
  db.bindings.unshift({
    id: `B${Date.now()}`,
    customerId,
    customerName: c.name,
    managerId,
    bindSource: 4,
    bindTime: '刚刚',
    status: 1
  })
  save()
  return c
}

export function dashboardStats() {
  return {
    activityCount: db.activities.length,
    orderCount: db.orders.length,
    customerCount: db.customers.length,
    managerCount: db.managers.length,
    pendingApply: db.managerApplications.filter((a) => a.status === '待审核').length,
    pendingWithdraw: db.withdraws.filter((w) => w.status === '待审核').length,
    totalCommission: db.commissions.reduce((s, c) => s + Number(c.commissionAmount || 0), 0),
    orderStatus: db.orders.reduce((acc, o) => {
      acc[o.status] = (acc[o.status] || 0) + 1
      return acc
    }, {})
  }
}

export function getUserProfile(userId) {
  const user = db.customers.find((c) => c.id === userId) || { id: userId, name: '用户', member: true, balance: 0, points: 0, managerId: null, isManager: false }
  const cards = db.cards.filter((c) => c.userId === userId)
  const boundManager = user.managerId ? findManager(user.managerId) : null
  const addresses = db.addresses.filter((a) => a.userId === userId)
  const isManager = db.managers.some((m) => String(m.id) === String(userId)) || Boolean(user.isManager)
  const application = db.managerApplications.find((a) => String(a.name) === String(user.name)) || null
  return { user, cards, boundManager, addresses, coupons: db.coupons, isManager, application, bindLogs: db.bindings.filter((b) => b.customerId === userId) }
}

export function bindCustomerByCodeOrId(userId, code, managerId, source) {
  let manager = null
  if (code) manager = db.managers.find((m) => String(m.inviteCode).toUpperCase() === String(code).trim().toUpperCase())
  if (!manager && managerId) manager = db.managers.find((m) => String(m.id) === String(managerId))
  if (!manager) return null
  const customer = db.customers.find((c) => c.id === userId)
  if (customer) customer.managerId = manager.id
  db.bindings.forEach((b) => {
    if (b.customerId === userId && b.status === 1) {
      b.status = 3
      b.unbindTime = '刚刚'
      b.unbindReason = '重新绑定'
    }
  })
  db.bindings.unshift({
    id: `B${Date.now()}`,
    customerId: userId,
    customerName: customer ? customer.name : '用户',
    managerId: manager.id,
    bindSource: source || 3,
    bindTime: '刚刚',
    status: 1
  })
  save()
  return manager
}

export function unbindCustomerByUser(userId, reason) {
  const customer = db.customers.find((c) => c.id === userId)
  if (customer) customer.managerId = null
  db.bindings.forEach((b) => {
    if (b.customerId === userId && b.status === 1) {
      b.status = 2
      b.unbindTime = '刚刚'
      b.unbindReason = reason
    }
  })
  save()
  return customer
}

export function getManagerDashboard(managerId) {
  const manager = db.managers.find((m) => String(m.id) === String(managerId)) || null
  const customers = db.customers.filter((c) => String(c.managerId) === String(managerId))
  const commissions = db.commissions.filter((c) => String(c.managerId) === String(managerId))
  const withdraws = db.withdraws.filter((w) => String(w.managerId) === String(managerId))
  return { manager, customers, commissions, withdraws }
}
