// 客户端缓存与业务编排：集中管理页面共享数据，原始请求统一走 services/api.js。
const { ensureLogin, isLoggedIn, getCurrentUserId: authUserId } = require('../utils/request.js')
const { API_BASE } = require('../utils/config.js')
const apiService = require('../services/api.js')
const {
  bindSourceLabel,
  displayStatus,
  formatPhoneDisplay,
  isActivityExpired,
  maskPhone,
  matchOrderFilter,
  money,
  normalizePhone,
  orderFilterLabels,
  refundRuleText,
  resolveOrderFilter,
  statusClass
} = require('../utils/store-helpers.js')

const COURSE_PURCHASE_KEY = 'suiyueli_course_purchases_v1'
const CART_KEY = 'suiyueli_cart_v1'

let cache = {
  activities: [],
  products: [],
  pointProducts: [],
  pointOrders: [],
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
let homeRefreshPromise = null
let livesRefreshPromise = null
let profileRefreshPromise = null
let reviewsRefreshPromise = null
let ordersRefreshPromise = null
let pendingBindManagerId = null
let pendingBindSource = null

function getCategory(id) {
  return cache.categories[id] || { name: '全部', short: '全部', emoji: '📦', color: '#555555' }
}

function getAssistant() {
  const a = (cache.config && cache.config.assistant) || {}
  return {
    name: a.name || '',
    wechat: a.wechat || '',
    phone: a.phone || '',
    avatar: a.avatar || '',
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
    chineseName: b.chineseName || '',
    englishName: b.englishName || '',
    slogan: b.slogan || ''
  }
}

function getCopy() {
  const brand = getBrand().chineseName
  const source = (cache.config && cache.config.copy) || {}
  return Object.keys(source).reduce((result, key) => {
    result[key] = typeof source[key] === 'string' ? source[key].replace(/\{brand\}/g, brand) : source[key]
    return result
  }, {})
}

function apiAssetUrl(value) {
  const url = String(value || '').trim()
  if (!url || /^(https?:|data:|wxfile:)/.test(url)) return url
  if (url.startsWith('/assets/')) return url
  return `${API_BASE}${url.startsWith('/') ? url : `/${url}`}`
}

function getSocialQrs() {
  const value = (cache.config && cache.config.socialQrs) || {}
  return {
    officialAccount: apiAssetUrl(value.officialAccount),
    videoChannel: apiAssetUrl(value.videoChannel)
  }
}

function getHomeAssistant() {
  const value = (cache.config && cache.config.homeAssistant) || {}
  const assistant = getAssistant()
  const note = value.wechatNote || ''
  return {
    title: value.title || '',
    qrImage: value.qrImage ? apiAssetUrl(value.qrImage) : '/assets/assistant-qr.png',
    tip: value.tip || '',
    wechatNote: note.replace(/\{wechat\}/g, assistant.wechat)
  }
}

function getHomeDisplay() {
  const value = (cache.config && cache.config.homeDisplay) || {}
  const limit = (input, fallback, max) => {
    const number = Number(input)
    return Number.isInteger(number) && number >= 0 && number <= max ? number : fallback
  }
  return {
    newsLimit: limit(value.newsLimit, 3, 20),
    videoLimit: limit(value.videoLimit, 3, 20)
  }
}

function applyUserProfile(profile) {
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
}

function decorateContentPost(post) {
  const contentBlocks = (Array.isArray(post.contentBlocks) ? post.contentBlocks : []).map((block) => {
    if (block.type === 'image') return { ...block, src: apiAssetUrl(block.src) }
    if (block.type === 'video') return { ...block, url: apiAssetUrl(block.url) }
    return { ...block }
  })
  return {
    ...post,
    coverImage: apiAssetUrl(post.coverImage),
    videoUrl: apiAssetUrl(post.videoUrl),
    contentBlocks
  }
}

function decorateLive(live) {
  const lessons = (Array.isArray(live.lessons) ? live.lessons : []).map((lesson) => ({
    ...lesson,
    videoUrl: apiAssetUrl(lesson.videoUrl)
  }))
  return {
    ...live,
    coverImage: apiAssetUrl(live.coverImage),
    streamUrl: apiAssetUrl(live.streamUrl),
    replayUrl: apiAssetUrl(live.replayUrl),
    lessons
  }
}

function applyHome(home) {
  cache.activities = home.activities || []
  cache.products = home.products || []
  cache.regions = home.regions || []
  cache.contentPosts = (home.contentPosts || []).map(decorateContentPost)
  cache.banners = home.banners || []
  cache.categories = home.categories || {}
  cache.config = home.config || {}
}

function couponApplicable(coupon, activity, amount, userId) {
  if (!coupon || coupon.status !== 'unused') return false
  if (String(coupon.userId || '') !== String(userId == null ? authUserId() : userId)) return false
  if (coupon.templateStatus === 0) return false
  if (coupon.expireAt && coupon.expireAt < new Date().toISOString().slice(0, 10)) return false
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
  if (rule.type === 'never') {
    return { can: false, ratio: 0, amount: 0, reason: '该活动不支持退款' }
  }
  const days = scheduleDaysUntil(order.schedule)
  if (rule.type === 'ladder') {
    const ladder = (rule.ladder || []).slice().sort((a, b) => b.days - a.days)
    for (const rung of ladder) {
      if (days >= rung.days) {
        if (rung.rate <= 0) return { can: false, ratio: 0, amount: 0, reason: '已进入不可退时段' }
        return {
          can: true,
          ratio: rung.rate,
          amount: Number((order.payAmount * rung.rate).toFixed(2)),
          reason: `距出发${days}天，可退${Math.round(rung.rate * 100)}%`
        }
      }
    }
    return { can: false, ratio: 0, amount: 0, reason: '已进入不可退时段' }
  }
  const fullDays = rule.fullDays || 0
  const partialDays = rule.partialDays || 0
  const partialRate = rule.partialRate || 0
  if (days >= fullDays) {
    return { can: true, ratio: 1, amount: Number(order.payAmount.toFixed(2)), reason: `距开始${days}天，可全额退款` }
  }
  if (days >= partialDays && partialRate > 0) {
    return {
      can: true,
      ratio: partialRate,
      amount: Number((order.payAmount * partialRate).toFixed(2)),
      reason: `距开始不足${fullDays}天，可退${Math.round(partialRate * 100)}%`
    }
  }
  return { can: false, ratio: 0, amount: 0, reason: '距开始时间过近，不可退款' }
}

async function ready() {
  if (loaded) return cache
  wx.showLoading({ title: '加载中', mask: true })
  try {
    const memberActive = isLoggedIn()
    const currentUserId = memberActive ? authUserId() : ''
    // 首页是游客浏览的核心数据，不能被评价、主理人、直播等可选接口的失败连带阻断。
    const home = await apiService.fetchHome()
    applyHome(home)
    const [reviews, managers, lives] = await Promise.all([
      apiService.fetchReviews().catch(() => cache.reviews || []),
      apiService.fetchManagers().catch(() => cache.managers || []),
      apiService.fetchLives(memberActive ? currentUserId : '').catch(() => cache.lives || [])
    ])
    cache.reviews = reviews
    cache.managers = managers
    cache.lives = (lives || []).map(decorateLive)
    if (memberActive) {
      try {
        const [profile, orders, participants] = await Promise.all([
          apiService.fetchUserProfile(currentUserId),
          apiService.fetchOrders(),
          apiService.fetchParticipants()
        ])
        applyUserProfile(profile)
        cache.orders = orders
        cache.participants = participants
      } catch (error) {
        // 会员资料加载失败不影响公开内容展示，后续会员操作仍会按需重新鉴权。
      }
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

// 页面每次重新显示时只刷新公开内容，确保后台修改能及时同步到小程序，
// 同时避免重复拉取会员资料、订单等较重接口。
async function refreshHome() {
  if (homeRefreshPromise) return homeRefreshPromise
  homeRefreshPromise = apiService
    .fetchHome()
    .then((home) => {
      applyHome(home)
      return cache
    })
    .finally(() => {
      homeRefreshPromise = null
    })
  return homeRefreshPromise
}

async function refreshLives() {
  if (livesRefreshPromise) return livesRefreshPromise
  const memberActive = isLoggedIn()
  const currentUserId = memberActive ? authUserId() : ''
  livesRefreshPromise = apiService
    .fetchLives(memberActive ? currentUserId : '')
    .then((lives) => {
      cache.lives = (Array.isArray(lives) ? lives : []).map(decorateLive)
      return cache.lives
    })
    .finally(() => {
      livesRefreshPromise = null
    })
  return livesRefreshPromise
}

// 评价与商家回复会在后台独立更新，不能只依赖首次启动时的缓存。
async function refreshReviews() {
  if (reviewsRefreshPromise) return reviewsRefreshPromise
  reviewsRefreshPromise = apiService
    .fetchReviews()
    .then((reviews) => {
      cache.reviews = Array.isArray(reviews) ? reviews : []
      return cache.reviews
    })
    .finally(() => {
      reviewsRefreshPromise = null
    })
  return reviewsRefreshPromise
}

async function refreshOrders() {
  if (ordersRefreshPromise) return ordersRefreshPromise
  ordersRefreshPromise = ensureLogin()
    .then(() => apiService.fetchOrders())
    .then((orders) => {
      cache.orders = Array.isArray(orders) ? orders : []
      return cache.orders
    })
    .finally(() => {
      ordersRefreshPromise = null
    })
  return ordersRefreshPromise
}

// 审核状态只需要刷新会员资料，避免轮询时重复拉取首页、订单等大列表。
async function refreshUserProfile() {
  if (profileRefreshPromise) return profileRefreshPromise
  profileRefreshPromise = ensureLogin()
    .then(() => apiService.fetchUserProfile(authUserId()))
    .then((profile) => {
      applyUserProfile(profile)
      return cache
    })
    .finally(() => {
      profileRefreshPromise = null
    })
  return profileRefreshPromise
}

async function updateUserName(name) {
  await ensureLogin()
  const user = await apiService.updateUserName(name)
  cache.user = user
  return user
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

function getCatalogItems() {
  return [
    ...(cache.activities || []).map((item) => ({ ...item, offeringType: 'activity' })),
    ...(cache.products || []).map((item) => ({ ...item, offeringType: 'product' }))
  ]
}

function getRegions() {
  return (cache.regions || [])
    .filter((region) => region.enabled !== false)
    .slice()
    .sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0))
}

async function refreshRegions() {
  cache.regions = await apiService.fetchRegions()
  return getRegions()
}

async function refreshConfig() {
  cache.config = await apiService.fetchConfig()
  return cache.config
}

async function refreshPointMall() {
  const [products, orders] = await Promise.all([
    apiService.fetchPointProducts(),
    isLoggedIn() ? apiService.fetchPointOrders() : Promise.resolve([])
  ])
  cache.pointProducts = products || []
  cache.pointOrders = orders || []
  return { products: cache.pointProducts, orders: cache.pointOrders }
}

async function redeemPointProduct(productId, addressId, count = 1) {
  const result = await apiService.redeemPointProduct(productId, addressId, count)
  if (result.user) cache.user = result.user
  if (result.order) cache.pointOrders.unshift(result.order)
  if (result.product) {
    const index = cache.pointProducts.findIndex((item) => String(item.id) === String(result.product.id))
    if (index >= 0) cache.pointProducts[index] = result.product
  }
  return result
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
    if (kind !== 'course') {
      existing.count = Math.min(Number(existing.maxCount || input.maxCount || 99), Number(existing.count || 1) + Number(input.count || 1))
    }
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
  const cart = getCart().map((item) => (String(item.id) === String(id) ? { ...item, ...(changes || {}) } : item))
  return saveCart(cart)
}

function removeCartItems(ids) {
  const targets = new Set((ids || []).map(String))
  return saveCart(getCart().filter((item) => !targets.has(String(item.id))))
}

function addActivityToCart(activity, options = {}) {
  if (!activity) throw new Error('活动不存在')
  if (isActivityExpired(activity)) throw new Error('活动已过期，无法报名')
  if (Number(activity.status ?? 1) === 0) throw new Error('该活动已下架，无法报名')
  const hasSku = activity.hasSku || activity.sellType === 'sku'
  const sku = hasSku
    ? (activity.skus || []).find((item) => String(item.id) === String(options.skuId)) || (activity.skus || [])[0]
    : null
  const schedule =
    activity.sellType === 'sku'
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
  const result = await apiService.joinMember(authUserId())
  cache.user = result.user
  cache.coupons = result.coupons || cache.coupons
  return result
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
  await ensureLogin()
  const managerId = pendingBindManagerId
  const source = pendingBindSource || 2
  pendingBindManagerId = null
  pendingBindSource = null
  const manager = await apiService.bindByManagerId(managerId, source)
  cache.boundManager = manager
  return manager
}

function cancelPendingBind() {
  pendingBindManagerId = null
  pendingBindSource = null
}

async function bindByCode(code) {
  await ensureLogin()
  const manager = await apiService.bindByCode(code)
  cache.boundManager = manager
  return manager
}

async function unbindManager() {
  await apiService.unbindManager()
  cache.boundManager = null
}

async function createOrder(payload) {
  const order = await apiService.createOrder(payload)
  cache.orders.unshift(order)
  if (payload.couponId) {
    const coupon = cache.coupons.find((c) => String(c.id) === String(payload.couponId))
    if (coupon) {
      coupon.status = 'locked'
      coupon.locked = true
      coupon.orderId = order.id
      coupon.statusLabel = '使用中'
    }
  }
  if (order.balancePaidAmount > 0 || (order.paymentStatus === 'SUCCESS' && order.couponId)) await refreshUserProfile()
  return order
}

function requestWechatPayment(payment) {
  return new Promise((resolve, reject) => {
    wx.requestPayment({
      timeStamp: String(payment.timeStamp || ''),
      nonceStr: String(payment.nonceStr || ''),
      package: String(payment.package || ''),
      signType: payment.signType || 'RSA',
      paySign: String(payment.paySign || ''),
      success: resolve,
      fail: (error) => {
        const cancelled = String(error?.errMsg || '').includes('cancel')
        const next = new Error(cancelled ? '已取消微信支付，订单仍可在30分钟内继续支付' : error?.errMsg || '微信支付未完成')
        next.code = cancelled ? 'PAYMENT_CANCELLED' : 'PAYMENT_FAILED'
        reject(next)
      }
    })
  })
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function payOrder(id) {
  const result = await apiService.payOrder(id)
  if (!result) return null
  if (result.paid && result.order) {
    const freeIdx = cache.orders.findIndex((o) => o.id === id)
    if (freeIdx >= 0) cache.orders[freeIdx] = result.order
    if (result.order.couponId || result.order.balancePaidAmount > 0) await refreshUserProfile()
    return result.order
  }
  if (!result.payment) throw new Error('微信支付参数获取失败')
  await requestWechatPayment(result.payment)
  await apiService.refreshOrderPayment(id).catch(() => null)
  let order = null
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await delay(attempt === 0 ? 300 : 700)
    order = await apiService.getOrder(id)
    if (order && order.paymentStatus === 'SUCCESS') break
  }
  if (!order || order.paymentStatus !== 'SUCCESS') {
    const error = new Error('微信已受理支付，到账结果确认中，请稍后在订单中查看')
    error.code = 'PAYMENT_CONFIRMING'
    throw error
  }
  const idx = cache.orders.findIndex((o) => o.id === id)
  if (idx >= 0) cache.orders[idx] = order
  if (order.couponId || order.balancePaidAmount > 0) await refreshUserProfile()
  return order
}

async function getBalanceTransactions() {
  await ensureLogin()
  return apiService.getBalanceTransactions()
}

async function rechargeBalance(amount) {
  await ensureLogin()
  const recharge = await apiService.createBalanceRecharge(amount)
  const result = await apiService.payBalanceRecharge(recharge.id)
  if (!result?.payment) throw new Error('微信支付参数获取失败')
  await requestWechatPayment(result.payment)
  await apiService.refreshBalanceRecharge(recharge.id).catch(() => null)
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await delay(attempt === 0 ? 300 : 700)
    const transactions = await getBalanceTransactions()
    if (transactions.some((item) => String(item.rechargeId) === String(recharge.id))) {
      await refreshUserProfile()
      return { recharge, transactions }
    }
  }
  const error = new Error('微信已受理充值，到账结果确认中，请稍后查看余额')
  error.code = 'PAYMENT_CONFIRMING'
  throw error
}

async function payManagerApplication(id) {
  const result = await apiService.payManagerApplication(id)
  if (!result?.payment) throw new Error('微信支付参数获取失败')
  await requestWechatPayment(result.payment)
  await apiService.refreshManagerApplicationPayment(id).catch(() => null)
  let application = null
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await delay(attempt === 0 ? 300 : 700)
    application = await apiService.getManagerApplication(id)
    if (application && application.paymentStatus === '已到账') return application
  }
  const error = new Error('微信已受理支付，到账结果确认中，请稍后查看申请状态')
  error.code = 'PAYMENT_CONFIRMING'
  throw error
}

async function cancelOrder(id) {
  const order = await apiService.cancelOrder(id)
  const idx = cache.orders.findIndex((o) => o.id === id)
  if (idx >= 0) cache.orders[idx] = order
  if (order?.couponId || order?.balancePaidAmount > 0) await refreshUserProfile()
  return order
}

async function refundOrder(id, reason) {
  const result = await apiService.refundOrder(id, reason)
  const idx = cache.orders.findIndex((o) => o.id === id)
  if (idx >= 0 && result.order) cache.orders[idx] = result.order
  if (result.order?.couponId || result.order?.balancePaidAmount > 0) await refreshUserProfile()
  return result
}

async function advanceOrder(id) {
  const order = await apiService.advanceOrder(id)
  const idx = cache.orders.findIndex((o) => o.id === id)
  if (idx >= 0) cache.orders[idx] = order
  return order
}

function getOrderLogistics(id) {
  return apiService.getOrderLogistics(id)
}

function refreshOrderLogistics(id) {
  return apiService.refreshOrderLogistics(id)
}

async function submitReview(orderId, review) {
  const order = await apiService.submitReview(orderId, { ...review, name: cache.user.name })
  const idx = cache.orders.findIndex((o) => o.id === orderId)
  if (idx >= 0) cache.orders[idx] = order
  cache.reviews = await apiService.fetchReviews()
  return order
}

async function saveParticipant(participant, editingId) {
  if (editingId && editingId !== 'new') {
    const p = await apiService.saveParticipant(participant, editingId)
    const idx = cache.participants.findIndex((x) => String(x.id) === String(editingId))
    if (idx >= 0) cache.participants[idx] = p
  } else {
    const p = await apiService.saveParticipant(participant, editingId)
    cache.participants.push(p)
  }
}

async function deleteParticipant(id) {
  await apiService.deleteParticipant(id)
  cache.participants = cache.participants.filter((p) => String(p.id) !== String(id))
}

async function saveAddress(address) {
  const addr = await apiService.saveAddress(address)
  if (!cache.addresses.some((a) => a.id === addr.id)) cache.addresses.push(addr)
  return addr
}

async function updateAddress(id, form) {
  const addr = await apiService.updateAddress(id, form)
  const idx = cache.addresses.findIndex((a) => String(a.id) === String(id))
  if (idx >= 0) cache.addresses[idx] = addr
  return addr
}

async function deleteAddress(id) {
  await apiService.deleteAddress(id)
  cache.addresses = cache.addresses.filter((a) => String(a.id) !== String(id))
}

async function unbindApply(reason) {
  const application = await apiService.unbindApply(reason)
  cache.pendingUnbind = application
  return application
}

async function purchaseLive(liveId, useBalance = false) {
  const order = await apiService.purchaseLive(liveId, useBalance)
  if (!order) return null
  if (order.status === '待付款') await payOrder(order.id)
  await refresh()
  return cache.cards.find((card) => String(card.orderId) === String(order.id)) || order
}

async function submitManagerApply(form) {
  const app = await apiService.submitManagerApply(form)
  cache.application = app
  return app
}

async function loadManagerDashboard(managerId) {
  // 带上当前登录会员身份，服务端只允许主理人查看自己的工作台
  const dash = await apiService.loadManagerDashboard(managerId)
  cache.managerView = dash.manager
  cache.managerCustomers = dash.customers
  cache.commissions = dash.commissions
  cache.withdraws = dash.withdraws
  cache.manager = dash.manager
  return dash
}

async function applyWithdraw(managerId, amount) {
  const record = await apiService.applyWithdraw(managerId, amount)
  cache.withdraws.unshift(record)
  return record
}

module.exports = {
  init,
  ready,
  refresh,
  refreshHome,
  refreshLives,
  refreshReviews,
  refreshOrders,
  refreshUserProfile,
  updateUserName,
  requireLogin: ensureLogin,
  get,
  getCategory,
  getAssistant,
  getFiling,
  getBrand,
  getCopy,
  getSocialQrs,
  getHomeAssistant,
  getHomeDisplay,
  assetUrl: apiAssetUrl,
  getActivities,
  getCatalogItems,
  getRegions,
  refreshRegions,
  refreshConfig,
  refreshPointMall,
  redeemPointProduct,
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
  formatPhoneDisplay,
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
  getBalanceTransactions,
  rechargeBalance,
  payManagerApplication,
  cancelOrder,
  refundOrder,
  advanceOrder,
  getOrderLogistics,
  refreshOrderLogistics,
  submitReview,
  saveParticipant,
  deleteParticipant,
  saveAddress,
  updateAddress,
  deleteAddress,
  unbindApply,
  purchaseLive,
  isActivityExpired,
  refundRuleText,
  displayStatus,
  submitManagerApply,
  loadManagerDashboard,
  applyWithdraw
}
