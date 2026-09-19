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

function normalizeActivities(db) {
  ;(db.activities || []).forEach((a) => {
    if (!a.sellType) a.sellType = 'date'
    if (a.sellType === 'sku') a.hasSku = true
  })
  if (!Array.isArray(db.lives)) db.lives = clone(seed.lives)
}

export function init() {
  if (db) return db
  if (fs.existsSync(DATA_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
      normalizeActivities(db)
      return db
    } catch (e) {
      db = null
    }
  }
  db = clone(seed)
  normalizeActivities(db)
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

function normalizeKeyword(kw) {
  return String(kw || '').trim().toLowerCase().split(/\s+/).filter(Boolean)
}

export function activitySearchText(a) {
  const skuNames = (a.skus || []).map((s) => s.name).join(' ')
  const points = (a.points || []).join(' ')
  return [a.title, a.city, a.address, a.highlight, a.detail, points, skuNames]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function searchActivities(keyword, category) {
  const terms = normalizeKeyword(keyword)
  return get().activities.filter((a) => {
    const okCat = !category || String(a.category) === String(category)
    const text = activitySearchText(a)
    const okKey = terms.length === 0 || terms.every((t) => text.includes(t))
    return okCat && okKey
  })
}

export function getCategories() {
  return get().categories
}

export function createCategory(data) {
  const name = String((data && data.name) || '').trim() || '未命名分类'
  const cat = {
    id: Date.now(),
    name,
    short: String((data && data.short) || '').trim() || name.slice(0, 2),
    emoji: (data && data.emoji) || '📌',
    color: (data && data.color) || '#6f747b',
    type: (data && data.type) || 'activity'
  }
  db.categories[String(cat.id)] = cat
  save()
  return cat
}

export function updateCategory(id, data) {
  const key = String(id)
  const cat = db.categories[key]
  if (!cat) return null
  const next = { ...cat, ...(data || {}), id: cat.id }
  if (data && data.name !== undefined) next.name = String(data.name || '').trim() || cat.name
  db.categories[key] = next
  save()
  return next
}

export function deleteCategory(id) {
  const key = String(id)
  if (!db.categories[key]) return null
  delete db.categories[key]
  db.activities.forEach((a) => {
    if (String(a.category) === key) a.category = 0
  })
  save()
  return { ok: true }
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
  const isSkuOnly = activity.sellType === 'sku'
  const hasSku = activity.hasSku || isSkuOnly
  const sku = hasSku ? activity.skus.find((s) => s.id === payload.skuId) || activity.skus[0] || null : null
  const memberPrice = sku ? sku.memberPrice : activity.memberPrice
  const schedule = isSkuOnly ? null : activity.schedules.find((s) => s.id === payload.scheduleId) || activity.schedules[0] || null
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
  const taxRate = Number(db.config.withdrawTaxRate ?? 20)
  const tax = Number((amount * taxRate / 100).toFixed(2))
  const actualAmount = Number((amount - tax).toFixed(2))
  const record = {
    id: `WD${Date.now()}`,
    managerId,
    amount,
    taxRate,
    tax,
    actualAmount,
    status: '待审核',
    applyTime: '刚刚',
    payChannel: '微信零钱'
  }
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
  addLog('提现审核', `提现单 ${id} 已打款 ¥${record.amount}`)
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
  addLog('提现审核', `提现单 ${id} 已拒绝，原因：${reason}`)
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
  addLog('佣金调整', `佣金单 ${id} 调整为 ¥${amount}，原因：${reason}`)
  save()
  return c
}

export function applyManager(form) {
  const fee = Number(db.config.managerApplyFee ?? 0)
  if (fee > 0 && !form.paid) {
    const err = new Error('请先支付主理人申请费用')
    err.status = 400
    throw err
  }
  const app = {
    id: `APP${Date.now()}`,
    ...form,
    paid: fee > 0 ? true : Boolean(form.paid),
    paidAmount: fee,
    paidAt: fee > 0 ? '刚刚' : '',
    status: '待审核',
    submittedAt: '刚刚'
  }
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
  addLog('主理人审核', `通过 ${app.name} 的主理人申请`)
  save()
  return manager
}

export function rejectManagerApp(id, reason) {
  const app = db.managerApplications.find((a) => a.id === id)
  if (!app) return null
  app.status = '已拒绝'
  app.rejectReason = reason
  addLog('主理人审核', `拒绝 ${app.name} 的申请，原因：${reason}`)
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
  addLog('主理人管理', `${m.name} 状态变更为 ${status === 1 ? '正常' : status === 2 ? '冻结' : '清退'}`)
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
  addLog('归属管理', `解除客户 ${c.name} 的主理人归属，原因：${reason}`)
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
  addLog('归属管理', `客户 ${c.name} 变更归属到主理人 ${managerId}，原因：${reason}`)
  save()
  return c
}

export function addLog(action, detail) {
  db.logs = db.logs || []
  db.logs.unshift({
    id: `LOG${Date.now()}`,
    action,
    detail,
    time: new Date().toLocaleString('zh-CN', { hour12: false })
  })
}

export function getLogs() {
  return db.logs || []
}

export function auditRefund(orderId, approve, reason) {
  const order = db.orders.find((o) => o.id === orderId)
  if (!order) return null
  if (approve) {
    order.status = '已退款'
    order.refundAmount = order.payAmount
    order.refundReason = reason || '运营审核退款'
    releaseSchedule(order)
    const commission = db.commissions.find((c) => c.orderId === orderId)
    if (commission) commission.status = '已扣回'
    returnCoupon(order)
  } else {
    order.status = '待发货'
    order.refundRejected = reason || '审核拒绝'
  }
  addLog('退款审核', `订单 ${orderId} ${approve ? '同意退款' : '拒绝退款'}`)
  save()
  return order
}

export function updateCustomer(id, data) {
  const c = db.customers.find((x) => x.id === id)
  if (!c) return null
  Object.assign(c, data)
  addLog('用户管理', `更新客户 ${c.name} 资料`)
  save()
  return c
}

export function dashboardStats() {
  const byCategory = {}
  db.activities.forEach((a) => {
    byCategory[a.category] = (byCategory[a.category] || 0) + 1
  })
  const managerRanking = db.managers
    .slice()
    .sort((a, b) => (b.totalCommission || 0) - (a.totalCommission || 0))
    .map((m) => ({ id: m.id, name: m.name, totalCommission: m.totalCommission, totalCustomers: m.totalCustomers }))
  return {
    activityCount: db.activities.length,
    orderCount: db.orders.length,
    customerCount: db.customers.length,
    managerCount: db.managers.length,
    pendingApply: db.managerApplications.filter((a) => a.status === '待审核').length,
    pendingWithdraw: db.withdraws.filter((w) => w.status === '待审核').length,
    totalCommission: db.commissions.reduce((s, c) => s + Number(c.commissionAmount || 0), 0),
    totalRevenue: db.orders.filter((o) => !['已取消', '已退款'].includes(o.status)).reduce((s, o) => s + Number(o.payAmount || 0), 0),
    byCategory,
    managerRanking,
    orderStatus: db.orders.reduce((acc, o) => {
      acc[o.status] = (acc[o.status] || 0) + 1
      return acc
    }, {})
  }
}

function enrichLive(live) {
  const manager = live.managerId ? findManager(live.managerId) : null
  return {
    ...live,
    private: live.managerId != null,
    managerName: manager ? manager.name : null
  }
}

export function listLives(userId) {
  const all = (get().lives || []).map(enrichLive)
  if (!userId) return all
  const user = db.customers.find((c) => String(c.id) === String(userId))
  const managerId = user ? user.managerId : null
  const isManager = db.managers.some((m) => String(m.id) === String(userId))
  return all.filter((l) => !l.managerId || String(l.managerId) === String(managerId) || isManager)
}

export function createLive(data) {
  const live = {
    id: `live${Date.now()}`,
    title: String((data && data.title) || '未命名直播').trim(),
    cover: (data && data.cover) || '📺',
    coverTone: (data && data.coverTone) || 'linear-gradient(135deg,#c25e3d,#e19a6d)',
    hostName: (data && data.hostName) || '岁悦里',
    hostAvatar: (data && data.hostAvatar) || '🧑‍🏫',
    managerId: (data && data.managerId != null && data.managerId !== '') ? Number(data.managerId) : null,
    status: (data && data.status) || 'scheduled',
    startAt: (data && data.startAt) || '',
    endAt: (data && data.endAt) || '',
    streamUrl: (data && data.streamUrl) || '',
    replayUrl: (data && data.replayUrl) || '',
    description: (data && data.description) || '',
    activityId: (data && data.activityId != null && data.activityId !== '') ? Number(data.activityId) : null,
    viewers: Number((data && data.viewers) || 0),
    createdAt: new Date().toLocaleString('zh-CN', { hour12: false })
  }
  db.lives = db.lives || []
  db.lives.unshift(live)
  save()
  return enrichLive(live)
}

export function updateLive(id, data) {
  const live = (db.lives || []).find((l) => String(l.id) === String(id))
  if (!live) return null
  const next = { ...live, ...(data || {}), id: live.id }
  if (data && data.managerId != null) next.managerId = data.managerId === '' ? null : Number(data.managerId)
  if (data && data.activityId != null) next.activityId = data.activityId === '' ? null : Number(data.activityId)
  if (data && data.viewers != null) next.viewers = Number(data.viewers)
  db.lives = (db.lives || []).map((l) => String(l.id) === String(id) ? next : l)
  save()
  return enrichLive(next)
}

export function deleteLive(id) {
  db.lives = (db.lives || []).filter((l) => String(l.id) !== String(id))
  save()
  return { ok: true }
}

const MEMBER_LEVELS = {
  1: '普通会员',
  2: '银卡会员',
  3: '金卡会员',
  4: '铂金会员',
  5: '钻石会员'
}

function memberLevelOf(user) {
  if (user.memberLevel) return Number(user.memberLevel)
  const points = Number(user.points || 0)
  if (points >= 500) return 5
  if (points >= 200) return 4
  if (points >= 80) return 3
  return 2
}

function memberIdentity(user) {
  const seq = String(user.id || '').replace(/\D/g, '') || '1'
  const year = new Date().getFullYear()
  const memberLevel = memberLevelOf(user)
  return {
    memberId: user.memberId || `8808${year}${seq.padStart(4, '0')}`,
    memberLevel,
    memberLevelName: MEMBER_LEVELS[memberLevel] || '会员',
    memberSince: user.memberSince || `${year}年9月`,
    memberExpireAt: user.memberExpireAt || '长期有效'
  }
}

export function getUserProfile(userId) {
  const raw = db.customers.find((c) => c.id === userId) || { id: userId, name: '用户', member: true, balance: 0, points: 0, managerId: null, isManager: false }
  const user = { ...raw, ...memberIdentity(raw) }
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
  const activities = db.activities.map((a) => {
    const rate = resolveRate(a, manager)
    const basePrice = Number(a.memberPrice || a.price || 0)
    return {
      id: a.id,
      title: a.title,
      cover: a.cover,
      coverTone: a.coverTone,
      category: a.category,
      city: a.city,
      memberPrice: a.memberPrice,
      price: a.price,
      commissionRate: rate,
      commissionAmount: Number((basePrice * rate / 100).toFixed(2))
    }
  })
  const config = {
    minWithdraw: Number(db.config.minWithdraw ?? 100),
    withdrawMonthlyLimit: Number(db.config.withdrawMonthlyLimit ?? 1),
    withdrawTaxRate: Number(db.config.withdrawTaxRate ?? 20),
    globalCommissionRate: Number(db.config.globalCommissionRate ?? 8)
  }
  return { manager, customers, commissions, withdraws, activities, config }
}
