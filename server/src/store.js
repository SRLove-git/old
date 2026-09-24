import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { seed } from './seed.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_FILE = process.env.DATA_FILE
  ? path.resolve(process.env.DATA_FILE)
  : path.join(__dirname, '..', 'data.json')

let db = null

function clone(v) {
  return JSON.parse(JSON.stringify(v))
}

function normalizeActivities(db) {
  const seedActivities = new Map((seed.activities || []).map((item) => [String(item.id), item]))
  ;(db.activities || []).forEach((a) => {
    if (!a.sellType) a.sellType = 'date'
    if (a.sellType === 'sku') a.hasSku = true
    if (!Array.isArray(a.regionIds)) {
      const seeded = seedActivities.get(String(a.id)) || {}
      a.regionIds = clone(seeded.regionIds || [])
      if (seeded.city) a.city = seeded.city
    }
  })
  if (!Array.isArray(db.lives)) {
    db.lives = clone(seed.lives)
  } else {
    const seedLives = new Map((seed.lives || []).map((item) => [String(item.id), item]))
    db.lives = db.lives.map((item) => ({ ...(seedLives.get(String(item.id)) || {}), ...item }))
    const existing = new Set(db.lives.map((item) => String(item.id)))
    ;(seed.lives || []).forEach((item) => {
      if (!existing.has(String(item.id))) db.lives.push(clone(item))
    })
  }
  if (!Array.isArray(db.products)) {
    db.products = clone(seed.products)
  } else {
    const seedProducts = new Map((seed.products || []).map((item) => [String(item.id), item]))
    db.products = db.products.map((item) => ({ ...(seedProducts.get(String(item.id)) || {}), ...item }))
    const existingProducts = new Set(db.products.map((item) => String(item.id)))
    ;(seed.products || []).forEach((item) => {
      if (!existingProducts.has(String(item.id))) db.products.push(clone(item))
    })
  }
  if (!Array.isArray(db.cards)) {
    db.cards = clone(seed.cards)
  } else {
    const seedCards = new Map((seed.cards || []).map((item) => [String(item.id), item]))
    db.cards = db.cards.map((item) => ({ ...(seedCards.get(String(item.id)) || {}), ...item }))
  }
  // 迁移：把种子里的商品从活动移出，并同步商品类目类型，避免旧数据重复
  const productIds = new Set((seed.products || []).map((p) => String(p.id)))
  db.activities = (db.activities || []).filter((a) => !productIds.has(String(a.id)))
  Object.keys(db.categories || {}).forEach((id) => {
    if (seed.categories[id]) db.categories[id].type = seed.categories[id].type
  })
}

function normalizeConfig(db) {
  if (!db.config) db.config = {}
  // 合并种子默认配置，缺失的字段用种子值补齐（用户已改的值保留）
  db.config = { ...clone(seed.config), ...db.config }
  if (!Array.isArray(db.config.regions)) db.config.regions = clone(seed.config.regions)
}

function normalizeContent(db) {
  if (!Array.isArray(db.contentPosts)) {
    db.contentPosts = clone(seed.contentPosts || [])
  }
}

function normalizeCollections(db) {
  db.providerApplications ||= []
  db.unbindApplications ||= []
  db.settlementRecords ||= []
  db.commissions ||= []
  db.withdraws ||= []
}

// 订单状态与品类对齐：「待发货」只属于实物/到店商品类订单（分类 4、5），
// 活动、研学、学堂类订单付完款就是「待收货」（小程序显示为待出行/待使用）
function normalizeOrders(database) {
  let changed = 0
  ;(database.orders || []).forEach((order) => {
    const goods = [4, 5].includes(Number(order.category))
    if (!goods && order.status === '待发货') {
      order.status = '待收货'
      order.statusFixedAt = order.statusFixedAt || nowText()
      changed += 1
    }
  })
  return changed
}

// 历史报名人没有归属字段，按姓名认领会员；认不到的统一挂到演示账号，避免全站互相可见
function normalizeParticipants(database) {
  let changed = 0
  ;(database.participants || []).forEach((p) => {
    if (p.userId) return
    const owner = (database.customers || []).find((c) => String(c.name) === String(p.name))
    p.userId = owner ? owner.id : 'u1'
    changed += 1
  })
  return changed
}

// 主理人身份绑定：优先沿用已有 userId，缺失时按姓名+手机号认领会员账号
function normalizeManagers(database) {
  let changed = false
  ;(database.managers || []).forEach((m) => {
    if (managerUserIdOf(m) === null) {
      const owner = (database.customers || []).find((c) => String(c.name) === String(m.name)
        && String(c.phone || '') === String(m.phone || ''))
      if (owner) {
        m.userId = owner.id
        changed = true
      }
    }
  })
  ;(database.customers || []).forEach((c) => {
    const linked = (database.managers || []).some((m) => managerUserIdOf(m) === String(c.id))
    if (linked && !c.isManager) {
      c.isManager = true
      changed = true
    }
  })
  return changed
}

const LEGACY_PLACEHOLDER_TIME = '刚刚'

// 历史数据里的「刚刚」占位时间：用数据文件最后一次写入时间兜底，保证台账有时间可审
function legacyCreatedAtText() {
  try {
    const stat = fs.statSync(DATA_FILE)
    const d = new Date(stat.mtimeMs)
    const p = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  } catch (e) {
    return ''
  }
}

function normalizeTimestamps(database) {
  const fallback = legacyCreatedAtText() || new Date().toISOString().slice(0, 16).replace('T', ' ')
  let migrated = 0
  const walk = (value) => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      value.forEach(walk)
      return
    }
    Object.keys(value).forEach((key) => {
      const item = value[key]
      if (item === LEGACY_PLACEHOLDER_TIME) {
        value[key] = fallback
        migrated += 1
      } else if (item && typeof item === 'object') {
        walk(item)
      }
    })
  }
  walk(database)
  return migrated
}

function normalizeRegionIds(regionIds) {
  if (!Array.isArray(regionIds)) return []
  return [...new Set(regionIds.map(String).filter(Boolean))]
}

function regionText(regionIds, fallback = '') {
  const database = get()
  const ids = normalizeRegionIds(regionIds)
  const names = ids
    .map((id) => (database.config.regions || []).find((r) => String(r.id) === id)?.name)
    .filter(Boolean)
  return names.length ? names.join('、') : fallback
}

export function listRegions(options = {}) {
  const all = (get().config.regions || []).slice().sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0))
  return options.enabledOnly ? all.filter((r) => r.enabled !== false) : all
}

export function createRegion(data) {
  const database = get()
  const name = String((data && data.name) || '').trim()
  if (!name) throw new Error('地区名称不能为空')
  if (listRegions().some((r) => r.name === name)) throw new Error('地区名称已存在')
  const region = {
    id: `region-${Date.now()}`,
    name,
    enabled: data && data.enabled !== undefined ? !!data.enabled : true,
    sort: Number((data && data.sort) ?? (listRegions().length + 1) * 10)
  }
  database.config.regions.push(region)
  save()
  return region
}

export function updateRegion(id, data) {
  const database = get()
  const region = (database.config.regions || []).find((r) => String(r.id) === String(id))
  if (!region) return null
  const name = data && data.name !== undefined ? String(data.name).trim() : region.name
  if (!name) throw new Error('地区名称不能为空')
  if ((database.config.regions || []).some((r) => String(r.id) !== String(id) && r.name === name)) throw new Error('地区名称已存在')
  Object.assign(region, data || {}, { id: region.id, name })
  region.enabled = region.enabled !== false
  region.sort = Number(region.sort || 0)
  save()
  return region
}

export function init() {
  if (db) return db
  if (fs.existsSync(DATA_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
      normalizeActivities(db)
      normalizeConfig(db)
      normalizeContent(db)
      normalizeCollections(db)
      normalizeTimestamps(db)
      normalizeManagers(db)
      normalizeOrders(db)
      normalizeParticipants(db)
      syncManagerTotals()
      save()
      return db
    } catch (e) {
      db = null
    }
  }
  db = clone(seed)
  normalizeActivities(db)
  normalizeConfig(db)
  normalizeContent(db)
  normalizeCollections(db)
  normalizeManagers(db)
  normalizeOrders(db)
  normalizeParticipants(db)
  syncManagerTotals()
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
  normalizeCollections(db)
  normalizeConfig(db)
  normalizeManagers(db)
  normalizeOrders(db)
  normalizeParticipants(db)
  syncManagerTotals()
  save()
  return db
}

function normalizeKeyword(kw) {
  return String(kw || '').trim().toLowerCase().split(/\s+/).filter(Boolean)
}

export function activitySearchText(a) {
  const skuNames = (a.skus || []).map((s) => s.name).join(' ')
  const points = (a.points || []).join(' ')
  const regions = regionText(a.regionIds)
  return [a.title, a.city, regions, a.address, a.highlight, a.detail, points, skuNames]
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

export function createActivity(data) {
  const activity = {
    id: Date.now(),
    soldCount: 0,
    hasSku: false,
    skus: [],
    schedules: [],
    ...(data || {}),
    regionIds: normalizeRegionIds(data && data.regionIds)
  }
  activity.city = regionText(activity.regionIds, activity.city || '线上/全国')
  db.activities.unshift(activity)
  save()
  return activity
}

export function updateActivity(id, data) {
  const idx = db.activities.findIndex((a) => String(a.id) === String(id))
  if (idx < 0) return null
  const next = { ...db.activities[idx], ...(data || {}), id: db.activities[idx].id }
  if (data && data.regionIds !== undefined) next.regionIds = normalizeRegionIds(data.regionIds)
  next.city = regionText(next.regionIds, next.city || '线上/全国')
  db.activities[idx] = next
  save()
  return next
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

export function listContentPosts(options = {}) {
  let rows = (get().contentPosts || []).slice()
  if (options.type) rows = rows.filter((item) => item.type === options.type)
  if (options.publishedOnly) rows = rows.filter((item) => item.status === 1)
  return rows.sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')))
}

export function createContentPost(data) {
  get()
  const post = {
    id: `CONTENT${Date.now()}`,
    type: 'news',
    title: '',
    summary: '',
    source: '',
    publishedAt: new Date().toISOString().slice(0, 10),
    coverImage: '',
    originalUrl: '',
    videoUrl: '',
    content: '',
    regionIds: [],
    featured: false,
    status: 1,
    ...(data || {})
  }
  post.regionIds = normalizeRegionIds(post.regionIds)
  if (!String(post.title || '').trim()) throw new Error('标题不能为空')
  db.contentPosts.unshift(post)
  save()
  return post
}

export function updateContentPost(id, data) {
  get()
  const idx = db.contentPosts.findIndex((item) => String(item.id) === String(id))
  if (idx < 0) return null
  const next = { ...db.contentPosts[idx], ...(data || {}), id: db.contentPosts[idx].id }
  if (!String(next.title || '').trim()) throw new Error('标题不能为空')
  if (data && data.regionIds !== undefined) next.regionIds = normalizeRegionIds(data.regionIds)
  db.contentPosts[idx] = next
  save()
  return next
}

export function deleteContentPost(id) {
  get()
  db.contentPosts = db.contentPosts.filter((item) => String(item.id) !== String(id))
  save()
  return { ok: true }
}

function findManager(id) {
  return db.managers.find((m) => String(m.id) === String(id)) || null
}

// ---------------------------------------------------------------------------
// 佣金台账：主理人余额一律由佣金单实时汇总，不再读取 managers 表里的静态字段
// ---------------------------------------------------------------------------

export const COMMISSION_STATUS = {
  PENDING: '待结算',
  AVAILABLE: '可结算',
  WITHDRAWING: '提现中',
  SETTLED: '已结算',
  CLAWED: '已扣回'
}

function round2(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Number(n.toFixed(2))
}

function badRequest(message) {
  const err = new Error(message)
  err.status = 400
  return err
}

function forbidden(message) {
  const err = new Error(message)
  err.status = 403
  return err
}

// ---------------------------------------------------------------------------
// 主理人身份：主理人记录通过 userId 与登录会员绑定，工作台只能看自己的账本
// ---------------------------------------------------------------------------

const MANAGER_PUBLIC_FIELDS = ['id', 'name', 'phone', 'shopName', 'shopIntro', 'avatar', 'inviteCode', 'status', 'totalCustomers']

export function publicManager(manager) {
  if (!manager) return null
  const view = {}
  MANAGER_PUBLIC_FIELDS.forEach((key) => {
    if (manager[key] !== undefined) view[key] = manager[key]
  })
  return view
}

function managerUserIdOf(manager) {
  return manager && manager.userId != null && manager.userId !== '' ? String(manager.userId) : null
}

export function findManagerByUser(userId, options = {}) {
  const key = String(userId == null ? '' : userId)
  if (!key) return null
  // 已清退（status 3）的主理人不再拥有工作台权限
  return db.managers.find((m) => (managerUserIdOf(m) === key || String(m.id) === key)
    && (options.includeRevoked || Number(m.status) !== 3)) || null
}

export function isManagerUser(userId) {
  return Boolean(findManagerByUser(userId))
}

export function listPublicManagers() {
  return db.managers.filter((m) => Number(m.status) !== 3).map(publicManager)
}

export function commissionAmountOf(record) {
  return round2(record && record.commissionAmount)
}

function sumCommissions(rows) {
  return round2(rows.reduce((total, row) => total + commissionAmountOf(row), 0))
}

export function managerBalance(managerId) {
  const rows = db.commissions.filter((c) => String(c.managerId) === String(managerId))
  const pick = (...statuses) => rows.filter((c) => statuses.includes(c.status))
  const pending = sumCommissions(pick(COMMISSION_STATUS.PENDING))
  const available = sumCommissions(pick(COMMISSION_STATUS.AVAILABLE))
  const withdrawing = sumCommissions(pick(COMMISSION_STATUS.WITHDRAWING))
  const settled = sumCommissions(pick(COMMISSION_STATUS.SETTLED))
  const month = currentMonthKey()
  const monthRows = rows.filter((c) => String(c.createTime || '').slice(0, 7) === month && c.status !== COMMISSION_STATUS.CLAWED)
  const monthCommission = sumCommissions(monthRows)
  const monthPerformance = round2(monthRows.reduce((total, c) => total + Number(c.payAmount || 0), 0))
  const clawedBack = round2(Math.abs(sumCommissions(pick(COMMISSION_STATUS.CLAWED))))
  // 已打款后又发生退款，会生成负向「待结算」佣金单，形成需要抵扣的负债
  const debt = round2(Math.abs(sumCommissions(rows.filter((c) => c.status === COMMISSION_STATUS.PENDING && commissionAmountOf(c) < 0))))
  const availableTotal = round2(available)
  return {
    pending,
    available: availableTotal,
    withdrawable: round2(Math.max(0, availableTotal)),
    withdrawing,
    settled,
    clawedBack,
    debt,
    monthCommission,
    monthPerformance,
    total: round2(pending + availableTotal + withdrawing + settled),
    commissionCount: rows.length
  }
}

export function listManagers() {
  return db.managers.map((m) => ({ ...m, ...managerBalance(m.id) }))
}

function syncManagerTotals() {
  let changed = false
  db.managers.forEach((m) => {
    const balance = managerBalance(m.id)
    const next = {
      totalCommission: balance.total,
      total: balance.total,
      available: balance.available,
      pending: balance.pending,
      withdrawing: balance.withdrawing,
      settled: balance.settled,
      clawback: balance.clawedBack
    }
    Object.keys(next).forEach((key) => {
      if (m[key] !== next[key]) {
        m[key] = next[key]
        changed = true
      }
    })
    const performance = round2(
      db.commissions
        .filter((c) => String(c.managerId) === String(m.id) && c.status !== COMMISSION_STATUS.CLAWED)
        .reduce((total, c) => total + Number(c.payAmount || 0), 0)
    )
    m.totalPerformance = performance
    const boundCustomers = db.customers.filter((c) => String(c.managerId) === String(m.id)).length
    m.totalCustomers = boundCustomers
    m.customers = boundCustomers
  })
  return changed
}

function resolveRate(activity, manager) {
  if (activity && activity.managerCommissionRate) return Number(activity.managerCommissionRate)
  if (manager && manager.commissionRate) return Number(manager.commissionRate)
  return Number(db.config.globalCommissionRate || 8)
}

// 入会赠送券等带 welcomeFor 的券只属于指定会员；没有 welcomeFor 的是全站通用券
function couponBelongsToUser(coupon, userId) {
  if (!coupon || !coupon.welcomeFor) return true
  return String(coupon.welcomeFor) === String(userId == null ? '' : userId)
}

function visibleCouponsFor(userId) {
  return db.coupons.filter((coupon) => couponBelongsToUser(coupon, userId))
}

export function couponApplicable(coupon, activity, amount, userId) {
  if (!coupon || coupon.used) return false
  if (!couponBelongsToUser(coupon, userId)) return false
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
  const activity = [...db.activities, ...(db.products || [])].find((a) => String(a.id) === String(order.activityId))
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

function releaseSchedule(order) {
  const activity = [...db.activities, ...(db.products || [])].find((a) => String(a.id) === String(order.activityId))
  const schedule = activity && order.schedule ? activity.schedules.find((s) => s.id === order.schedule.id) : null
  if (schedule) {
    schedule.soldQuota = Math.max(0, (schedule.soldQuota || 0) - order.count)
    schedule.remaining = Math.max(0, schedule.totalQuota - schedule.soldQuota)
  }
}

function returnCoupon(order, force = false) {
  if (!order.couponId) return
  if (!force) {
    const rule = db.config.couponRefundReturn || 'auto'
    if (rule === 'never') return
    // auto 规则：已核销/待评价/已完成 视为已消费，不退券；待发货/待收货 退券
    if (rule === 'auto' && ['已核销', '待评价', '已完成'].includes(order.status)) return
  }
  const coupon = db.coupons.find((c) => c.id === order.couponId)
  if (coupon) coupon.used = false
}

function generateCommission(order) {
  if (!order.managerId) return
  const manager = findManager(order.managerId)
  if (!manager) return
  const activity = [...db.activities, ...(db.products || [])].find((a) => String(a.id) === String(order.activityId))
  const rate = resolveRate(activity, manager)
  const amount = Number((order.payAmount * rate / 100).toFixed(2))
  const buyer = db.customers.find((c) => String(c.id) === String(order.userId)) || null
  order.commissionRate = rate
  order.commissionAmount = amount
  db.commissions.unshift({
    id: `CM${Date.now()}`,
    managerId: manager.id,
    orderId: order.id,
    customerId: order.userId,
    // 客户名取下单会员，报名人（可能多人）单独保留，便于对账
    customerName: (buyer && buyer.name) || order.buyerName || '会员',
    participantText: order.participants || '',
    productName: order.title,
    payAmount: order.payAmount,
    commissionRate: rate,
    commissionAmount: amount,
    status: COMMISSION_STATUS.PENDING,
    createTime: nowText()
  })
}

export function createOrder(payload) {
  const activity = [...db.activities, ...(db.products || [])].find((a) => String(a.id) === String(payload.activityId))
  if (!activity) return null
  const limit = activity.limitPerUser || 99
  if (payload.count > limit) throw new Error(`每人限购${limit}份`)
  const isSkuOnly = activity.sellType === 'sku'
  const hasSku = activity.hasSku || isSkuOnly
  const sku = hasSku ? activity.skus.find((s) => s.id === payload.skuId) || activity.skus[0] || null : null
  const memberPrice = sku ? sku.memberPrice : activity.memberPrice
  const schedule = isSkuOnly ? null : activity.schedules.find((s) => s.id === payload.scheduleId) || activity.schedules[0] || null
  if (schedule && schedule.remaining < payload.count) throw new Error('该时间段名额不足')
  const venueAddress = (sku && sku.address) || activity.address || ''
  const venueDistrict = (sku && sku.district) || ''
  let coupon = null
  let discount = 0
  if (payload.couponId) {
    coupon = db.coupons.find((c) => c.id === payload.couponId)
    if (!couponApplicable(coupon, activity, memberPrice * payload.count, payload.userId || 'u1')) coupon = null
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
    venueAddress,
    venueDistrict,
    schedule,
    participants: payload.participants,
    count: payload.count,
    memberPrice,
    payAmount,
    discount,
    address: payload.address || null,
    status: deferred ? '待付款' : ([4, 5].includes(activity.category) ? '待发货' : '待收货'),
    coupon: coupon ? coupon.title : '未使用',
    couponId: coupon ? coupon.id : null,
    code: `${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)}`,
    managerId: db.customers.find((c) => c.id === (payload.userId || 'u1'))?.managerId || null,
    commissionRate: 0,
    commissionAmount: 0,
    createdAt: nowText(),
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
      returnCoupon(o, true)
    }
  })
  save()
}

export function payOrder(id) {
  const order = db.orders.find((o) => o.id === id)
  if (!order || order.status !== '待付款') return null
  order.status = [4, 5].includes(order.category) ? '待发货' : '待收货'
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
  returnCoupon(order, true)
  save()
  return order
}

// 已打款佣金被扣回时形成负债：写一张负向「待结算」佣金单，抵扣后续佣金
function pushClawbackDebt(commission, amount, order) {
  const debt = round2(amount)
  if (debt <= 0) return
  db.commissions.unshift({
    id: `CMR${Date.now()}${Math.floor(Math.random() * 1000)}`,
    managerId: commission.managerId,
    orderId: order ? order.id : commission.orderId,
    customerId: commission.customerId,
    customerName: commission.customerName,
    productName: `${commission.productName}（退款扣回）`,
    payAmount: 0,
    commissionRate: 0,
    commissionAmount: -debt,
    status: COMMISSION_STATUS.PENDING,
    type: 'refund-clawback',
    sourceCommissionId: commission.id,
    createTime: nowText(),
    remark: '佣金已打款后发生退款，转为负债抵扣后续佣金'
  })
  addLog('佣金扣回', `已打款佣金扣回 ¥${debt}（原佣金单 ${commission.id}），计入负债抵扣后续佣金`)
}

// 提现中的佣金被扣回时，同步下调提现单金额与税费，必要时撤销提现单
function reduceWithdrawForClawback(commission, amount, order) {
  const record = db.withdraws.find((w) => String(w.id) === String(commission.withdrawId))
  if (!record) return
  const deduction = round2(Math.min(round2(amount), round2(record.amount)))
  if (deduction <= 0) return
  record.amount = round2(round2(record.amount) - deduction)
  record.tax = round2(record.amount * Number(record.taxRate || 0) / 100)
  record.actualAmount = round2(record.amount - record.tax)
  record.clawbackAmount = round2(round2(record.clawbackAmount || 0) + deduction)
  record.commissionIds = (record.commissionIds || []).filter((cid) => String(cid) !== String(commission.id))
  record.commissionCount = record.commissionIds.length
  record.adjustNote = `订单 ${order ? order.id : commission.orderId} 退款，扣减 ¥${deduction}`
  record.adjustTime = nowText()
  if (record.amount <= 0 && record.status === '待审核') {
    record.status = '已撤销'
    record.rejectReason = '关联佣金已全额退款扣回，提现单自动撤销'
    record.amount = 0
    record.tax = 0
    record.actualAmount = 0
  }
  addLog('提现调整', `提现单 ${record.id} 因订单退款扣减 ¥${deduction}，剩余 ¥${record.amount}（状态：${record.status}）`)
}

export function clawbackCommission(order, ratio = 1) {
  if (!order) return []
  const rows = db.commissions.filter((c) => String(c.orderId) === String(order.id)
    && c.status !== COMMISSION_STATUS.CLAWED
    && c.type !== 'refund-clawback'
    && commissionAmountOf(c) > 0)
  const touched = []
  rows.forEach((c) => {
    const amount = commissionAmountOf(c)
    const deduct = round2(amount * ratio)
    if (deduct <= 0) return
    const originalStatus = c.status
    c.clawbackAmount = round2(round2(c.clawbackAmount || 0) + deduct)
    c.clawedAt = nowText()
    c.clawbackReason = `订单 ${order.id} ${ratio >= 1 ? '全额退款' : `按 ${Math.round(ratio * 100)}% 退款`}扣回`
    c.preClawbackStatus = originalStatus
    if (ratio >= 1) {
      c.status = COMMISSION_STATUS.CLAWED
    } else {
      c.commissionAmount = round2(amount - deduct)
    }
    if (originalStatus === COMMISSION_STATUS.WITHDRAWING) {
      reduceWithdrawForClawback(c, deduct, order)
    } else if (originalStatus === COMMISSION_STATUS.SETTLED) {
      pushClawbackDebt(c, deduct, order)
    }
    touched.push(c.id)
  })
  if (touched.length) {
    addLog('佣金扣回', `订单 ${order.id} 退款，处理佣金单 ${touched.join('、')}`)
  }
  return touched
}

function refundNeedAudit() {
  return db.config.refundNeedAudit !== false
}

// 真正执行退款：退券、释放名额、按比例扣回佣金、写入退款时间
function applyRefund(order, ratio, reason) {
  const value = Number(ratio == null ? 1 : ratio)
  returnCoupon(order)
  order.refundRatio = value
  order.refundAmount = value >= 1 ? Number(order.payAmount) : Number((order.payAmount * value).toFixed(2))
  order.refundReason = reason
  order.refundTime = nowText()
  order.status = '已退款'
  order.refundPrevStatus = null
  order.refundAuditRequired = false
  releaseSchedule(order)
  clawbackCommission(order, value)
  return order
}

// 用户申请退款：默认进入「退款中」等待运营审核（config.refundNeedAudit 关闭后为即时退款）
export function refundOrder(id, reason) {
  const order = db.orders.find((o) => o.id === id)
  if (!order) return { order: null, error: '订单不存在' }
  const calc = calcRefund(order)
  if (!calc.can) return { order, error: calc.reason }
  order.refundRatio = calc.ratio
  order.refundAmount = calc.amount
  order.refundReason = reason || '用户申请退款'
  order.refundApplyTime = nowText()
  if (!refundNeedAudit()) {
    applyRefund(order, calc.ratio, order.refundReason)
    addLog('订单退款', `订单 ${order.id} 即时退款 ¥${order.refundAmount}`)
    save()
    return { order }
  }
  order.refundPrevStatus = order.status
  order.status = '退款中'
  order.refundAuditRequired = true
  addLog('退款申请', `订单 ${order.id} 申请退款 ¥${order.refundAmount}（${calc.reason}）`)
  save()
  return { order, pending: true }
}

export function advanceOrder(id) {
  const order = db.orders.find((o) => o.id === id)
  if (!order) return null
  if (order.status === '待发货') order.status = order.category === 4 ? '已核销' : '待收货'
  else if (order.status === '待收货' || order.status === '已核销') order.status = '待评价'
  save()
  return order
}

function orderReceiverText(order) {
  const address = order.address || {}
  const parts = [address.province, address.city, address.district, address.detail].filter(Boolean)
  return {
    receiver: address.name || address.receiver || '',
    receiverPhone: address.phone || '',
    receiverAddress: parts.join('')
  }
}

// 后台发货：快递单号（或标记无需物流），只允许从「待发货」发出，可在「待收货」阶段改单号
export function shipOrder(orderId, payload = {}) {
  const order = db.orders.find((o) => String(o.id) === String(orderId))
  if (!order) throw badRequest('订单不存在')
  const isUpdate = payload.update === true && order.status === '待收货'
  if (order.status !== '待发货' && !isUpdate) {
    throw badRequest(`订单当前状态为「${order.status}」，不可发货`)
  }
  const noLogistics = payload.deliveryType === 'self' || payload.noLogistics === true
  const carrier = String(payload.carrier || '').trim()
  const trackingNo = String(payload.trackingNo || '').trim()
  if (!noLogistics) {
    if (!carrier) throw badRequest('请填写快递公司')
    if (!/^[A-Za-z0-9-]{6,32}$/.test(trackingNo)) throw badRequest('快递单号格式不正确（6-32位字母/数字/短横线）')
    if (!order.address) throw badRequest('该订单没有收货地址，如为线下交付请选择「无需物流」')
  }
  const receiver = orderReceiverText(order)
  order.deliveryType = noLogistics ? 'self' : 'express'
  order.carrier = noLogistics ? '无需物流' : carrier
  order.trackingNo = noLogistics ? '' : trackingNo
  order.shippingNote = String(payload.note || '').trim()
  order.shipTime = nowText()
  order.shippedBy = payload.operator || 'admin'
  if (!isUpdate) order.status = '待收货'
  addLog('订单发货', isUpdate
    ? `订单 ${order.id} 物流信息更新为 ${order.carrier} ${order.trackingNo || ''}`.trim()
    : `订单 ${order.id} 已发货：${order.carrier} ${order.trackingNo || ''} → ${receiver.receiver} ${receiver.receiverPhone}`.trim())
  save()
  return order
}

export function getOrderByCode(code) {
  const normalized = String(code || '').replace(/\s+/g, '')
  const order = db.orders.find((o) => String(o.code || '').replace(/\s+/g, '') === normalized)
  if (!order) throw new Error('核销码不存在')
  return order
}

export function verifyOrder(orderId) {
  const order = db.orders.find((o) => String(o.id) === String(orderId))
  if (!order) throw new Error('订单不存在')
  if (order.status === '已核销') throw new Error('该订单已核销')
  if (order.status !== '待发货' && order.status !== '待收货') throw new Error('当前状态不可核销')
  order.status = '已核销'
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
      time: nowText()
    })
  }
  save()
  return order
}

function currentMonthKey() {
  return nowText().slice(0, 7)
}

// 只锁定与本次申请金额等额的佣金单；跨单据时把边界上的佣金单拆成两张
function lockCommissionsForWithdraw(managerId, amount, record) {
  const locked = []
  let remaining = round2(amount)
  const pool = db.commissions
    .filter((c) => c.status === COMMISSION_STATUS.AVAILABLE && String(c.managerId) === String(managerId))
    .sort((a, b) => String(a.createTime || '').localeCompare(String(b.createTime || '')))
  pool.forEach((c) => {
    if (remaining <= 0) return
    const value = commissionAmountOf(c)
    if (value <= 0) return
    if (value <= remaining) {
      c.status = COMMISSION_STATUS.WITHDRAWING
      c.withdrawId = record.id
      c.withdrawTime = record.applyTime
      remaining = round2(remaining - value)
      locked.push(c)
      return
    }
    const index = db.commissions.indexOf(c)
    const partial = {
      ...c,
      id: `${c.id}-W${Date.now()}${locked.length}`,
      commissionAmount: remaining,
      status: COMMISSION_STATUS.WITHDRAWING,
      withdrawId: record.id,
      withdrawTime: record.applyTime,
      splitFrom: c.id,
      splitRemainder: false
    }
    c.commissionAmount = round2(value - remaining)
    c.splitRemainder = true
    db.commissions.splice(index + 1, 0, partial)
    locked.push(partial)
    remaining = 0
  })
  return locked
}

function commissionRowsOf(withdrawId, status) {
  return db.commissions.filter((c) => String(c.withdrawId) === String(withdrawId)
    && (!status || c.status === status))
}

export function applyWithdraw(managerId, amount, options = {}) {
  const manager = findManager(managerId)
  if (!manager) throw badRequest('主理人不存在')
  if (Number(manager.status) !== 1) throw badRequest('当前主理人状态不可发起提现')
  const value = round2(amount)
  if (!(value > 0)) throw badRequest('提现金额必须大于 0')
  const minWithdraw = round2(db.config.minWithdraw ?? 100)
  if (value < minWithdraw) throw badRequest(`最低提现金额为 ¥${minWithdraw}`)
  const monthlyLimit = Number(db.config.withdrawMonthlyLimit ?? 1)
  const month = currentMonthKey()
  const usedThisMonth = db.withdraws.filter((w) => String(w.managerId) === String(managerId)
    && !['已拒绝', '已撤销'].includes(w.status)
    && String(w.applyTime || '').slice(0, 7) === month).length
  if (monthlyLimit > 0 && usedThisMonth >= monthlyLimit) throw badRequest(`每月最多提现 ${monthlyLimit} 次`)
  const balance = managerBalance(managerId)
  if (value > balance.withdrawable) throw badRequest(`超出可结算余额 ¥${balance.withdrawable}`)

  const taxRate = Number(db.config.withdrawTaxRate ?? 20)
  const tax = round2(value * taxRate / 100)
  const record = {
    id: `WD${Date.now()}`,
    managerId: manager.id,
    managerName: manager.name,
    amount: value,
    taxRate,
    tax,
    actualAmount: round2(value - tax),
    status: '待审核',
    applyTime: nowText(),
    payChannel: '微信零钱',
    availableBefore: balance.withdrawable,
    commissionIds: [],
    commissionCount: 0,
    source: options.source || 'miniprogram'
  }
  const lockable = db.commissions.filter((c) => c.status === COMMISSION_STATUS.AVAILABLE && String(c.managerId) === String(manager.id))
  if (sumCommissions(lockable) + 0.01 < value) throw badRequest('可结算佣金不足，请刷新后重试')
  const locked = lockCommissionsForWithdraw(manager.id, value, record)
  if (!locked.length) throw badRequest('没有可锁定的可结算佣金')
  record.commissionIds = locked.map((c) => c.id)
  record.commissionCount = locked.length
  db.withdraws.unshift(record)
  addLog('提现申请', `${manager.name} 申请提现 ¥${value}，锁定佣金单 ${record.commissionCount} 笔（实付 ¥${record.actualAmount}）`)
  save()
  return record
}

export function approveWithdraw(id, operator = 'admin') {
  const record = db.withdraws.find((w) => String(w.id) === String(id))
  if (!record) throw badRequest('提现单不存在')
  if (record.status !== '待审核') throw badRequest(`提现单当前状态为「${record.status}」，不可重复打款`)
  const rows = commissionRowsOf(record.id, COMMISSION_STATUS.WITHDRAWING)
  const lockedTotal = sumCommissions(rows)
  if (!rows.length || lockedTotal <= 0) throw badRequest('该提现单没有锁定中的佣金，不能打款')
  if (Math.abs(lockedTotal - round2(record.amount)) > 0.01) {
    record.amount = lockedTotal
    record.tax = round2(lockedTotal * Number(record.taxRate || 0) / 100)
    record.actualAmount = round2(lockedTotal - record.tax)
    addLog('提现审核', `提现单 ${record.id} 金额按锁定佣金校正为 ¥${record.amount}`)
  }
  record.status = '已到账'
  record.payTime = nowText()
  record.operator = operator
  record.settledCommissionIds = rows.map((c) => c.id)
  rows.forEach((c) => {
    c.status = COMMISSION_STATUS.SETTLED
    c.settleTime = nowText()
  })
  addLog('提现审核', `提现单 ${record.id} 已打款 ¥${record.amount}（代扣税 ¥${record.tax}，实付 ¥${record.actualAmount}）`)
  save()
  return record
}

export function rejectWithdraw(id, reason, operator = 'admin') {
  const record = db.withdraws.find((w) => String(w.id) === String(id))
  if (!record) throw badRequest('提现单不存在')
  if (record.status !== '待审核') throw badRequest(`提现单当前状态为「${record.status}」，不可重复审核`)
  record.status = '已拒绝'
  record.rejectReason = reason || '资料不全'
  record.auditTime = nowText()
  record.operator = operator
  commissionRowsOf(record.id, COMMISSION_STATUS.WITHDRAWING).forEach((c) => {
    c.status = COMMISSION_STATUS.AVAILABLE
    c.withdrawId = null
    c.withdrawTime = null
  })
  addLog('提现审核', `提现单 ${record.id} 已拒绝并释放锁定佣金，原因：${record.rejectReason}`)
  save()
  return record
}

export function settleCommissions(options = {}) {
  const managerId = options.managerId
  const orderId = options.orderId
  const ids = Array.isArray(options.ids) ? options.ids.map(String) : null
  const from = options.from || options.periodStart || null
  const to = options.to || options.periodEnd || null
  const rows = db.commissions.filter((c) => {
    if (c.status !== COMMISSION_STATUS.PENDING) return false
    if (managerId && String(c.managerId) !== String(managerId)) return false
    if (orderId && String(c.orderId) !== String(orderId)) return false
    if (ids && !ids.includes(String(c.id))) return false
    const time = String(c.createTime || '')
    if (from && time < from) return false
    if (to && time > to) return false
    return true
  })
  if (!rows.length) throw badRequest('没有符合条件的待结算佣金')
  rows.forEach((c) => {
    c.status = COMMISSION_STATUS.AVAILABLE
    c.settleTime = nowText()
  })
  const manager = managerId ? findManager(managerId) : null
  const record = {
    id: `ST${Date.now()}`,
    managerId: manager ? manager.id : null,
    managerName: manager ? manager.name : (managerId ? String(managerId) : '全部主理人'),
    orderId: orderId || null,
    commissionIds: rows.map((c) => c.id),
    count: rows.length,
    amount: sumCommissions(rows),
    period: from || to ? `${from || '期初'} ~ ${to || '至今'}` : '按条件结算',
    operator: options.operator || 'admin',
    settledAt: nowText()
  }
  db.settlementRecords = db.settlementRecords || []
  db.settlementRecords.unshift(record)
  addLog('佣金结算', `${record.managerName} 结算 ${rows.length} 笔佣金，合计 ¥${record.amount}（结算单 ${record.id}）`)
  save()
  return { record, settled: rows }
}

export function getSettlementRecords(managerId) {
  const rows = db.settlementRecords || []
  if (!managerId) return rows
  return rows.filter((r) => String(r.managerId) === String(managerId))
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
  const userId = form.userId || 'u1'
  let customer = db.customers.find((c) => String(c.id) === String(userId)) || null
  const name = String(form.name || '').trim()
  const phone = normalizePhone(form.phone)
  const accountName = customer ? String(customer.name || '').trim() : ''
  if (!name) throw badRequest('请填写真实姓名')
  if (!/^1\d{10}$/.test(phone)) throw badRequest('手机号格式不正确，请填写11位手机号（如 13812346688）')
  // 账号已有资料时以账号为准，避免冒用他人身份申请
  if (accountName && accountName !== name) throw badRequest(`姓名需与账号信息一致（当前账号：${accountName}）`)
  if (!customer) {
    // 登录用户还没有会员档案时补建一条，避免申请流程走不通
    customer = { id: userId, name, phone, member: true, balance: 0, points: 0, managerId: null, isManager: false }
    db.customers.push(customer)
    addLog('用户管理', `补建会员档案：${name} ${maskPhone(phone)}`)
  } else if (!accountName) {
    // 申请联系电话可与登录账号不同，不用表单电话覆盖账号资料。
    if (!accountName) customer.name = name
    addLog('用户管理', `完善会员资料：${name} ${maskPhone(phone)}`)
  }
  const scaleText = String(form.scale || '')
  const groupCount = Number(form.groupCount ?? (scaleText.match(/(\d+)\s*个?群/) || [])[1] ?? 0)
  const memberCount = Number(form.memberCount ?? (scaleText.match(/(\d+)\s*人/) || [])[1] ?? 0)
  if (groupCount > 50 || memberCount > 5000) throw badRequest('社群规模超出限制')
  const hasPending = db.managerApplications.some((a) => a.status === '待审核' && String(a.userId) === String(userId))
  const alreadyManager = Boolean(findManagerByUser(userId)) || Boolean(customer.isManager)
  if (hasPending || alreadyManager) throw badRequest('已有待审核的申请或已是主理人')
  const fee = Number(db.config.managerApplyFee ?? 0)
  if (fee > 0 && !form.paid) {
    const err = new Error('请先支付主理人申请费用')
    err.status = 400
    throw err
  }
  const app = {
    id: `APP${Date.now()}`,
    ...form,
    userId,
    name,
    phone,
    paid: fee > 0 ? true : Boolean(form.paid),
    paidAmount: fee,
    paidAt: fee > 0 ? nowText() : '',
    status: '待审核',
    submittedAt: nowText()
  }
  db.managerApplications.unshift(app)
  save()
  return app
}

function nowText() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// 手机号统一成 11 位数字：容忍空格、短横线、+86 前缀等写法
export function normalizePhone(value) {
  let digits = String(value == null ? '' : value).replace(/\D/g, '')
  if (digits.length === 13 && digits.startsWith('86')) digits = digits.slice(2)
  return digits
}

export function maskPhone(value) {
  const phone = normalizePhone(value)
  if (phone.length !== 11) return phone || '未绑定'
  return `${phone.slice(0, 3)}****${phone.slice(7)}`
}

export function applyProvider(payload) {
  const { userId, name, phone, type, intro } = payload || {}
  if (!String(name || '').trim() || !String(phone || '').trim()) throw new Error('请填写姓名和手机号')
  if (!/^1\d{10}$/.test(String(phone || ''))) throw new Error('请填写正确的11位手机号')
  const hasPending = (db.providerApplications || []).some((a) => a.status === '待审核' && String(a.userId) === String(userId))
  if (hasPending) throw new Error('已有待审核的申请')
  const record = {
    id: `PA${Date.now()}`,
    userId,
    name: String(name).trim(),
    phone: String(phone).trim(),
    type: type || '',
    intro: intro || '',
    status: '待审核',
    submittedAt: nowText()
  }
  db.providerApplications.unshift(record)
  save()
  return record
}

export function auditProvider(id, approve, rejectReason) {
  const app = (db.providerApplications || []).find((a) => String(a.id) === String(id))
  if (!app) return null
  app.status = approve ? '已通过' : '已拒绝'
  if (!approve) app.rejectReason = rejectReason || ''
  addLog('服务商审核', `${approve ? '通过' : '拒绝'} ${app.name} 的服务商申请${approve ? '' : `，原因：${rejectReason || ''}`}`)
  save()
  return app
}

export function approveManagerApp(id) {
  const app = db.managerApplications.find((a) => a.id === id)
  if (!app) return null
  const existing = app.userId ? findManagerByUser(app.userId) : null
  if (existing) throw badRequest(`${app.name} 已是主理人，无需重复通过`)
  app.status = '已通过'
  const manager = {
    id: Date.now(),
    userId: app.userId || null,
    name: app.name,
    phone: app.phone,
    inviteCode: `SYL${Math.floor(100 + Math.random() * 900)}`,
    commissionRate: null,
    status: 1,
    totalPerformance: 0,
    totalCommission: 0,
    available: 0,
    pending: 0,
    totalCustomers: 0
  }
  db.managers.push(manager)
  const customer = db.customers.find((c) => String(c.id) === String(manager.userId))
  if (customer) customer.isManager = true
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
      if (managerUserIdOf(m) && String(c.id) === managerUserIdOf(m)) c.isManager = false
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
    b.unbindTime = nowText()
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
      b.unbindTime = nowText()
      b.unbindReason = reason
    }
  })
  db.bindings.unshift({
    id: `B${Date.now()}`,
    customerId,
    customerName: c.name,
    managerId,
    bindSource: 4,
    bindTime: nowText(),
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
    if (order.status === '已退款') throw badRequest('该订单已退款，无需重复操作')
    // 用户申请的按算好的比例退，运营直接退的全额退
    const ratio = order.status === '退款中' && order.refundRatio != null ? Number(order.refundRatio) : 1
    applyRefund(order, ratio, reason || order.refundReason || '运营退款')
    order.refundAuditTime = nowText()
    addLog('退款审核', `订单 ${orderId} 同意退款 ¥${order.refundAmount}`)
  } else {
    // 拒绝后回到申请前的状态，订单继续正常履约
    order.status = order.refundPrevStatus || '待发货'
    order.refundPrevStatus = null
    order.refundRejected = reason || '审核拒绝'
    order.refundAuditTime = nowText()
    order.refundAuditRequired = false
    addLog('退款审核', `订单 ${orderId} 拒绝退款：${order.refundRejected}`)
  }
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
  const balances = new Map(db.managers.map((m) => [String(m.id), managerBalance(m.id)]))
  const managerRanking = db.managers
    .slice()
    .sort((a, b) => (balances.get(String(b.id)).total || 0) - (balances.get(String(a.id)).total || 0))
    .map((m) => {
      const balance = balances.get(String(m.id))
      return {
        id: m.id,
        name: m.name,
        totalCommission: balance.total,
        available: balance.available,
        pending: balance.pending,
        settling: balance.withdrawing,
        settled: balance.settled,
        totalCustomers: m.totalCustomers
      }
    })
  const activeOrders = db.orders.filter((o) => !['已取消', '已退款'].includes(o.status))
  const totalCommission = round2([...balances.values()].reduce((s, b) => s + b.total, 0))
  const settledWithdraws = db.withdraws.filter((w) => w.status === '已到账')
  return {
    activityCount: db.activities.length,
    orderCount: db.orders.length,
    customerCount: db.customers.length,
    managerCount: db.managers.length,
    pendingApply: db.managerApplications.filter((a) => a.status === '待审核').length,
    pendingWithdraw: db.withdraws.filter((w) => w.status === '待审核').length,
    pendingShipCount: db.orders.filter((o) => o.status === '待发货').length,
    pendingRefundCount: db.orders.filter((o) => o.status === '退款中').length,
    pendingWithdrawAmount: round2(db.withdraws.filter((w) => w.status === '待审核').reduce((s, w) => s + Number(w.amount || 0), 0)),
    totalCommission,
    pendingCommission: round2([...balances.values()].reduce((s, b) => s + b.pending, 0)),
    availableCommission: round2([...balances.values()].reduce((s, b) => s + b.available, 0)),
    withdrawnCommission: round2(settledWithdraws.reduce((s, w) => s + Number(w.amount || 0), 0)),
    clawbackCommission: round2([...balances.values()].reduce((s, b) => s + b.clawedBack, 0)),
    totalRevenue: round2(activeOrders.reduce((s, o) => s + Number(o.payAmount || 0), 0)),
    byCategory,
    managerRanking,
    settlementCount: (db.settlementRecords || []).length,
    orderStatus: db.orders.reduce((acc, o) => {
      acc[o.status] = (acc[o.status] || 0) + 1
      return acc
    }, {})
  }
}

export function adminNotifications() {
  const items = []
  const add = (type, id, title, description, time, target) => {
    items.push({ id: `${type}-${id}`, type, title, description, time: time || '', target })
  }

  db.managerApplications
    .filter((item) => item.status === '待审核')
    .forEach((item) => add('manager', item.id, '新的主理人申请', `${item.name || '用户'}提交了主理人申请`, item.submittedAt, 'applications'))
  ;(db.providerApplications || [])
    .filter((item) => item.status === '待审核')
    .forEach((item) => add('provider', item.id, '新的服务商申请', `${item.name || '用户'}提交了服务商申请`, item.submittedAt, 'providers'))
  ;(db.unbindApplications || [])
    .filter((item) => item.status === '待审核')
    .forEach((item) => add('unbind', item.id, '新的解绑申请', `${item.customerName || '用户'}申请解绑主理人${item.managerName ? ` ${item.managerName}` : ''}`, item.submittedAt, 'bindings'))
  db.orders
    .filter((item) => item.status === '退款中')
    .forEach((item) => {
      const customer = db.customers.find((customerItem) => String(customerItem.id) === String(item.userId))
      add('refund', item.id, '新的退款申请', `${customer?.name || '用户'}申请订单「${item.title || item.id}」退款`, item.refundApplyTime || item.createdAt, 'orders')
    })
  db.withdraws
    .filter((item) => item.status === '待审核')
    .forEach((item) => add('withdraw', item.id, '新的提现申请', `${item.managerName || '主理人'}申请提现 ¥${round2(item.amount).toFixed(2)}`, item.applyTime, 'withdraws'))

  items.sort((a, b) => String(b.time).localeCompare(String(a.time)))
  return { total: items.length, items }
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
  const all = (get().lives || []).map((live) => {
    const enriched = enrichLive(live)
    if (userId) enriched.purchased = (db.cards || []).some((c) => String(c.liveId) === String(live.id) && String(c.userId) === String(userId))
    return enriched
  })
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
    memberPrice: Number((data && data.memberPrice) || 0),
    originalPrice: Number((data && data.originalPrice) || 0),
    lessonCount: Number((data && data.lessonCount) || 1),
    duration: (data && data.duration) || '',
    category: (data && data.category) || '视频课程',
    coverImage: (data && data.coverImage) || '',
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

export function listProducts() {
  return get().products || []
}

export function createProduct(data) {
  const product = {
    id: Date.now(),
    soldCount: 0,
    sellType: 'sku',
    hasSku: false,
    skus: [],
    points: [],
    stock: 0,
    status: 1,
    ...data,
    regionIds: normalizeRegionIds(data && data.regionIds)
  }
  product.city = regionText(product.regionIds, product.city || '全国')
  db.products = db.products || []
  db.products.unshift(product)
  save()
  return product
}

export function updateProduct(id, data) {
  const idx = (db.products || []).findIndex((p) => String(p.id) === String(id))
  if (idx < 0) return null
  const next = { ...db.products[idx], ...data, id: db.products[idx].id }
  if (data && data.regionIds !== undefined) next.regionIds = normalizeRegionIds(data.regionIds)
  next.city = regionText(next.regionIds, next.city || '全国')
  db.products[idx] = next
  save()
  return db.products[idx]
}

export function deleteProduct(id) {
  db.products = (db.products || []).filter((p) => String(p.id) !== String(id))
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

const BIND_SOURCE_LABELS = { 1: '扫码绑定', 2: '链接绑定', 3: '邀请码绑定', 4: '客服调整' }

function bindLogView(b) {
  const manager = findManager(b.managerId)
  const managerName = manager ? manager.name : (b.managerName || '')
  if (b.status === 1) return { id: b.id, time: b.bindTime, action: '绑定', managerName, reason: BIND_SOURCE_LABELS[b.bindSource] || '' }
  if (b.status === 3) return { id: b.id, time: b.unbindTime, action: '更换主理人', managerName, reason: b.unbindReason || '' }
  return { id: b.id, time: b.unbindTime, action: '解绑', managerName, reason: b.unbindReason || '' }
}

export function getUserProfile(userId) {
  const raw = db.customers.find((c) => c.id === userId) || { id: userId, name: '用户', member: true, balance: 0, points: 0, managerId: null, isManager: false }
  const user = { ...raw, ...memberIdentity(raw) }
  const cards = db.cards.filter((c) => c.userId === userId)
  const boundManager = user.managerId ? publicManager(findManager(user.managerId)) : null
  const addresses = db.addresses.filter((a) => a.userId === userId)
  const ownManagerRecord = findManagerByUser(userId)
  const ownManager = ownManagerRecord ? { ...ownManagerRecord, ...managerBalance(ownManagerRecord.id) } : null
  const isManager = Boolean(ownManagerRecord) || Boolean(user.isManager)
  const application = db.managerApplications.find((a) => a.userId && String(a.userId) === String(userId))
    || db.managerApplications.find((a) => String(a.name) === String(user.name)) || null
  const pendingUnbind = (db.unbindApplications || []).find((a) => a.status === '待审核' && String(a.customerId) === String(userId)) || null
  const providerApplication = (db.providerApplications || []).find((a) => String(a.userId) === String(userId)) || null
  const bindLogs = db.bindings.filter((b) => b.customerId === userId).map(bindLogView)
  return {
    user,
    cards,
    boundManager,
    addresses,
    coupons: visibleCouponsFor(userId),
    isManager,
    manager: ownManager,
    application,
    pendingUnbind,
    providerApplication,
    bindLogs
  }
}

export function joinMember(userId) {
  const user = db.customers.find((c) => String(c.id) === String(userId))
  if (!user) throw badRequest('会员不存在')
  const wasMember = Boolean(user.member)
  user.member = true
  const now = new Date()
  if (!user.memberSince) user.memberSince = `${now.getFullYear()}年${now.getMonth() + 1}月`
  if (!user.memberLevel) user.memberLevel = 2
  if (!user.memberExpireAt) user.memberExpireAt = '长期有效'
  // 首次入会赠送 2 张无门槛券；已入会则不重复发放
  if (!wasMember) {
    const granted = db.coupons.filter((c) => c.welcomeFor && String(c.welcomeFor) === String(userId))
    if (granted.length === 0) {
      const base = {
        type: 1,
        title: '入会专享10元券',
        desc: '全场通用',
        value: 10,
        minAmount: 0,
        expireAt: '2026-12-31',
        used: false,
        welcomeFor: userId
      }
      db.coupons.push(
        { id: `welcome${Date.now()}a`, ...base },
        { id: `welcome${Date.now()}b`, ...base }
      )
    }
  }
  save()
  return { user: { ...user, ...memberIdentity(user) }, coupons: visibleCouponsFor(userId), alreadyMember: wasMember }
}

export function findOrCreateWechatCustomer(openid, unionid = '') {
  const normalizedOpenId = String(openid || '').trim()
  if (!normalizedOpenId) throw badRequest('微信 openid 不能为空')
  let user = db.customers.find((item) => String(item.wechatOpenId || '') === normalizedOpenId)
  if (!user && unionid) user = db.customers.find((item) => String(item.wechatUnionId || '') === String(unionid))
  if (!user) {
    user = {
      id: `wx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      name: '微信用户',
      phone: '',
      member: false,
      balance: 0,
      points: 0,
      managerId: null,
      isManager: false,
      wechatOpenId: normalizedOpenId,
      wechatUnionId: String(unionid || ''),
      createdAt: nowText(),
      lastLoginAt: nowText()
    }
    db.customers.push(user)
    addLog('用户登录', `新微信用户 ${user.id} 首次登录`)
  } else {
    user.wechatOpenId = normalizedOpenId
    if (unionid) user.wechatUnionId = String(unionid)
    user.lastLoginAt = nowText()
  }
  save()
  return { id: user.id, name: user.name || '微信用户', member: Boolean(user.member) }
}

export function purchaseLive(liveId, userId) {
  const live = (db.lives || []).find((l) => String(l.id) === String(liveId))
  if (!live) throw new Error('课程不存在')
  const exists = (db.cards || []).some((c) => String(c.liveId) === String(live.id) && String(c.userId) === String(userId))
  if (exists) throw new Error('已购买过该课程')
  const total = Number(live.lessonCount || 10)
  const d = new Date()
  d.setFullYear(d.getFullYear() + 1)
  const p = (n) => String(n).padStart(2, '0')
  const card = {
    id: `card${Date.now()}`,
    userId,
    liveId: live.id,
    title: `${live.title}（${total}次卡）`,
    courseName: live.title,
    teacher: live.hostName || '',
    validUntil: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    remain: total,
    total,
    attendanceRecords: []
  }
  db.cards.unshift(card)
  // 购课同样走订单 + 佣金体系，避免课程销售游离在分佣之外
  const buyer = db.customers.find((c) => String(c.id) === String(userId)) || null
  const price = round2(live.memberPrice || live.originalPrice || 0)
  const order = {
    id: `SYL${Date.now()}`,
    userId,
    source: 'live',
    liveId: live.id,
    activityId: live.activityId != null ? live.activityId : null,
    title: `${live.title}（${total}次卡）`,
    category: 3,
    cover: live.cover,
    coverTone: live.coverTone,
    skuName: '',
    venueAddress: '',
    venueDistrict: '',
    schedule: null,
    participants: buyer ? buyer.name : '会员',
    count: 1,
    memberPrice: price,
    payAmount: price,
    discount: 0,
    status: '已完成',
    coupon: '未使用',
    couponId: null,
    code: `${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)}`,
    managerId: buyer ? buyer.managerId : null,
    commissionRate: 0,
    commissionAmount: 0,
    createdAt: nowText(),
    payTime: nowText(),
    payDeadline: null,
    cardId: card.id
  }
  db.orders.unshift(order)
  card.orderId = order.id
  live.soldCount = Number(live.soldCount || 0) + 1
  if (price > 0) generateCommission(order)
  save()
  return card
}

function checkInCardRecord(cardId, data = {}, options = {}) {
  const card = db.cards.find((item) => String(item.id) === String(cardId))
  if (!card) throw new Error('计次卡不存在')
  if (options.userId && String(card.userId) !== String(options.userId)) throw forbidden('无权使用其他会员的计次卡')
  if (Number(card.remain || 0) <= 0) throw new Error('计次卡剩余次数不足')
  card.attendanceRecords = Array.isArray(card.attendanceRecords) ? card.attendanceRecords : []
  const checkedAt = nowText()
  const date = String(data.date || checkedAt.slice(0, 10)).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw badRequest('签到日期格式不正确')
  const sessionId = String(data.sessionId || '')
  const existing = sessionId
    ? card.attendanceRecords.find((item) => String(item.id) === sessionId)
    : card.attendanceRecords.find((item) => String(item.date) === date)
  if (existing && existing.status === 'checked') throw new Error('本节课程已签到')
  const record = existing || {
    id: sessionId || `att${Date.now()}`,
    date,
    time: data.time || '',
    lesson: data.lesson || card.courseName || card.title,
    teacher: data.teacher || card.teacher || '',
    location: data.location || ''
  }
  record.status = 'checked'
  record.checkedAt = checkedAt
  record.checkinType = options.type || 'self'
  record.memberName = String(data.memberName || '')
  record.memberPhone = normalizePhone(data.memberPhone)
  record.latitude = data.latitude === '' || data.latitude == null ? null : Number(data.latitude)
  record.longitude = data.longitude === '' || data.longitude == null ? null : Number(data.longitude)
  record.accuracy = data.accuracy === '' || data.accuracy == null ? null : Number(data.accuracy)
  record.operator = String(data.operator || '')
  record.makeupReason = String(data.reason || '').trim()
  if (!existing) card.attendanceRecords.unshift(record)
  card.remain = Math.max(0, Number(card.remain || 0) - 1)
  save()
  return card
}

export function selfCheckInCard(cardId, userId, data = {}) {
  const customer = db.customers.find((item) => String(item.id) === String(userId))
  if (!customer) throw new Error('会员不存在')
  const latitude = Number(data.latitude)
  const longitude = Number(data.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw badRequest('请先获取签到位置')
  const memberName = String(customer.name && customer.name !== '微信用户' ? customer.name : data.memberName || '').trim()
  const memberPhone = normalizePhone(customer.phone || data.memberPhone)
  if (!memberName) throw badRequest('请补充签到人姓名')
  if (!/^1\d{10}$/.test(memberPhone)) throw badRequest('请补充正确的手机号')
  return checkInCardRecord(cardId, {
    ...data,
    memberName,
    memberPhone,
    location: data.location || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
  }, { userId, type: 'self' })
}

export function makeupCheckInCard(cardId, data = {}) {
  const reason = String(data.reason || '').trim()
  if (!reason) throw badRequest('请填写补签原因')
  return checkInCardRecord(cardId, {
    ...data,
    operator: data.operator || '后台管理员',
    location: data.location || '后台补签'
  }, { type: 'makeup' })
}

// 兼容其他内部调用；管理后台使用独立的补签接口。
export function checkInCard(cardId, data = {}) {
  return checkInCardRecord(cardId, data, { type: 'makeup' })
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
      b.unbindTime = nowText()
      b.unbindReason = '重新绑定'
    }
  })
  db.bindings.unshift({
    id: `B${Date.now()}`,
    customerId: userId,
    customerName: customer ? customer.name : '用户',
    managerId: manager.id,
    managerName: manager.name,
    bindSource: source || 3,
    bindTime: nowText(),
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
      b.unbindTime = nowText()
      b.unbindReason = reason
    }
  })
  save()
  return customer
}

export function applyUnbind(userId, reason) {
  const customer = db.customers.find((c) => String(c.id) === String(userId))
  if (!customer || !customer.managerId) throw new Error('当前未绑定主理人')
  if (!String(reason || '').trim()) throw new Error('请填写申请理由')
  const hasPending = (db.unbindApplications || []).some((a) => a.status === '待审核' && String(a.customerId) === String(userId))
  if (hasPending) throw new Error('已有待审核的解绑申请')
  const manager = findManager(customer.managerId)
  const record = {
    id: `UB${Date.now()}`,
    customerId: userId,
    customerName: customer.name,
    managerId: customer.managerId,
    managerName: manager ? manager.name : '',
    reason: String(reason).trim(),
    status: '待审核',
    submittedAt: nowText()
  }
  db.unbindApplications.unshift(record)
  save()
  return record
}

export function auditUnbind(id, approve, rejectReason) {
  const app = (db.unbindApplications || []).find((a) => String(a.id) === String(id))
  if (!app) return null
  if (approve) {
    app.status = '已通过'
    unbindCustomerByUser(app.customerId, app.reason)
  } else {
    app.status = '已拒绝'
    app.rejectReason = rejectReason || ''
    save()
  }
  return app
}

export function getManagerDashboard(managerId, viewer = {}) {
  const manager = db.managers.find((m) => String(m.id) === String(managerId)) || null
  if (!manager) throw badRequest('主理人不存在')
  if (!viewer.isAdmin) {
    if (!viewer.userId) throw forbidden('请先登录后再查看主理人工作台')
    const own = findManagerByUser(viewer.userId)
    if (!own || String(own.id) !== String(manager.id)) throw forbidden('只能查看自己的主理人工作台')
  }
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
  // 可推广对象：活动 + 商品 + 课程，统一带出该主理人的佣金比例与预估佣金
  const promotions = [
    ...activities,
    ...(db.products || []).map((p) => {
      const rate = resolveRate(p, manager)
      const basePrice = Number(p.memberPrice || p.price || 0)
      return {
        id: p.id,
        title: p.title,
        cover: p.cover,
        coverTone: p.coverTone,
        category: p.category,
        city: p.city,
        type: 'product',
        memberPrice: p.memberPrice,
        price: p.price,
        commissionRate: rate,
        commissionAmount: Number((basePrice * rate / 100).toFixed(2))
      }
    }),
    ...(db.lives || []).map((l) => {
      const rate = resolveRate(null, manager)
      const basePrice = Number(l.memberPrice || l.originalPrice || 0)
      return {
        id: l.id,
        title: l.title,
        cover: l.cover,
        coverTone: l.coverTone,
        category: l.category,
        city: '线上课程',
        type: 'live',
        memberPrice: l.memberPrice,
        price: l.originalPrice,
        commissionRate: rate,
        commissionAmount: Number((basePrice * rate / 100).toFixed(2))
      }
    })
  ]
  const balance = managerBalance(managerId)
  const managerView = manager ? { ...manager, ...balance } : { id: managerId, name: '主理人', ...balance }
  return {
    manager: managerView,
    balance,
    customers,
    commissions,
    withdraws,
    settlements: getSettlementRecords(managerId),
    activities,
    promotions,
    config
  }
}
