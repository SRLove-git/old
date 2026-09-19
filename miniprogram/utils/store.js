const { api } = require('./request.js')

const CURRENT_USER_ID = 'u1'
const COURSE_PURCHASE_KEY = 'suiyueli_course_purchases_v1'
const CART_KEY = 'suiyueli_cart_v1'

let cache = {
  activities: [],
  products: [],
  regions: [],
  contentPosts: [],
  banners: [],
  categories: {},
  coupons: [],
  participants: [],
  addresses: [],
  orders: [],
  reviews: [],
  lives: [],
  managers: [],
  user: {},
  cards: [],
  boundManager: null,
  isManager: false,
  application: null,
  bindLogs: [],
  managerView: {},
  managerCustomers: [],
  commissions: [],
  withdraws: [],
  config: {}
}

let loaded = false
let pendingBindManagerId = null
let pendingBindSource = null

const STATUS_CLASS = {
  '待付款': 'pending',
  '待发货': 'out',
  '待收货': 'shipping',
  '待评价': 'review',
  '已完成': 'done',
  '已核销': 'verified',
  '退款中': 'refunding',
  '已退款': 'refunded',
  '已取消': 'cancelled'
}

const BIND_SOURCE_LABEL = { 1: '扫码', 2: '链接', 3: '邀请码', 4: '手动变更' }

function statusClass(status) {
  return STATUS_CLASS[status] || 'default'
}

function bindSourceLabel(source) {
  return BIND_SOURCE_LABEL[source] || '未知'
}

function money(n) {
  return Number(n || 0).toFixed(2)
}

function getCategory(id) {
  return cache.categories[id] || { name: '全部', short: '全部', emoji: '📦', color: '#555555' }
}

function getAssistant() {
  const a = (cache.config && cache.config.assistant) || {}
  return {
    name: a.name || '小助理',
    wechat: a.wechat || 'suiyueli6070',
    phone: a.phone || '400-800-6070',
    avatar: a.avatar || '🧑‍💼',
    intro: a.intro || ''
  }
}

function getFiling() {
  const f = (cache.config && cache.config.filing) || {}
  return {
    companyName: f.companyName || '',
    icp: f.icp || '',
    police: f.police || ''
  }
}

function getBrand() {
  const b = (cache.config && cache.config.brand) || {}
  return {
    slogan: b.slogan || '和同龄人一起，玩得开心又省心'
  }
}

function couponApplicable(coupon, activity, amount) {
  if (!coupon || coupon.used) return false
  if (coupon.expireAt && new Date(coupon.expireAt) < new Date()) return false
  if (coupon.minAmount && amount < coupon.minAmount) return false
  if (coupon.type === 3 && coupon.scopeCategory && activity.category !== coupon.scopeCategory) return false
  if (coupon.type === 4 && coupon.scopeProductId && String(activity.id) !== String(coupon.scopeProductId)) return false
  return true
}

function scheduleDaysUntil(schedule) {
  if (!schedule || !schedule.full) return 999
  return Math.ceil((new Date(`${schedule.full}T00:00:00`).getTime() - Date.now()) / 86400000)
}

function calcRefund(order) {
  const activity = getActivity(order.activityId)
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

async function ready() {
  if (loaded) return cache
  wx.showLoading({ title: '加载中', mask: true })
  try {
    const [home, profile, orders, participants, reviews, managers] = await Promise.all([
      api.get('/home'),
      api.get(`/users/${CURRENT_USER_ID}`),
      api.get('/orders'),
      api.get('/participants'),
      api.get('/reviews'),
      api.get('/managers')
    ])
    cache.activities = home.activities
    cache.products = home.products || []
    cache.regions = home.regions || []
    cache.contentPosts = home.contentPosts || []
    cache.banners = home.banners
    cache.categories = home.categories
    cache.config = home.config
    cache.user = profile.user
    cache.cards = profile.cards
    cache.coupons = profile.coupons
    cache.boundManager = profile.boundManager
    cache.addresses = profile.addresses
    cache.isManager = profile.isManager
    cache.application = profile.application
    cache.bindLogs = profile.bindLogs
    cache.orders = orders
    cache.participants = participants
    cache.reviews = reviews
    cache.managers = managers
    cache.lives = []
    try {
      cache.lives = await api.get(`/lives?userId=${CURRENT_USER_ID}`)
    } catch (e) {
      // 后端未部署直播接口时静默降级为空列表，不影响其它功能
    }
    loaded = true
    return cache
  } finally {
    wx.hideLoading()
  }
}

async function refresh() {
  loaded = false
  return ready()
}

function get() {
  return cache
}

function init() {
  // 首次在 onLaunch 里预取
  ready().catch(() => {})
}

function getActivities() {
  return cache.activities
}

function getRegions() {
  return (cache.regions || []).filter((region) => region.enabled !== false).slice().sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0))
}

function getActivityRegionNames(activity) {
  const ids = Array.isArray(activity && activity.regionIds) ? activity.regionIds.map(String) : []
  return ids.map((id) => (cache.regions || []).find((region) => String(region.id) === id)?.name).filter(Boolean)
}

function activityInRegion(activity, region) {
  if (!activity || region === 'all' || region === '全部') return true
  const ids = Array.isArray(activity.regionIds) ? activity.regionIds.map(String) : []
  if (ids.length === 0) return activity.city === '线上' || activity.city === '全国' || activity.city === '线上/全国'
  const target = (cache.regions || []).find((item) => String(item.id) === String(region) || item.name === region)
  return !!target && ids.includes(String(target.id))
}

function getActivity(id) {
  return [...cache.activities, ...cache.products].find((a) => String(a.id) === String(id))
}

function getContentPosts() {
  return cache.contentPosts || []
}

function getContentPost(id) {
  return (cache.contentPosts || []).find((item) => String(item.id) === String(id)) || null
}

function getOfferings(managerId) {
  return [...cache.activities, ...cache.products].filter((item) => String(item.managerId) === String(managerId))
}

function getReviews(activityId) {
  return cache.reviews.filter((r) => String(r.activityId) === String(activityId))
}

function getLives() {
  return cache.lives
}

function getLive(id) {
  return cache.lives.find((l) => String(l.id) === String(id))
}

function getCoursePurchases() {
  const value = wx.getStorageSync(COURSE_PURCHASE_KEY)
  return Array.isArray(value) ? value : []
}

function isCoursePurchased(id) {
  return getCoursePurchases().some((record) => String(record.courseId) === String(id))
}

function purchaseCourse(course) {
  if (!course || !course.id) throw new Error('课程不存在')
  const purchases = getCoursePurchases()
  if (!purchases.some((record) => String(record.courseId) === String(course.id))) {
    purchases.unshift({
      id: `COURSE${Date.now()}`,
      courseId: course.id,
      title: course.title,
      amount: Number(course.memberPrice || course.price || 0),
      purchasedAt: new Date().toLocaleString('zh-CN', { hour12: false })
    })
    wx.setStorageSync(COURSE_PURCHASE_KEY, purchases)
  }
  return purchases.find((record) => String(record.courseId) === String(course.id))
}

function getCart() {
  const value = wx.getStorageSync(CART_KEY)
  return Array.isArray(value) ? value : []
}

function saveCart(items) {
  wx.setStorageSync(CART_KEY, items)
  return items
}

function addCartItem(input) {
  if (!input || !input.targetId || !input.title) throw new Error('商品信息不完整')
  const cart = getCart()
  const kind = input.kind || 'activity'
  const key = `${kind}:${input.targetId}:${input.skuId || ''}:${input.scheduleId || ''}`
  const existing = cart.find((item) => item.key === key)
  if (existing) {
    if (kind !== 'course') existing.count = Math.min(Number(existing.maxCount || input.maxCount || 99), Number(existing.count || 1) + Number(input.count || 1))
    existing.selected = true
    existing.updatedAt = Date.now()
  } else {
    cart.unshift({
      id: `CART${Date.now()}${Math.floor(Math.random() * 1000)}`,
      key,
      selected: true,
      count: kind === 'course' ? 1 : Number(input.count || 1),
      addedAt: Date.now(),
      ...input,
      kind
    })
  }
  saveCart(cart)
  return cart
}

function updateCartItem(id, changes) {
  const cart = getCart().map((item) => String(item.id) === String(id) ? { ...item, ...(changes || {}) } : item)
  return saveCart(cart)
}

function removeCartItems(ids) {
  const targets = new Set((ids || []).map(String))
  return saveCart(getCart().filter((item) => !targets.has(String(item.id))))
}

function addActivityToCart(activity, options = {}) {
  if (!activity) throw new Error('活动不存在')
  const hasSku = activity.hasSku || activity.sellType === 'sku'
  const sku = hasSku
    ? (activity.skus || []).find((item) => String(item.id) === String(options.skuId)) || (activity.skus || [])[0]
    : null
  const schedule = activity.sellType === 'sku'
    ? null
    : (activity.schedules || []).find((item) => String(item.id) === String(options.scheduleId)) || (activity.schedules || [])[0]
  if (schedule && Number(schedule.remaining || 0) <= 0) throw new Error('最近一期已满，请先选择其他日期')
  return addCartItem({
    kind: 'activity',
    targetId: activity.id,
    title: activity.title,
    price: Number(sku ? sku.memberPrice : activity.memberPrice),
    originalPrice: Number(sku ? sku.price : activity.originalPrice || activity.price || 0),
    cover: activity.cover,
    coverTone: activity.coverTone,
    skuId: sku ? sku.id : '',
    skuName: sku ? sku.name : '',
    scheduleId: schedule ? schedule.id : '',
    scheduleLabel: schedule ? `${schedule.date || ''} ${schedule.weekday || ''} ${schedule.time || ''}`.trim() : '无需预约',
    count: Number(options.count || 1),
    maxCount: Math.max(1, Math.min(Number(activity.limitPerUser || 99), schedule ? Number(schedule.remaining || 0) : 99))
  })
}

function addCourseToCart(course) {
  if (!course) throw new Error('课程不存在')
  return addCartItem({
    kind: 'course',
    targetId: course.id,
    title: course.title,
    price: Number(course.memberPrice || course.price || 0),
    originalPrice: Number(course.originalPrice || 0),
    coverImage: course.coverImage || '/assets/event-academy.jpg',
    scheduleLabel: `${course.lessonCount || 1}节视频课 · 购买后永久回看`,
    count: 1,
    maxCount: 1
  })
}

function getManagers() {
  return cache.managers
}

function getDefaultAddress() {
  return cache.addresses.find((a) => a.isDefault) || cache.addresses[0] || null
}

function setPendingBind(managerId, source) {
  pendingBindManagerId = managerId
  pendingBindSource = source
}

function getPendingBind() {
  return pendingBindManagerId
}

async function confirmPendingBind() {
  if (!pendingBindManagerId) return null
  const managerId = pendingBindManagerId
  const source = pendingBindSource || 2
  pendingBindManagerId = null
  pendingBindSource = null
  const manager = await api.post(`/customers/${CURRENT_USER_ID}/bind`, { managerId, source })
  cache.boundManager = manager
  return manager
}

function cancelPendingBind() {
  pendingBindManagerId = null
  pendingBindSource = null
}

async function bindByCode(code) {
  const manager = await api.post(`/customers/${CURRENT_USER_ID}/bind`, { code, source: 3 })
  cache.boundManager = manager
  return manager
}

async function unbindManager() {
  await api.post(`/customers/${CURRENT_USER_ID}/unbind`, { reason: '客户主动解除' })
  cache.boundManager = null
}

async function createOrder(payload) {
  const order = await api.post('/orders', { ...payload, userId: CURRENT_USER_ID })
  cache.orders.unshift(order)
  return order
}

async function payOrder(id) {
  const order = await api.post(`/orders/${id}/pay`)
  const idx = cache.orders.findIndex((o) => o.id === id)
  if (idx >= 0) cache.orders[idx] = order
  return order
}

async function cancelOrder(id) {
  const order = await api.post(`/orders/${id}/cancel`)
  const idx = cache.orders.findIndex((o) => o.id === id)
  if (idx >= 0) cache.orders[idx] = order
  return order
}

async function refundOrder(id, reason) {
  const result = await api.post(`/orders/${id}/refund`, { reason })
  const idx = cache.orders.findIndex((o) => o.id === id)
  if (idx >= 0 && result.order) cache.orders[idx] = result.order
  return result
}

async function advanceOrder(id) {
  const order = await api.post(`/orders/${id}/advance`)
  const idx = cache.orders.findIndex((o) => o.id === id)
  if (idx >= 0) cache.orders[idx] = order
  return order
}

async function submitReview(orderId, review) {
  const order = await api.post(`/orders/${orderId}/review`, { ...review, name: cache.user.name })
  const idx = cache.orders.findIndex((o) => o.id === orderId)
  if (idx >= 0) cache.orders[idx] = order
  return order
}

async function saveParticipant(participant, editingId) {
  if (editingId && editingId !== 'new') {
    const p = await api.put(`/participants/${editingId}`, participant)
    const idx = cache.participants.findIndex((x) => String(x.id) === String(editingId))
    if (idx >= 0) cache.participants[idx] = p
  } else {
    const p = await api.post('/participants', participant)
    cache.participants.push(p)
  }
}

async function deleteParticipant(id) {
  await api.del(`/participants/${id}`)
  cache.participants = cache.participants.filter((p) => String(p.id) !== String(id))
}

async function saveAddress(address) {
  const addr = await api.post('/addresses', { ...address, userId: CURRENT_USER_ID })
  if (!cache.addresses.some((a) => a.id === addr.id)) cache.addresses.push(addr)
  return addr
}

async function submitManagerApply(form) {
  const app = await api.post('/manager-applications', form)
  cache.application = app
  return app
}

async function loadManagerDashboard(managerId) {
  const dash = await api.get(`/managers/${managerId}/dashboard`)
  cache.managerView = dash.manager
  cache.managerCustomers = dash.customers
  cache.commissions = dash.commissions
  cache.withdraws = dash.withdraws
  return dash
}

async function applyWithdraw(managerId, amount) {
  const record = await api.post('/withdraws', { managerId, amount })
  cache.withdraws.unshift(record)
  return record
}

module.exports = {
  init,
  ready,
  refresh,
  get,
  getCategory,
  getAssistant,
  getFiling,
  getBrand,
  getActivities,
  getRegions,
  getActivityRegionNames,
  activityInRegion,
  getActivity,
  getContentPosts,
  getContentPost,
  getOfferings,
  getReviews,
  getLives,
  getLive,
  getCoursePurchases,
  isCoursePurchased,
  purchaseCourse,
  getCart,
  addCartItem,
  updateCartItem,
  removeCartItems,
  addActivityToCart,
  addCourseToCart,
  getManagers,
  getDefaultAddress,
  money,
  statusClass,
  bindSourceLabel,
  couponApplicable,
  calcRefund,
  setPendingBind,
  getPendingBind,
  confirmPendingBind,
  cancelPendingBind,
  bindByCode,
  unbindManager,
  createOrder,
  payOrder,
  cancelOrder,
  refundOrder,
  advanceOrder,
  submitReview,
  saveParticipant,
  deleteParticipant,
  saveAddress,
  submitManagerApply,
  loadManagerDashboard,
  applyWithdraw
}
