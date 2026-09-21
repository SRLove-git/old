// 登录会员身份由 request.js 的微信会话统一管理。
const { api, ensureLogin, getCurrentUserId: authUserId } = require('./request.js')

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
  manager: null,
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

function couponApplicable(coupon, activity, amount, userId) {
  if (!coupon || coupon.used) return false
  // 入会赠送券等带 welcomeFor 的券只属于指定会员
  const owner = coupon.welcomeFor ? String(coupon.welcomeFor) : ''
  if (owner && owner !== String(userId == null ? authUserId() : userId)) return false
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
  if (['已核销', '待评价', '已完成', '已退款', '已取消', '退款中'].includes(order.status)) {
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
    await ensureLogin()
    const currentUserId = authUserId()
    const [home, profile, orders, participants, reviews, managers] = await Promise.all([
      api.get('/home'),
      api.get(`/users/${currentUserId}`),
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
    // 只有主理人本人会拿到自己的主理人记录（含余额与 id）
    cache.manager = profile.manager || null
    cache.application = profile.application
    cache.bindLogs = profile.bindLogs
    cache.pendingUnbind = profile.pendingUnbind || null
    cache.providerApplication = profile.providerApplication || null
    cache.orders = orders
    cache.participants = participants
    cache.reviews = reviews
    cache.managers = managers
    cache.lives = []
    try {
      cache.lives = await api.get(`/lives?userId=${currentUserId}`)
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
  if (getCoursePurchases().some((record) => String(record.courseId) === String(id))) return true
  return (cache.cards || []).some((card) => String(card.liveId) === String(id))
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

function getOwnManager() {
  return cache.manager || null
}

function getCurrentUserId() {
  return authUserId()
}

async function joinMember() {
  const result = await api.post('/members/join', { userId: authUserId() })
  cache.user = result.user
  cache.coupons = result.coupons || cache.coupons
  return result
}

// 手机号统一成 11 位数字，容忍空格、短横线、+86 前缀等写法
function normalizePhone(value) {
  let digits = String(value == null ? '' : value).replace(/\D/g, '')
  if (digits.length === 13 && digits.startsWith('86')) digits = digits.slice(2)
  return digits
}

function maskPhone(value) {
  const phone = normalizePhone(value)
  if (phone.length !== 11) return ''
  return `${phone.slice(0, 3)}****${phone.slice(7)}`
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
  const manager = await api.post(`/customers/${authUserId()}/bind`, { managerId, source })
  cache.boundManager = manager
  return manager
}

function cancelPendingBind() {
  pendingBindManagerId = null
  pendingBindSource = null
}

async function bindByCode(code) {
  const manager = await api.post(`/customers/${authUserId()}/bind`, { code, source: 3 })
  cache.boundManager = manager
  return manager
}

async function unbindManager() {
  await api.post(`/customers/${authUserId()}/unbind`, { reason: '客户主动解除' })
  cache.boundManager = null
}

async function createOrder(payload) {
  const order = await api.post('/orders', { ...payload, userId: authUserId() })
  cache.orders.unshift(order)
  if (payload.couponId) {
    const coupon = cache.coupons.find((c) => String(c.id) === String(payload.couponId))
    if (coupon) coupon.used = true
  }
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
  cache.reviews = await api.get('/reviews')
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
  const addr = await api.post('/addresses', { ...address, userId: authUserId() })
  if (!cache.addresses.some((a) => a.id === addr.id)) cache.addresses.push(addr)
  return addr
}

async function updateAddress(id, form) {
  const addr = await api.put(`/addresses/${id}`, form)
  const idx = cache.addresses.findIndex((a) => String(a.id) === String(id))
  if (idx >= 0) cache.addresses[idx] = addr
  return addr
}

async function deleteAddress(id) {
  await api.del(`/addresses/${id}`)
  cache.addresses = cache.addresses.filter((a) => String(a.id) !== String(id))
}

async function unbindApply(reason) {
  const application = await api.post(`/customers/${authUserId()}/unbind-apply`, { reason })
  cache.pendingUnbind = application
  return application
}

async function purchaseLive(liveId) {
  const card = await api.post(`/lives/${liveId}/purchase`, { userId: authUserId() })
  if (card && !cache.cards.some((c) => String(c.id) === String(card.id))) cache.cards.push(card)
  return card
}

function refundRuleText(rule) {
  if (!rule || !rule.type) return ''
  if (rule.type === 'always') return '随时可退，全额退款'
  if (rule.type === 'day') {
    const fullDays = Number(rule.fullDays || 0)
    const partialDays = Number(rule.partialDays || 0)
    const partialRate = Number(rule.partialRate || 0)
    if (fullDays <= 0) return '不可退款'
    if (partialDays > 0 && partialRate > 0) {
      return `活动开始前${fullDays}天（含）可全额退款，前${partialDays}天退${Math.round(partialRate * 100)}%，之后不可退`
    }
    return `活动开始前${fullDays}天（含）可全额退款，之后不可退`
  }
  if (rule.type === 'ladder') {
    const ladder = (rule.ladder || []).slice().sort((a, b) => b.days - a.days)
    if (!ladder.length) return '不可退款'
    const parts = ladder.map((rung) => (rung.rate >= 1 ? `提前${rung.days}天全退` : `提前${rung.days}天退${Math.round(rung.rate * 100)}%`))
    const last = ladder[ladder.length - 1]
    if (!last.rate || last.rate <= 0) parts.push('之后不可退')
    return parts.join('；')
  }
  return ''
}

function displayStatus(order) {
  if (order.status === '待收货' && order.category !== 5 && order.category !== 4) return '待出行/待使用'
  if (order.status === '已核销') return '待完成'
  return order.status
}

// 订单筛选：个人中心入口、筛选 chip 与列表状态文案共用同一套口径
const GOODS_CATEGORIES = [4, 5]
const ORDER_FILTERS = [
  { label: '全部', match: () => true },
  { label: '待付款', match: (o) => o.status === '待付款' },
  { label: '待发货', match: (o) => o.status === '待发货' },
  { label: '待收货', match: (o) => o.status === '待收货' && GOODS_CATEGORIES.includes(Number(o.category)) },
  { label: '待出行', match: (o) => o.status === '待收货' && !GOODS_CATEGORIES.includes(Number(o.category)) },
  { label: '待完成', match: (o) => o.status === '已核销' },
  { label: '待评价', match: (o) => o.status === '待评价' },
  { label: '已完成', match: (o) => o.status === '已完成' },
  { label: '退款/售后', match: (o) => ['退款中', '已退款'].includes(o.status) },
  { label: '已取消', match: (o) => o.status === '已取消' }
]

function orderFilterLabels() {
  return ORDER_FILTERS.map((item) => item.label)
}

// 个人中心入口（含历史写法）→ 筛选 chip
function resolveOrderFilter(status) {
  const map = {
    待付款: '待付款',
    待出行: '待出行',
    待收货: '待收货',
    待发货: '待发货',
    待完成: '待完成',
    待评价: '待评价',
    已完成: '已完成',
    已取消: '已取消',
    退款售后: '退款/售后',
    '退款/售后': '退款/售后',
    退款中: '退款/售后',
    已退款: '退款/售后',
    已核销: '待完成'
  }
  const key = String(status == null ? '' : status).trim()
  return map[key] || ''
}

function matchOrderFilter(order, label) {
  const target = ORDER_FILTERS.find((item) => item.label === label) || ORDER_FILTERS[0]
  return target.match(order)
}

async function submitManagerApply(form) {
  const app = await api.post('/manager-applications', form)
  cache.application = app
  return app
}

async function loadManagerDashboard(managerId) {
  // 带上当前登录会员身份，服务端只允许主理人查看自己的工作台
  const dash = await api.get(`/managers/${managerId}/dashboard?userId=${authUserId()}`)
  cache.managerView = dash.manager
  cache.managerCustomers = dash.customers
  cache.commissions = dash.commissions
  cache.withdraws = dash.withdraws
  cache.manager = dash.manager
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
  getCart,
  addCartItem,
  updateCartItem,
  removeCartItems,
  addActivityToCart,
  addCourseToCart,
  getManagers,
  getOwnManager,
  getCurrentUserId,
  joinMember,
  normalizePhone,
  maskPhone,
  getDefaultAddress,
  money,
  statusClass,
  orderFilterLabels,
  resolveOrderFilter,
  matchOrderFilter,
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
  updateAddress,
  deleteAddress,
  unbindApply,
  purchaseLive,
  refundRuleText,
  displayStatus,
  submitManagerApply,
  loadManagerDashboard,
  applyWithdraw
}
