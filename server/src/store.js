import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { seed } from './seed.js'
import { passwordMatches, passwordRecord } from './lib/session.js'
import { carrierCode, carrierName } from './lib/kdniao.js'
import { badRequest, clone, forbidden, maskPhone, normalizePhone, nowText, round2 } from './lib/domain-values.js'
import { readJsonFileSync, writeJsonFileAtomicSync } from './lib/json-file-store.js'
import { calculateRefund } from './lib/refund-policy.js'
import { pendingStatusForMode, serviceModeOfOffering } from './lib/order-fulfillment.js'
import { COMMISSION_STATUS, commissionAmountOf, sumCommissions } from './lib/commission-values.js'
import { normalizePaidOfferingPrices, requiredPaidPrice } from './lib/offering-prices.js'
import { normalizeContentPost } from './lib/content-posts.js'
import { normalizeBalanceRechargeAmounts } from './lib/balance-config.js'
import { fenToYuan, multiplyFen, yuanToFen } from './lib/money.js'

export { maskPhone, normalizePhone } from './lib/domain-values.js'
export { scheduleDaysUntil } from './lib/refund-policy.js'
export { COMMISSION_STATUS, commissionAmountOf } from './lib/commission-values.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_FILE = process.env.DATA_FILE
  ? path.resolve(process.env.DATA_FILE)
  : path.join(__dirname, '..', 'data.json')

let db = null

function normalizeActivities(db) {
  const paidPrice = (value) => {
    const price = Number(value)
    return Number.isFinite(price) && price >= 0.01 ? Number(price.toFixed(2)) : 0.01
  }
  const normalizeOfferingPrice = (offering, includeRegularPrice = true) => {
    offering.memberPrice = paidPrice(offering.memberPrice)
    if (includeRegularPrice) offering.price = paidPrice(offering.price)
    if (Array.isArray(offering.skus)) {
      offering.skus.forEach((sku) => {
        sku.memberPrice = paidPrice(sku.memberPrice)
        if (includeRegularPrice) sku.price = paidPrice(sku.price)
      })
    }
  }
  const seedActivities = new Map((seed.activities || []).map((item) => [String(item.id), item]))
  ;(db.activities || []).forEach((a) => {
    normalizeOfferingPrice(a)
    if (!a.sellType) a.sellType = 'date'
    if (a.sellType === 'sku') a.hasSku = true
    if (!a.serviceMode) {
      a.serviceMode = (a.city === '线上' || a.address === '线上直播') ? 'online' : (Number(a.category) === 4 ? 'verify_code' : 'checkin')
    }
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
  db.lives.forEach((live) => {
    normalizeOfferingPrice(live, false)
    live.lessons = normalizeLiveLessons(Array.isArray(live.lessons) ? live.lessons : (
      live.replayUrl ? [{ title: '完整课程回放', duration: live.duration || '', videoUrl: live.replayUrl, isPreview: false, status: 1 }] : []
    ))
    if (live.lessons.length) live.lessonCount = live.lessons.length
  })
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
  db.products.forEach((product) => {
    normalizeOfferingPrice(product)
    if (!product.serviceMode) product.serviceMode = 'delivery'
  })
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
    const homeDisplayLimit = Number(db.categories[id].homeDisplayLimit)
    db.categories[id].homeDisplayLimit = Number.isInteger(homeDisplayLimit) && homeDisplayLimit >= 0 && homeDisplayLimit <= 50
      ? homeDisplayLimit
      : 6
  })
}

function normalizeConfig(db) {
  if (!db.config) db.config = {}
  // 合并种子默认配置，缺失的字段用种子值补齐（用户已改的值保留）
  const savedConfig = db.config
  db.config = {
    ...clone(seed.config),
    ...savedConfig,
    brand: { ...clone(seed.config.brand), ...(savedConfig.brand || {}) },
    copy: { ...clone(seed.config.copy), ...(savedConfig.copy || {}) },
    assistant: { ...clone(seed.config.assistant), ...(savedConfig.assistant || {}) },
    homeAssistant: { ...clone(seed.config.homeAssistant), ...(savedConfig.homeAssistant || {}) },
    homeDisplay: { ...clone(seed.config.homeDisplay), ...(savedConfig.homeDisplay || {}) },
    socialQrs: { ...clone(seed.config.socialQrs), ...(savedConfig.socialQrs || {}) },
    filing: { ...clone(seed.config.filing), ...(savedConfig.filing || {}) }
  }
  if (Number(db.config.brandPlaceholderVersion || 0) < 2) {
    const brandCopyKeys = [
      'loginTitle', 'homeHeroKicker', 'homeHighlightBrand', 'socialFollowTip', 'officialAccountName',
      'videoChannelName', 'detailGalleryBrand', 'courseTeacherDescription', 'merchantBenefitsSubtitle',
      'defaultShopIntro', 'profileEditDescription', 'shareManagerTitle', 'shareActivityTitle'
    ]
    const currentBrand = String(db.config.brand?.chineseName || '').trim()
    brandCopyKeys.forEach((key) => {
      if (typeof db.config.copy[key] !== 'string') return
      let value = db.config.copy[key].replace(/岁悦里/g, '{brand}')
      if (currentBrand && currentBrand !== '岁悦里') value = value.split(currentBrand).join('{brand}')
      db.config.copy[key] = value
    })
    db.config.brandPlaceholderVersion = 2
  }
  if (!Array.isArray(db.config.regions)) db.config.regions = clone(seed.config.regions)
  db.config.balanceRechargeAmounts = normalizeBalanceRechargeAmounts(db.config.balanceRechargeAmounts)
}

function normalizeContent(db) {
  if (!Array.isArray(db.contentPosts)) {
    db.contentPosts = clone(seed.contentPosts || [])
  }
  db.contentPosts.forEach((post) => {
    if (!Array.isArray(post.contentBlocks) || !post.contentBlocks.length) {
      post.contentBlocks = String(post.content || '').trim()
        ? [{ type: 'text', text: String(post.content).trim() }]
        : []
    }
  })
}

function normalizeCollections(db) {
  db.adminAccounts ||= []
  const bootstrapUsername = String(process.env.ADMIN_USER || 'admin').trim().toLowerCase()
  const bootstrapPassword = String(process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'suiyueli-admin'))
  if (bootstrapPassword && !db.adminAccounts.some((account) => account.username === bootstrapUsername)) {
    db.adminAccounts.push({
      id: 'admin-super',
      username: bootstrapUsername,
      name: '超级管理员',
      role: 'super_admin',
      permissions: ['*'],
      status: 1,
      createdAt: nowText(),
      ...passwordRecord(bootstrapPassword)
    })
  }
  db.adminAccounts.forEach((account) => {
    account.role ||= account.id === 'admin-super' ? 'super_admin' : 'staff'
    account.permissions = account.role === 'super_admin' ? ['*'] : (Array.isArray(account.permissions) ? account.permissions : [])
    account.status = Number(account.status ?? 1)
    if (process.env.NODE_ENV === 'production' && account.id === 'admin-super' && !process.env.ADMIN_PASSWORD) account.status = 0
  })
  db.merchantAccounts ||= []
  db.merchantAccounts.forEach((account) => {
    account.permissions = Array.isArray(account.permissions)
      ? account.permissions
      : ['merchant.activities', 'merchant.products', 'merchant.courses']
    account.status = Number(account.status ?? 1)
  })
  db.providerApplications ||= []
  db.unbindApplications ||= []
  db.settlementRecords ||= []
  db.balanceRecharges ||= []
  db.balanceRecharges.forEach((recharge) => {
    recharge.amountFen = Number.isSafeInteger(recharge.amountFen) ? recharge.amountFen : yuanToFen(recharge.amount || 0, '充值金额')
    recharge.amount = fenToYuan(recharge.amountFen)
  })
  db.balanceTransactions ||= []
  db.wechatNotifications ||= []
  db.wechatNotifications.forEach((item) => {
    if (item.status === 'processing') item.status = 'pending'
  })
  db.customers ||= []
  db.customers.forEach((customer) => {
    customer.balanceFen = Number.isSafeInteger(customer.balanceFen) ? customer.balanceFen : yuanToFen(Math.max(0, Number(customer.balance || 0)), '余额')
    customer.balance = fenToYuan(customer.balanceFen)
  })
  db.commissions ||= []
  db.withdraws ||= []
  db.withdraws.forEach((withdraw) => {
    const taxRate = Number(withdraw.taxRate ?? db.config?.withdrawTaxRate ?? 20)
    withdraw.taxRate = Number.isFinite(taxRate) ? taxRate : 20
    withdraw.tax = round2(withdraw.tax ?? (Number(withdraw.amount || 0) * withdraw.taxRate / 100))
    withdraw.actualAmount = round2(withdraw.actualAmount ?? (Number(withdraw.amount || 0) - withdraw.tax))
    withdraw.payChannel ||= '微信零钱'
    withdraw.payOrderNo ||= ''
    withdraw.financeRemark ||= ''
  })
  db.pointProducts ||= clone(seed.pointProducts || [])
  db.pointOrders ||= []
  db.logisticsShipments ||= []
  db.logisticsWebhookLogs ||= []
  db.managerApplications ||= []
  db.managerApplications.forEach((application) => {
    const scaleText = String(application.scale || '')
    if (application.groupCount == null) application.groupCount = Number((scaleText.match(/(\d+)\s*个?群/) || [])[1] || 0)
    if (application.memberCount == null) application.memberCount = Number((scaleText.match(/(\d+)\s*人/) || [])[1] || 0)
    const legacyAmount = Math.max(0, Number(application.paidAmount || 0))
    if (application.feeAmount == null) application.feeAmount = legacyAmount
    application.feeAmount = Math.max(0, Number(application.feeAmount || 0))
    application.paidAmount = application.paymentStatus === '待支付' || application.status === '待付款' ? 0 : legacyAmount
    application.paymentOrderNo ||= ''
    application.paymentMethod ||= application.paidAmount > 0 ? '微信支付' : ''
    application.paidAt ||= ''
    application.paymentStatus ||= application.paidAmount > 0 ? '待核对' : '未收费'
    application.financeRemark ||= ''
  })
}

function couponRecordId() {
  return `UC${Date.now()}${Math.random().toString(36).slice(2, 8)}`
}

function templateSnapshot(template) {
  return {
    title: template.title,
    desc: template.desc || '',
    type: Number(template.type || 1),
    value: Number(template.value || 0),
    minAmount: Number(template.minAmount || 0),
    scopeCategory: template.scopeCategory ?? null,
    scopeProductId: template.scopeProductId ?? null,
    expireAt: template.expireAt || '',
    publisherType: template.publisherType === 'merchant' ? 'merchant' : 'platform',
    managerId: template.publisherType === 'merchant' ? template.managerId : null
  }
}

function normalizeCoupons(database) {
  database.userCoupons ||= []
  if (Number(database.couponModelVersion || 0) >= 2) {
    database.couponTemplates ||= []
    return
  }
  const legacy = Array.isArray(database.couponTemplates) ? database.couponTemplates : (database.coupons || [])
  const templates = []
  const legacyTemplateMap = new Map()
  const claimedAt = nowText()
  legacy.forEach((coupon) => {
    const template = {
      ...coupon,
      id: coupon.welcomeFor ? `TPL-${coupon.id}` : coupon.id,
      status: coupon.status === 0 ? 0 : 1,
      distribution: coupon.welcomeFor ? 'direct' : 'auto',
      perUserLimit: coupon.welcomeFor ? 2 : 1
    }
    delete template.used
    delete template.welcomeFor
    templates.push(template)
    legacyTemplateMap.set(String(coupon.id), template)
    if (coupon.welcomeFor) {
      database.userCoupons.push({
        id: couponRecordId(),
        templateId: template.id,
        userId: String(coupon.welcomeFor),
        status: coupon.used ? 'used' : 'unused',
        claimedAt,
        usedAt: coupon.used ? claimedAt : '',
        orderId: '',
        claimSource: 'legacy-welcome',
        snapshot: templateSnapshot(template)
      })
    }
  })
  ;(database.orders || []).forEach((order) => {
    if (!order.couponId) return
    const template = legacyTemplateMap.get(String(order.couponId))
    if (!template) return
    let record = database.userCoupons.find((item) => String(item.templateId) === String(template.id)
      && String(item.userId) === String(order.userId)
      && String(item.orderId || '') === String(order.id))
    if (!record) {
      const paid = !['待付款', '已取消'].includes(order.status)
      record = {
        id: couponRecordId(),
        templateId: template.id,
        userId: String(order.userId),
        status: paid ? 'used' : (order.status === '待付款' ? 'locked' : 'unused'),
        claimedAt: order.createdAt || claimedAt,
        lockedAt: order.status === '待付款' ? order.createdAt || claimedAt : '',
        usedAt: paid ? order.payTime || order.createdAt || claimedAt : '',
        orderId: paid || order.status === '待付款' ? order.id : '',
        claimSource: 'legacy-order',
        snapshot: templateSnapshot(template)
      }
      database.userCoupons.push(record)
    }
    order.couponTemplateId = template.id
    order.couponId = record.id
  })
  database.couponTemplates = templates
  delete database.coupons
  database.couponModelVersion = 2
}

function serviceModeOfOrder(order) {
  if (order?.serviceMode) return order.serviceMode
  const offering = [...(db?.activities || []), ...(db?.products || [])]
    .find((item) => String(item.id) === String(order?.activityId))
  return serviceModeOfOffering(offering || order)
}

// 迁移历史订单：实物走物流，活动走签到/核销，线上内容走使用确认。
function normalizeOrders(database) {
  let changed = 0
  const offerings = [...(database.activities || []), ...(database.products || [])]
  ;(database.orders || []).forEach((order) => {
    order.payAmountFen = Number.isSafeInteger(order.payAmountFen) ? order.payAmountFen : yuanToFen(order.payAmount || 0, '订单金额')
    order.balancePaidFen = Number.isSafeInteger(order.balancePaidFen) ? order.balancePaidFen : yuanToFen(order.balancePaidAmount || 0, '余额支付金额')
    order.balanceRefundFen = Number.isSafeInteger(order.balanceRefundFen) ? order.balanceRefundFen : yuanToFen(order.balanceRefundAmount || 0, '余额退款金额')
    order.wechatPayFen = Number.isSafeInteger(order.wechatPayFen) ? order.wechatPayFen : Math.max(0, order.payAmountFen - order.balancePaidFen)
    order.wechatRefundFen = Number.isSafeInteger(order.wechatRefundFen) ? order.wechatRefundFen : yuanToFen(order.wechatRefundAmount || 0, '微信退款金额')
    order.payAmount = fenToYuan(order.payAmountFen)
    order.balancePaidAmount = fenToYuan(order.balancePaidFen)
    order.balanceRefundAmount = fenToYuan(order.balanceRefundFen)
    order.wechatPayAmount = fenToYuan(order.wechatPayFen)
    order.wechatRefundAmount = fenToYuan(order.wechatRefundFen)
    order.balanceStatus ||= order.balancePaidAmount > 0 ? (order.paymentStatus === 'SUCCESS' ? 'consumed' : 'locked') : 'unused'
    const offering = offerings.find((item) => String(item.id) === String(order.activityId)) || order
    const mode = order.serviceMode || serviceModeOfOffering(offering)
    if (order.serviceMode !== mode) {
      order.serviceMode = mode
      changed += 1
    }
    if (mode !== 'delivery' && ['待发货', '待收货'].includes(order.status)) {
      order.status = pendingStatusForMode(mode)
      order.statusFixedAt = order.statusFixedAt || nowText()
      changed += 1
    }
    if (mode !== 'delivery' && order.status === '已核销') {
      order.status = '待评价'
      order.fulfillmentStatus = mode === 'checkin' ? '已签到' : '已核销'
      order.checkedAt ||= order.verifiedAt || nowText()
      changed += 1
    }
    if (order.refundPrevStatus && mode !== 'delivery' && ['待发货', '待收货'].includes(order.refundPrevStatus)) {
      order.refundPrevStatus = pendingStatusForMode(mode)
      changed += 1
    }
  })
  return changed
}

function normalizeCommissionAmounts(database) {
  const offerings = [...(database.activities || []), ...(database.products || [])]
  const orderMap = new Map((database.orders || []).map((order) => [String(order.id), order]))
  ;(database.orders || []).forEach((order) => {
    const offering = offerings.find((item) => String(item.id) === String(order.activityId)) || {}
    const count = Math.max(1, Number(order.count || 1))
    const discountedAmount = round2(order.discountedAmount ?? (Number(order.memberPrice || 0) * count))
    const originalUnitPrice = Number(order.originalUnitPrice ?? offering.originalPrice ?? offering.price ?? order.memberPrice ?? 0)
    const originalAmount = round2(order.originalAmount ?? (originalUnitPrice * count) ?? discountedAmount)
    const actualPaidAmount = round2(order.actualPaidAmount ?? order.payAmount ?? 0)
    order.originalUnitPrice = round2(originalUnitPrice)
    order.originalAmount = Math.max(originalAmount, discountedAmount, actualPaidAmount)
    order.discountedAmount = Math.max(discountedAmount, actualPaidAmount)
    order.couponDiscountAmount = round2(Math.max(0, order.discountedAmount - actualPaidAmount))
    order.actualPaidAmount = actualPaidAmount
    // 历史订单只补充归属快照说明，不根据会员当前归属反写 managerId，
    // 避免改绑后把已经发生的消费和佣金迁移到新主理人。
    order.managerAssignedAt ||= order.payTime || order.createdAt || ''
    order.attributionSource ||= order.payTime ? '支付时会员归属快照' : '历史订单归属快照'
  })
  ;(database.commissions || []).forEach((commission) => {
    if (commission.type === 'refund-clawback') {
      commission.originalAmount ??= 0
      commission.discountedAmount ??= 0
      commission.actualPaidAmount ??= 0
      commission.commissionBasis = 'actualPaidAmount'
      return
    }
    const order = orderMap.get(String(commission.orderId)) || {}
    commission.originalAmount = round2(commission.originalAmount ?? order.originalAmount ?? commission.payAmount ?? 0)
    commission.discountedAmount = round2(commission.discountedAmount ?? order.discountedAmount ?? commission.payAmount ?? 0)
    commission.actualPaidAmount = round2(commission.actualPaidAmount ?? order.actualPaidAmount ?? commission.payAmount ?? 0)
    commission.payAmount = commission.actualPaidAmount
    commission.commissionBasis = 'actualPaidAmount'
    commission.managerAssignedAt ||= order.managerAssignedAt || commission.createTime || ''
    commission.attributionSource ||= order.attributionSource || '历史订单归属快照'
    commission.bindingId ||= order.bindingId || null
  })
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

function normalizeMerchantContent(database) {
  const managers = (database.managers || []).filter((item) => item.status !== 3)
  const fallback = managers[0]
  if (!fallback) return false
  let changed = false
  ;(database.activities || []).forEach((item) => {
    if (item.publisherType === 'platform') {
      if (item.managerId != null) {
        item.managerId = null
        changed = true
      }
      return
    }
    if (item.managerId && managers.some((manager) => String(manager.id) === String(item.managerId))) {
      if (item.publisherType !== 'merchant') {
        item.publisherType = 'merchant'
        changed = true
      }
      return
    }
    item.managerId = fallback.id
    item.publisherType = 'merchant'
    changed = true
  })
  ;(database.products || []).forEach((item) => {
    if (item.publisherType === 'platform') {
      if (item.managerId != null) {
        item.managerId = null
        changed = true
      }
      return
    }
    if (item.managerId && managers.some((manager) => String(manager.id) === String(item.managerId))) {
      if (item.publisherType !== 'merchant') {
        item.publisherType = 'merchant'
        changed = true
      }
      return
    }
    item.managerId = fallback.id
    item.publisherType = 'merchant'
    changed = true
  })
  ;(database.lives || []).forEach((item) => {
    if (item.managerId && managers.some((manager) => String(manager.id) === String(item.managerId))) return
    const matched = managers.find((manager) => String(manager.name) === String(item.hostName)) || fallback
    item.managerId = matched.id
    changed = true
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
  const code = String((data && (data.code || data.districtCode)) || '').trim()
  if (!name) throw new Error('地区名称不能为空')
  if (code && listRegions().some((r) => String(r.code || r.districtCode || '') === code)) throw new Error('该行政区已经存在')
  if (!code && listRegions().some((r) => r.name === name && !r.code)) throw new Error('地区名称已存在')
  const region = {
    id: `region-${Date.now()}`,
    name,
    province: String((data && data.province) || '').trim(),
    city: String((data && data.city) || '').trim(),
    district: String((data && data.district) || name).trim(),
    provinceCode: String((data && data.provinceCode) || '').trim(),
    cityCode: String((data && data.cityCode) || '').trim(),
    districtCode: code,
    code,
    fullName: String((data && data.fullName) || '').trim(),
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
  const code = data && (data.code !== undefined || data.districtCode !== undefined)
    ? String(data.code || data.districtCode || '').trim()
    : String(region.code || region.districtCode || '').trim()
  if (!name) throw new Error('地区名称不能为空')
  if (code && (database.config.regions || []).some((r) => String(r.id) !== String(id) && String(r.code || r.districtCode || '') === code)) throw new Error('该行政区已经存在')
  if (!code && (database.config.regions || []).some((r) => String(r.id) !== String(id) && r.name === name && !r.code)) throw new Error('地区名称已存在')
  Object.assign(region, data || {}, { id: region.id, name, code, districtCode: code })
  region.enabled = region.enabled !== false
  region.sort = Number(region.sort || 0)
  save()
  return region
}

export function init() {
  if (db) return db
  const persisted = readJsonFileSync(DATA_FILE)
  if (persisted) {
    db = persisted
    normalizeActivities(db)
    normalizeConfig(db)
    normalizeContent(db)
    normalizeCollections(db)
    normalizeCoupons(db)
    normalizeTimestamps(db)
    normalizeManagers(db)
    normalizeMerchantContent(db)
    normalizeOrders(db)
    normalizeCommissionAmounts(db)
    normalizeParticipants(db)
    syncManagerTotals()
    save()
    return db
  }
  db = clone(seed)
  normalizeActivities(db)
  normalizeConfig(db)
  normalizeContent(db)
  normalizeCollections(db)
  normalizeCoupons(db)
  normalizeManagers(db)
  normalizeMerchantContent(db)
  normalizeOrders(db)
  normalizeCommissionAmounts(db)
  normalizeParticipants(db)
  syncManagerTotals()
  save()
  return db
}

export function get() {
  return init()
}

export function save() {
  writeJsonFileAtomicSync(DATA_FILE, db)
}

export function listParticipants(userId = null) {
  const participants = get().participants || []
  return userId == null ? participants : participants.filter((item) => String(item.userId || '') === String(userId))
}

export function createParticipant(userId, data = {}) {
  const { id: ignoredId, userId: ignoredUserId, ...form } = data || {}
  const participant = { id: Date.now(), ...form, userId: String(userId) }
  db.participants.push(participant)
  save()
  return participant
}

export function updateParticipant(id, data = {}) {
  const participant = db.participants.find((item) => String(item.id) === String(id))
  if (!participant) return null
  Object.assign(participant, data || {}, { id: participant.id, userId: participant.userId })
  save()
  return participant
}

export function deleteParticipant(id) {
  db.participants = db.participants.filter((item) => String(item.id) !== String(id))
  save()
  return { ok: true }
}

export function listAddresses(userId = null) {
  const addresses = get().addresses || []
  return userId == null ? addresses : addresses.filter((item) => String(item.userId || '') === String(userId))
}

export function createAddress(userId, data = {}) {
  const { id: ignoredId, userId: ignoredUserId, ...form } = data || {}
  const address = { ...form, id: `addr${Date.now()}`, userId: String(userId) }
  if (address.isDefault) {
    db.addresses.forEach((item) => {
      if (String(item.userId) === String(userId)) item.isDefault = false
    })
  }
  db.addresses.push(address)
  save()
  return address
}

export function updateAddress(id, data = {}) {
  const address = db.addresses.find((item) => String(item.id) === String(id))
  if (!address) return null
  Object.assign(address, data || {}, { id: address.id, userId: address.userId })
  if (address.isDefault) {
    db.addresses.forEach((item) => {
      if (String(item.id) !== String(address.id) && String(item.userId) === String(address.userId)) item.isDefault = false
    })
  }
  save()
  return address
}

export function deleteAddress(id) {
  db.addresses = db.addresses.filter((item) => String(item.id) !== String(id))
  save()
  return { ok: true }
}

function publicAdminAccount(account) {
  if (!account) return null
  const { salt, passwordHash, ...safe } = account
  return safe
}

export function authenticateAdmin(username, password) {
  const normalized = String(username || '').trim().toLowerCase()
  const account = (db.adminAccounts || []).find((item) => item.username === normalized)
  if (!account || Number(account.status) !== 1 || !passwordMatches(String(password || ''), account)) return null
  account.lastLoginAt = nowText()
  save()
  return publicAdminAccount(account)
}

export function findAdminAccount(id) {
  return (db.adminAccounts || []).find((item) => String(item.id) === String(id)) || null
}

export function listAdminAccounts() {
  return (db.adminAccounts || []).map(publicAdminAccount)
}

export function createAdminAccount(data = {}) {
  const username = String(data.username || '').trim().toLowerCase()
  const password = String(data.password || '')
  const name = String(data.name || '').trim()
  if (!/^[a-z0-9_]{4,24}$/.test(username)) throw badRequest('账号需为4-24位字母、数字或下划线')
  if (password.length < 8) throw badRequest('密码至少8位')
  if (!name) throw badRequest('请填写员工姓名')
  if ((db.adminAccounts || []).some((item) => item.username === username)) throw badRequest('该后台账号已存在')
  const role = data.role === 'super_admin' ? 'super_admin' : 'staff'
  const account = {
    id: `ADMIN${Date.now()}`,
    username,
    name,
    role,
    permissions: role === 'super_admin' ? ['*'] : [...new Set(Array.isArray(data.permissions) ? data.permissions.map(String) : [])],
    status: Number(data.status ?? 1),
    createdAt: nowText(),
    ...passwordRecord(password)
  }
  db.adminAccounts.push(account)
  addLog('权限管理', `新增后台账号 ${account.username}（${account.name}）`)
  save()
  return publicAdminAccount(account)
}

function activeSuperAdminCount() {
  return (db.adminAccounts || []).filter((item) => item.role === 'super_admin' && Number(item.status) === 1).length
}

export function updateAdminAccount(id, data = {}, operatorId = '') {
  const account = findAdminAccount(id)
  if (!account) throw badRequest('后台账号不存在')
  const nextRole = data.role === 'super_admin' ? 'super_admin' : 'staff'
  const nextStatus = Number(data.status ?? account.status)
  if (account.role === 'super_admin' && Number(account.status) === 1 && (nextRole !== 'super_admin' || nextStatus !== 1) && activeSuperAdminCount() <= 1) {
    throw badRequest('至少需要保留一个启用的超级管理员')
  }
  if (String(account.id) === String(operatorId) && nextStatus !== 1) throw badRequest('不能停用当前登录账号')
  account.name = String(data.name ?? account.name).trim() || account.name
  account.role = nextRole
  account.status = nextStatus === 1 ? 1 : 0
  account.permissions = nextRole === 'super_admin' ? ['*'] : [...new Set(Array.isArray(data.permissions) ? data.permissions.map(String) : account.permissions)]
  account.updatedAt = nowText()
  addLog('权限管理', `更新后台账号 ${account.username} 的角色、状态或权限`)
  save()
  return publicAdminAccount(account)
}

export function changeAdminPassword(id, oldPassword, newPassword, options = {}) {
  const account = findAdminAccount(id)
  if (!account) throw badRequest('后台账号不存在')
  const password = String(newPassword || '')
  if (password.length < 8) throw badRequest('新密码至少8位')
  if (!options.force && !passwordMatches(String(oldPassword || ''), account)) throw badRequest('原密码不正确')
  Object.assign(account, passwordRecord(password), { passwordChangedAt: nowText() })
  addLog('权限管理', `${options.force ? '重置' : '修改'}后台账号 ${account.username} 的密码`)
  save()
  return { ok: true }
}

export function listMerchantAccounts() {
  return (db.merchantAccounts || []).map(({ salt, passwordHash, ...account }) => account)
}

export function updateMerchantAccount(id, data = {}) {
  const account = (db.merchantAccounts || []).find((item) => String(item.id) === String(id))
  if (!account) throw badRequest('商户账号不存在')
  account.status = Number(data.status ?? account.status) === 1 ? 1 : 0
  account.permissions = [...new Set(Array.isArray(data.permissions) ? data.permissions.map(String) : account.permissions)]
  account.updatedAt = nowText()
  addLog('权限管理', `更新商户账号 ${account.username} 的发布权限或状态`)
  save()
  return listMerchantAccounts().find((item) => String(item.id) === String(id))
}

export function resetMerchantPassword(id, password) {
  const account = (db.merchantAccounts || []).find((item) => String(item.id) === String(id))
  if (!account) throw badRequest('商户账号不存在')
  if (String(password || '').length < 8) throw badRequest('新密码至少8位')
  Object.assign(account, passwordRecord(String(password)), { passwordChangedAt: nowText() })
  addLog('权限管理', `重置商户账号 ${account.username} 的密码`)
  save()
  return { ok: true }
}

export function reset() {
  db = clone(seed)
  normalizeCollections(db)
  normalizeCoupons(db)
  normalizeConfig(db)
  normalizeManagers(db)
  normalizeMerchantContent(db)
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

function maskBuyerName(value) {
  const name = String(value || '会员').trim()
  if (name.length <= 1) return `${name || '会'}*`
  return `${name.slice(0, 1)}${'*'.repeat(Math.min(2, name.length - 1))}`
}

function todayKey() {
  return nowText().slice(0, 10)
}

export function scheduleExpired(schedule) {
  const full = String(schedule?.full || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(full) && full < todayKey()
}

export function activityExpired(activity) {
  const schedules = Array.isArray(activity?.schedules) ? activity.schedules : []
  if (schedules.some((schedule) => !String(schedule?.full || '').trim())) return false
  const dated = schedules.filter((schedule) => /^\d{4}-\d{2}-\d{2}$/.test(String(schedule?.full || '')))
  if (dated.length) return dated.every(scheduleExpired)
  const endDate = String(activity?.endDate || activity?.endAt || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? endDate < todayKey() : false
}

function nextActivityDate(activity) {
  const dates = (activity?.schedules || []).map((schedule) => String(schedule?.full || '')).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort()
  return dates.find((date) => date >= todayKey()) || dates.at(-1) || '9999-12-31'
}

function activitySalesView(activity) {
  const orders = db.orders.filter((order) => String(order.activityId) === String(activity.id)
    && !['待付款', '已取消', '已退款'].includes(order.status))
  const actualSoldCount = orders.reduce((total, order) => total + Math.max(1, Number(order.count || 1)), 0)
  const manual = activity.soldCountMode === 'manual'
  const buyers = orders.slice(0, 50).map((order) => {
    const customer = db.customers.find((item) => String(item.id) === String(order.userId))
    return {
      name: maskBuyerName(customer?.name || order.buyerName),
      time: order.createdAt || '',
      count: Math.max(1, Number(order.count || 1))
    }
  })
  return {
    ...activity,
    expired: activityExpired(activity),
    soldCountMode: manual ? 'manual' : 'actual',
    manualSoldCount: Number(activity.manualSoldCount ?? activity.soldCount ?? 0),
    actualSoldCount,
    soldCount: manual ? Number(activity.manualSoldCount ?? activity.soldCount ?? 0) : actualSoldCount,
    buyers
  }
}

export function listActivitiesForDisplay() {
  return get().activities
    .map(activitySalesView)
    .sort((left, right) => Number(left.expired) - Number(right.expired)
      || nextActivityDate(left).localeCompare(nextActivityDate(right)))
}

export function searchActivities(keyword, category) {
  const terms = normalizeKeyword(keyword)
  return listActivitiesForDisplay().filter((a) => {
    const okCat = !category || String(a.category) === String(category)
    const text = activitySearchText(a)
    const okKey = terms.length === 0 || terms.every((t) => text.includes(t))
    return okCat && okKey
  })
}

export function createActivity(data) {
  const publisherType = data && data.publisherType === 'platform' ? 'platform' : 'merchant'
  const managerId = publisherType === 'platform' ? null : Number(data && data.managerId)
  if (publisherType === 'merchant' && (!managerId || !findManager(managerId))) throw badRequest('请先选择有效商家')
  const activity = {
    id: Date.now(),
    soldCount: 0,
    hasSku: false,
    skus: [],
    schedules: [],
    ...(data || {}),
    publisherType,
    managerId,
    regionIds: normalizeRegionIds(data && data.regionIds)
  }
  normalizePaidOfferingPrices(activity, '活动')
  activity.city = regionText(activity.regionIds, activity.city || '线上/全国')
  db.activities.unshift(activity)
  save()
  return activity
}

export function updateActivity(id, data) {
  const idx = db.activities.findIndex((a) => String(a.id) === String(id))
  if (idx < 0) return null
  const next = { ...db.activities[idx], ...(data || {}), id: db.activities[idx].id }
  next.publisherType = next.publisherType === 'platform' ? 'platform' : 'merchant'
  next.managerId = next.publisherType === 'platform' ? null : Number(next.managerId)
  if (next.publisherType === 'merchant' && (!next.managerId || !findManager(next.managerId))) throw badRequest('请先选择有效商家')
  if (data && data.regionIds !== undefined) next.regionIds = normalizeRegionIds(data.regionIds)
  normalizePaidOfferingPrices(next, '活动')
  next.city = regionText(next.regionIds, next.city || '线上/全国')
  db.activities[idx] = next
  save()
  return next
}

export function deleteActivity(id) {
  db.activities = db.activities.filter((activity) => String(activity.id) !== String(id))
  save()
  return { ok: true }
}

export function getCategories() {
  return get().categories
}

export function createCategory(data) {
  const name = String((data && data.name) || '').trim() || '未命名分类'
  const homeDisplayLimit = Number(data?.homeDisplayLimit ?? 6)
  if (!Number.isInteger(homeDisplayLimit) || homeDisplayLimit < 0 || homeDisplayLimit > 50) {
    throw badRequest('首页显示数量必须是0到50之间的整数')
  }
  const cat = {
    id: Date.now(),
    name,
    short: String((data && data.short) || '').trim() || name.slice(0, 2),
    emoji: (data && data.emoji) || '📌',
    color: (data && data.color) || '#6f747b',
    type: (data && data.type) || 'activity',
    homeDisplayLimit
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
  const homeDisplayLimit = Number(next.homeDisplayLimit ?? 6)
  if (!Number.isInteger(homeDisplayLimit) || homeDisplayLimit < 0 || homeDisplayLimit > 50) {
    throw badRequest('首页显示数量必须是0到50之间的整数')
  }
  next.homeDisplayLimit = homeDisplayLimit
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
    contentBlocks: [],
    regionIds: [],
    featured: false,
    status: 1,
    ...(data || {})
  }
  post.regionIds = normalizeRegionIds(post.regionIds)
  normalizeContentPost(post)
  db.contentPosts.unshift(post)
  save()
  return post
}

export function updateContentPost(id, data) {
  get()
  const idx = db.contentPosts.findIndex((item) => String(item.id) === String(id))
  if (idx < 0) return null
  const next = { ...db.contentPosts[idx], ...(data || {}), id: db.contentPosts[idx].id }
  if (data && data.regionIds !== undefined) next.regionIds = normalizeRegionIds(data.regionIds)
  normalizeContentPost(next)
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

export function getManagerFinanceDetail(id) {
  const manager = listManagers().find((item) => String(item.id) === String(id))
  if (!manager) throw badRequest('主理人不存在')
  return {
    manager,
    commissions: db.commissions
      .filter((item) => String(item.managerId) === String(id))
      .slice()
      .sort((a, b) => String(b.createTime || '').localeCompare(String(a.createTime || ''))),
    settlements: getSettlementRecords(id),
    withdraws: db.withdraws
      .filter((item) => String(item.managerId) === String(id))
      .slice()
      .sort((a, b) => String(b.applyTime || '').localeCompare(String(a.applyTime || '')))
  }
}

export function createManager(data) {
  const name = String(data?.name || '').trim()
  const phone = normalizePhone(data?.phone)
  const userId = String(data?.userId || '').trim() || null
  const commissionRate = data?.commissionRate == null || data.commissionRate === '' ? null : Number(data.commissionRate)
  if (!name) throw badRequest('请填写主理人姓名')
  if (!/^1\d{10}$/.test(phone)) throw badRequest('请填写正确的11位手机号')
  if (commissionRate != null && (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 100)) throw badRequest('分佣比例必须在0到100之间')
  if (userId && findManagerByUser(userId, { includeRevoked: true })) throw badRequest('该会员已经关联主理人')
  const customer = userId ? db.customers.find((item) => String(item.id) === userId) : null
  if (userId && !customer) throw badRequest('关联会员不存在')
  const id = Date.now()
  const inviteCode = String(data?.inviteCode || `SYL${String(id).slice(-6)}`).trim().toUpperCase()
  if (!/^[A-Z0-9_-]{4,20}$/.test(inviteCode)) throw badRequest('邀请码需为4-20位字母、数字、下划线或短横线')
  if (db.managers.some((item) => String(item.inviteCode || '').toUpperCase() === inviteCode)) throw badRequest('邀请码已存在')
  const manager = {
    id,
    userId,
    name,
    phone,
    wechat: String(data?.wechat || '').trim(),
    address: String(data?.address || '').trim(),
    intro: String(data?.intro || '').trim(),
    remark: String(data?.remark || '').trim(),
    inviteCode,
    commissionRate,
    status: Number(data?.status) === 2 ? 2 : 1,
    totalPerformance: 0,
    totalCommission: 0,
    available: 0,
    pending: 0,
    withdrawing: 0,
    settled: 0,
    totalCustomers: 0,
    createdAt: nowText(),
    createdBy: 'admin'
  }
  db.managers.unshift(manager)
  if (customer) customer.isManager = true
  addLog('主理人管理', `后台新增主理人 ${name}（${inviteCode}）`)
  save()
  return { ...manager, ...managerBalance(manager.id) }
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

function userCouponView(record) {
  const template = (db.couponTemplates || []).find((item) => String(item.id) === String(record.templateId)) || {}
  const coupon = { ...templateSnapshot(template), ...(record.snapshot || {}), ...record }
  coupon.templateStatus = template.status === 0 ? 0 : 1
  const expired = Boolean(coupon.expireAt && coupon.expireAt < nowText().slice(0, 10))
  if (record.status === 'unused' && expired) coupon.status = 'expired'
  if (record.status === 'unused' && coupon.templateStatus === 0) coupon.status = 'disabled'
  coupon.used = record.status === 'used'
  coupon.locked = record.status === 'locked'
  coupon.statusLabel = record.status === 'used' ? '已使用'
    : record.status === 'locked' ? '使用中'
      : expired ? '已过期'
        : coupon.templateStatus === 0 ? '已失效' : '可使用'
  return coupon
}

function issueCoupon(template, userId, options = {}) {
  const record = {
    id: couponRecordId(),
    templateId: template.id,
    userId: String(userId),
    status: 'unused',
    claimedAt: nowText(),
    lockedAt: '',
    usedAt: '',
    returnedAt: '',
    orderId: '',
    claimSource: options.source || 'system',
    snapshot: templateSnapshot(template)
  }
  db.userCoupons.push(record)
  return record
}

function syncAutoCouponsForUser(userId) {
  const uid = String(userId)
  let issued = 0
  ;(db.couponTemplates || [])
    .filter((template) => template.status !== 0 && (template.distribution || 'auto') === 'auto')
    .forEach((template) => {
      const limit = Math.max(1, Number(template.perUserLimit || 1))
      const owned = db.userCoupons.filter((record) => String(record.templateId) === String(template.id) && String(record.userId) === uid)
      for (let index = owned.length; index < limit; index += 1) {
        issueCoupon(template, uid, { source: 'auto' })
        issued += 1
      }
    })
  if (issued) save()
}

function visibleCouponsFor(userId) {
  syncAutoCouponsForUser(userId)
  return db.userCoupons
    .filter((record) => String(record.userId) === String(userId))
    .map(userCouponView)
    .sort((left, right) => String(right.claimedAt || '').localeCompare(String(left.claimedAt || '')))
}

export function couponApplicable(coupon, activity, amount, userId) {
  if (!coupon || !['unused'].includes(coupon.status)) return false
  if (String(coupon.userId) !== String(userId == null ? '' : userId)) return false
  if (coupon.templateStatus === 0) return false
  if (coupon.expireAt && coupon.expireAt < nowText().slice(0, 10)) return false
  if (coupon.minAmount && amount < coupon.minAmount) return false
  if (coupon.type === 3 && coupon.scopeCategory && activity.category !== coupon.scopeCategory) return false
  if (coupon.type === 4 && coupon.scopeProductId && String(activity.id) !== String(coupon.scopeProductId)) return false
  return true
}

function couponPublisher(payload = {}, current = {}) {
  const requestedType = payload.publisherType == null ? current.publisherType : payload.publisherType
  const publisherType = requestedType === 'merchant' ? 'merchant' : 'platform'
  if (publisherType === 'platform') return { publisherType, managerId: null }
  const managerId = payload.managerId == null ? current.managerId : payload.managerId
  const manager = findManager(managerId)
  if (!manager || manager.status === 3) throw badRequest('请选择有效的发布商家')
  return { publisherType, managerId: manager.id }
}

function couponAdminView(coupon) {
  const manager = coupon.managerId ? findManager(coupon.managerId) : null
  return {
    ...coupon,
    publisherType: coupon.publisherType === 'merchant' ? 'merchant' : 'platform',
    managerId: coupon.publisherType === 'merchant' ? coupon.managerId : null,
    publisherName: coupon.publisherType === 'merchant'
      ? (manager ? (manager.shopName || manager.name) : `商家 ${coupon.managerId || ''}`)
      : '岁悦里平台',
    status: coupon.status === 0 ? 0 : 1,
    issuedCount: (db.userCoupons || []).filter((record) => String(record.templateId) === String(coupon.id)).length,
    usedCount: (db.userCoupons || []).filter((record) => String(record.templateId) === String(coupon.id) && record.status === 'used').length
  }
}

function couponPayload(input, current = {}) {
  const data = input || {}
  const title = String(data.title == null ? current.title || '' : data.title).trim()
  const value = Number(data.value == null ? current.value || 0 : data.value)
  const minAmount = Number(data.minAmount == null ? current.minAmount || 0 : data.minAmount)
  const expireAt = String(data.expireAt == null ? current.expireAt || '' : data.expireAt).trim()
  if (!title) throw badRequest('请填写优惠券标题')
  if (!Number.isFinite(value) || value <= 0) throw badRequest('优惠券面额必须大于0')
  if (!Number.isFinite(minAmount) || minAmount < 0) throw badRequest('使用门槛不能小于0')
  if (expireAt && !/^\d{4}-\d{2}-\d{2}$/.test(expireAt)) throw badRequest('有效期格式应为 YYYY-MM-DD')
  return {
    title,
    desc: String(data.desc == null ? current.desc || '' : data.desc).trim(),
    type: Number(data.type == null ? current.type || 1 : data.type),
    value,
    minAmount,
    scopeCategory: data.scopeCategory == null || data.scopeCategory === '' ? null : Number(data.scopeCategory),
    scopeProductId: data.scopeProductId == null || data.scopeProductId === '' ? null : data.scopeProductId,
    expireAt,
    status: Number(data.status) === 0 ? 0 : 1,
    ...couponPublisher(data, current)
  }
}

export function listCouponsForAdmin() {
  return (db.couponTemplates || []).map(couponAdminView)
}

export function createCoupon(input) {
  const coupon = { id: Date.now(), distribution: 'auto', perUserLimit: 1, ...couponPayload(input) }
  db.couponTemplates.push(coupon)
  addLog('优惠券管理', `发布优惠券「${coupon.title}」，归属${couponAdminView(coupon).publisherName}`)
  save()
  return couponAdminView(coupon)
}

export function updateCoupon(id, input) {
  const coupon = db.couponTemplates.find((item) => String(item.id) === String(id))
  if (!coupon) throw badRequest('优惠券不存在')
  Object.assign(coupon, couponPayload(input, coupon))
  addLog('优惠券管理', `更新优惠券「${coupon.title}」`)
  save()
  return couponAdminView(coupon)
}

export function deleteCoupon(id) {
  const coupon = db.couponTemplates.find((item) => String(item.id) === String(id))
  if (!coupon) throw badRequest('优惠券不存在')
  const issued = db.userCoupons.some((record) => String(record.templateId) === String(id))
  if (issued) {
    coupon.status = 0
    coupon.archivedAt = nowText()
  } else {
    db.couponTemplates = db.couponTemplates.filter((item) => String(item.id) !== String(id))
  }
  addLog('优惠券管理', `删除优惠券「${coupon.title}」`)
  save()
  return { ok: true }
}

export function listCouponRecords(templateId) {
  return (db.userCoupons || [])
    .filter((record) => !templateId || String(record.templateId) === String(templateId))
    .map((record) => {
      const customer = db.customers.find((item) => String(item.id) === String(record.userId))
      return { ...userCouponView(record), userName: customer?.name || '会员', userPhone: customer?.phone || '' }
    })
    .sort((left, right) => String(right.claimedAt || '').localeCompare(String(left.claimedAt || '')))
}

function bannerView(banner) {
  const mediaType = banner.mediaType === 'video' ? 'video' : 'image'
  const legacyLink = Number(banner.cat || 0) > 0
    ? `/pages/list/list?category=${Number(banner.cat)}`
    : '/pages/profile/profile'
  return {
    ...banner,
    mediaType,
    mediaUrl: String(banner.mediaUrl || banner.imageUrl || ''),
    linkUrl: String(banner.linkUrl || legacyLink),
    status: banner.status === 0 ? 0 : 1,
    sort: Number(banner.sort || 0)
  }
}

function bannerPayload(input, current = {}) {
  const data = input || {}
  const title = String(data.title == null ? current.title || '' : data.title).trim()
  const mediaType = (data.mediaType == null ? current.mediaType : data.mediaType) === 'video' ? 'video' : 'image'
  const mediaUrl = String(data.mediaUrl == null ? current.mediaUrl || current.imageUrl || '' : data.mediaUrl).trim()
  const linkUrl = String(data.linkUrl == null ? current.linkUrl || '' : data.linkUrl).trim()
  if (!title) throw badRequest('请填写 Banner 标题')
  if (mediaUrl && !/^(\/api\/uploads\/files\/|\/assets\/|https:\/\/)/.test(mediaUrl)) throw badRequest('图片或视频地址格式不正确')
  if (linkUrl && !/^(\/pages\/|https:\/\/)/.test(linkUrl)) throw badRequest('跳转链接应为小程序页面路径或 HTTPS 地址')
  return {
    title,
    sub: String(data.sub == null ? current.sub || '' : data.sub).trim(),
    mediaType,
    mediaUrl,
    linkUrl,
    status: Number(data.status) === 0 ? 0 : 1,
    sort: Number(data.sort == null ? current.sort || 0 : data.sort),
    emoji: String(data.emoji == null ? current.emoji || '🎁' : data.emoji),
    tone: String(data.tone == null ? current.tone || 'linear-gradient(135deg,#c25e3d,#e19a6d)' : data.tone),
    cat: Number(data.cat == null ? current.cat || 0 : data.cat)
  }
}

export function listBanners(includeDisabled = false) {
  return (db.banners || [])
    .filter((banner) => includeDisabled || banner.status !== 0)
    .map(bannerView)
    .sort((left, right) => Number(right.sort || 0) - Number(left.sort || 0))
}

export function createBanner(input) {
  const banner = { id: Date.now(), ...bannerPayload(input) }
  db.banners.push(banner)
  addLog('Banner管理', `发布 Banner「${banner.title}」`)
  save()
  return bannerView(banner)
}

export function updateBanner(id, input) {
  const banner = (db.banners || []).find((item) => String(item.id) === String(id))
  if (!banner) throw badRequest('Banner 不存在')
  Object.assign(banner, bannerPayload(input, banner))
  addLog('Banner管理', `更新 Banner「${banner.title}」`)
  save()
  return bannerView(banner)
}

export function deleteBanner(id) {
  const banner = (db.banners || []).find((item) => String(item.id) === String(id))
  if (!banner) throw badRequest('Banner 不存在')
  db.banners = db.banners.filter((item) => String(item.id) !== String(id))
  addLog('Banner管理', `删除 Banner「${banner.title}」`)
  save()
  return { ok: true }
}

export function calcRefund(order) {
  const activity = [...db.activities, ...(db.products || [])].find((a) => String(a.id) === String(order.activityId))
  return calculateRefund(order, activity)
}

function customerForBalance(userId) {
  const customer = db.customers.find((item) => String(item.id) === String(userId))
  if (!customer) throw badRequest('会员不存在')
  const legacyFen = yuanToFen(Math.max(0, Number(customer.balance || 0)), '余额')
  // 兼容旧版后台或历史脚本直接修改 balance 的数据，一经读取即回写为整数分。
  customer.balanceFen = Number.isSafeInteger(customer.balanceFen) && fenToYuan(customer.balanceFen) === Number(customer.balance)
    ? customer.balanceFen
    : legacyFen
  customer.balance = fenToYuan(customer.balanceFen)
  return customer
}

function changeCustomerBalanceFen(userId, amountFen, type, detail = {}) {
  const customer = customerForBalance(userId)
  const valueFen = Number(amountFen)
  if (!Number.isSafeInteger(valueFen)) throw badRequest('余额变动金额不正确')
  const nextFen = customer.balanceFen + valueFen
  if (nextFen < 0) throw badRequest('账户余额不足')
  customer.balanceFen = nextFen
  customer.balance = fenToYuan(nextFen)
  const transaction = {
    id: `BT${Date.now()}${crypto.randomBytes(3).toString('hex')}`,
    userId: String(userId),
    type,
    amountFen: valueFen,
    amount: fenToYuan(valueFen),
    balanceAfterFen: nextFen,
    balanceAfter: fenToYuan(nextFen),
    orderId: detail.orderId || '',
    rechargeId: detail.rechargeId || '',
    description: detail.description || '',
    createdAt: nowText()
  }
  db.balanceTransactions.unshift(transaction)
  return transaction
}

function reserveOrderBalance(order, requested) {
  order.payAmountFen = Number.isSafeInteger(order.payAmountFen) ? order.payAmountFen : yuanToFen(order.payAmount || 0, '订单金额')
  order.balancePaidFen = Number.isSafeInteger(order.balancePaidFen) ? order.balancePaidFen : yuanToFen(order.balancePaidAmount || 0, '余额支付金额')
  order.balanceRefundFen = Number.isSafeInteger(order.balanceRefundFen) ? order.balanceRefundFen : yuanToFen(order.balanceRefundAmount || 0, '余额退款金额')
  order.wechatPayFen = Number.isSafeInteger(order.wechatPayFen) ? order.wechatPayFen : Math.max(0, order.payAmountFen - order.balancePaidFen)
  order.wechatRefundFen = Number.isSafeInteger(order.wechatRefundFen) ? order.wechatRefundFen : 0
  if (!requested) return
  const customer = customerForBalance(order.userId)
  const amountFen = Math.min(customer.balanceFen, order.payAmountFen ?? yuanToFen(order.payAmount || 0))
  if (amountFen <= 0) return
  changeCustomerBalanceFen(order.userId, -amountFen, 'order-payment', {
    orderId: order.id,
    description: `订单 ${order.id} 余额支付`
  })
  order.balancePaidFen = amountFen
  order.wechatPayFen = Math.max(0, order.payAmountFen - amountFen)
  order.balancePaidAmount = fenToYuan(order.balancePaidFen)
  order.wechatPayAmount = fenToYuan(order.wechatPayFen)
  order.balanceStatus = 'locked'
}

function releaseOrderBalance(order, ratio = 1, description = '订单余额退回') {
  const paidFen = order.balancePaidFen ?? yuanToFen(order.balancePaidAmount || 0)
  const returnedFen = order.balanceRefundFen ?? yuanToFen(order.balanceRefundAmount || 0)
  const targetFen = multiplyFen(paidFen, ratio)
  const amountFen = Math.max(0, targetFen - returnedFen)
  if (amountFen <= 0) return 0
  changeCustomerBalanceFen(order.userId, amountFen, 'order-refund', {
    orderId: order.id,
    description
  })
  order.balanceRefundFen = returnedFen + amountFen
  order.balanceRefundAmount = fenToYuan(order.balanceRefundFen)
  order.balanceStatus = order.balanceRefundFen >= paidFen ? 'refunded' : 'partial-refunded'
  return fenToYuan(amountFen)
}

export function listBalanceTransactions(userId) {
  return (db.balanceTransactions || []).filter((item) => String(item.userId) === String(userId)).slice(0, 100)
}

export function createBalanceRecharge(userId, amount) {
  const amountFen = yuanToFen(amount, '充值金额')
  if (amountFen < 100 || amountFen > 5_000_000) throw badRequest('单次充值金额须在1元到50000元之间')
  customerForBalance(userId)
  const recharge = {
    id: `BAL${Date.now()}${crypto.randomBytes(3).toString('hex')}`,
    userId: String(userId),
    amountFen,
    amount: fenToYuan(amountFen),
    status: '待支付',
    paymentStatus: 'NOTPAY',
    createdAt: nowText(),
    paidAt: '',
    wechatTransactionId: ''
  }
  db.balanceRecharges.unshift(recharge)
  save()
  return recharge
}

export function prepareBalanceRechargePayment(id, userId) {
  const recharge = (db.balanceRecharges || []).find((item) => String(item.id) === String(id))
  if (!recharge || recharge.status !== '待支付') throw badRequest('充值单不存在或已完成')
  if (String(recharge.userId) !== String(userId)) throw forbidden('无权支付其他会员的充值单')
  const customer = customerForBalance(userId)
  if (!customer.wechatOpenId) throw badRequest('当前账号未绑定真实微信身份，请重新登录')
  return { recharge, openid: customer.wechatOpenId, amountFen: recharge.amountFen }
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
  const coupon = db.userCoupons.find((record) => String(record.id) === String(order.couponId) && String(record.userId) === String(order.userId))
  if (!coupon || !['locked', 'used'].includes(coupon.status)) return
  coupon.usageHistory ||= []
  coupon.usageHistory.push({ orderId: order.id, action: 'returned', time: nowText() })
  coupon.status = 'unused'
  coupon.returnedAt = nowText()
  coupon.returnedOrderId = order.id
  coupon.orderId = ''
  coupon.lockedAt = ''
  coupon.usedAt = ''
}

function consumeOrderCoupon(order) {
  if (!order.couponId) return
  const coupon = db.userCoupons.find((record) => String(record.id) === String(order.couponId) && String(record.userId) === String(order.userId))
  if (!coupon || coupon.status === 'used') return
  if (coupon.status !== 'locked' || String(coupon.orderId) !== String(order.id)) throw badRequest('订单优惠券锁定状态异常')
  coupon.usageHistory ||= []
  coupon.usageHistory.push({ orderId: order.id, action: 'used', time: nowText() })
  coupon.status = 'used'
  coupon.usedAt = nowText()
  coupon.orderId = order.id
}

function generateCommission(order) {
  if (!order.managerId) return
  const manager = findManager(order.managerId)
  if (!manager) return
  const activity = [...db.activities, ...(db.products || [])].find((a) => String(a.id) === String(order.activityId))
  const rate = resolveRate(activity, manager)
  const actualPaidAmount = round2(order.actualPaidAmount ?? order.payAmount)
  const amount = round2(actualPaidAmount * rate / 100)
  const buyer = db.customers.find((c) => String(c.id) === String(order.userId)) || null
  order.commissionRate = rate
  order.commissionAmount = amount
  db.commissions.unshift({
    id: `CM${Date.now()}`,
    managerId: manager.id,
    bindingId: order.bindingId || null,
    managerAssignedAt: order.managerAssignedAt || order.createdAt || nowText(),
    attributionSource: order.attributionSource || '支付时会员归属快照',
    orderId: order.id,
    customerId: order.userId,
    // 客户名取下单会员，报名人（可能多人）单独保留，便于对账
    customerName: (buyer && buyer.name) || order.buyerName || '会员',
    participantText: order.participants || '',
    productName: order.title,
    originalAmount: round2(order.originalAmount ?? actualPaidAmount),
    discountedAmount: round2(order.discountedAmount ?? actualPaidAmount),
    actualPaidAmount,
    payAmount: actualPaidAmount,
    commissionBasis: 'actualPaidAmount',
    commissionRate: rate,
    commissionAmount: amount,
    status: COMMISSION_STATUS.PENDING,
    createTime: nowText()
  })
}

function snapshotOrderAttributionAtPayment(order) {
  const customer = db.customers.find((item) => String(item.id) === String(order.userId)) || null
  order.managerId = customer?.managerId || null
  const binding = order.managerId
    ? db.bindings.find((item) => item.status === 1
      && String(item.customerId) === String(order.userId)
      && String(item.managerId) === String(order.managerId))
    : null
  order.bindingId = binding?.id || null
  order.managerAssignedAt = order.payTime || nowText()
  order.attributionSource = '支付时会员归属快照'
}

export function createOrder(payload) {
  const activity = [...db.activities, ...(db.products || [])].find((a) => String(a.id) === String(payload.activityId))
  if (!activity) return null
  const count = Number(payload.count)
  if (!Number.isSafeInteger(count) || count < 1) throw badRequest('购买数量不正确')
  if (Number(activity.status ?? 1) === 0) throw badRequest('该活动已下架，无法报名')
  const isActivity = db.activities.some((item) => String(item.id) === String(activity.id))
  if (isActivity && activityExpired(activity)) throw badRequest('活动已过期，无法报名')
  const limit = activity.limitPerUser || 99
  if (count > limit) throw new Error(`每人限购${limit}份`)
  const isSkuOnly = activity.sellType === 'sku'
  const hasSku = activity.hasSku || isSkuOnly
  const sku = hasSku ? activity.skus.find((s) => s.id === payload.skuId) || activity.skus[0] || null : null
  const memberPrice = requiredPaidPrice(sku ? sku.memberPrice : activity.memberPrice, '支付金额')
  const originalUnitPrice = Number((sku && sku.originalPrice) ?? activity.originalPrice ?? (sku && sku.price) ?? activity.price ?? memberPrice ?? 0)
  const memberPriceFen = yuanToFen(memberPrice, '会员单价')
  const originalUnitPriceFen = yuanToFen(originalUnitPrice, '原单价')
  const schedule = isSkuOnly ? null : activity.schedules.find((s) => s.id === payload.scheduleId)
    || activity.schedules.find((item) => !scheduleExpired(item)) || activity.schedules[0] || null
  if (scheduleExpired(schedule)) throw badRequest('所选活动场次已过期，无法报名')
  if (schedule && schedule.remaining < count) throw new Error('该时间段名额不足')
  const venueAddress = (sku && sku.address) || activity.address || ''
  const venueDistrict = (sku && sku.district) || ''
  let coupon = null
  let couponRecord = null
  let discount = 0
  if (payload.couponId) {
    couponRecord = db.userCoupons.find((record) => String(record.id) === String(payload.couponId)) || null
    coupon = couponRecord ? userCouponView(couponRecord) : null
    if (!couponApplicable(coupon, activity, fenToYuan(memberPriceFen * count), payload.userId || 'u1')) {
      throw badRequest('该优惠券不可用或不属于当前会员')
    }
  }
  if (coupon) {
    discount = coupon.value
  }
  const originalAmountFen = originalUnitPriceFen * count
  const discountedAmountFen = memberPriceFen * count
  const requestedDiscountFen = coupon ? yuanToFen(discount, '优惠金额') : 0
  const payAmountFen = Math.max(1, discountedAmountFen - requestedDiscountFen)
  const effectiveDiscountFen = Math.max(0, discountedAmountFen - payAmountFen)
  const originalAmount = fenToYuan(originalAmountFen)
  const discountedAmount = fenToYuan(discountedAmountFen)
  const payAmount = fenToYuan(payAmountFen)
  const effectiveDiscount = fenToYuan(effectiveDiscountFen)
  const serviceMode = serviceModeOfOffering(activity)
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
    count,
    memberPrice,
    originalUnitPrice: round2(originalUnitPrice),
    originalUnitPriceFen,
    originalAmount: Math.max(originalAmount, discountedAmount),
    originalAmountFen: Math.max(originalAmountFen, discountedAmountFen),
    discountedAmount,
    discountedAmountFen,
    couponDiscountAmount: effectiveDiscount,
    couponDiscountFen: effectiveDiscountFen,
    actualPaidAmount: payAmount,
    actualPaidAmountFen: payAmountFen,
    payAmount,
    payAmountFen,
    balancePaidAmount: 0,
    balancePaidFen: 0,
    balanceRefundAmount: 0,
    balanceRefundFen: 0,
    wechatPayAmount: payAmount,
    wechatPayFen: payAmountFen,
    wechatRefundFen: 0,
    balanceStatus: 'unused',
    discount: effectiveDiscount,
    address: payload.address || null,
    serviceMode,
    status: '待付款',
    coupon: coupon ? coupon.title : '未使用',
    couponId: couponRecord ? couponRecord.id : null,
    couponTemplateId: couponRecord ? couponRecord.templateId : null,
    code: `${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)}`,
    managerId: db.customers.find((c) => String(c.id) === String(payload.userId || 'u1'))?.managerId || null,
    managerAssignedAt: nowText(),
    attributionSource: '下单时会员归属快照',
    commissionRate: 0,
    commissionAmount: 0,
    createdAt: nowText(),
    paymentStatus: 'NOTPAY',
    payChannel: '',
    payTime: '',
    payDeadline: Date.now() + 30 * 60 * 1000
  }
  db.orders.unshift(order)
  reserveOrderBalance(order, payload.useBalance)
  if (couponRecord) {
    couponRecord.status = 'locked'
    couponRecord.lockedAt = nowText()
    couponRecord.orderId = order.id
    couponRecord.usageHistory ||= []
    couponRecord.usageHistory.push({ orderId: order.id, action: 'locked', time: nowText() })
  }
  if (schedule) {
    schedule.soldQuota = (schedule.soldQuota || 0) + count
    schedule.remaining = Math.max(0, schedule.totalQuota - schedule.soldQuota)
  }
  save()
  return order
}

export function autoCancelExpired() {
  const now = Date.now()
  db.orders.forEach((o) => {
    if (o.status === '待付款' && o.paymentStatus !== 'USERPAYING' && o.payDeadline && now > o.payDeadline) {
      o.status = '已取消'
      releaseSchedule(o)
      returnCoupon(o, true)
      releaseOrderBalance(o, 1, '订单超时，余额退回')
    }
  })
  save()
}

export function payOrder(id) {
  const order = db.orders.find((o) => o.id === id)
  if (!order || order.status !== '待付款') return null
  const activity = db.activities.find((item) => String(item.id) === String(order.activityId))
  if (activity && (activityExpired(activity) || scheduleExpired(order.schedule))) throw badRequest('活动已过期，无法继续付款')
  if (activity && Number(activity.status ?? 1) === 0) throw badRequest('该活动已下架，无法继续付款')
  return order
}

export function prepareOrderPayment(id, userId) {
  autoCancelExpired()
  const order = payOrder(id)
  if (!order) throw badRequest('订单已支付、已取消或已超时')
  if (String(order.userId) !== String(userId)) throw forbidden('无权支付其他会员的订单')
  const amountFen = order.wechatPayFen ?? yuanToFen(order.wechatPayAmount ?? order.actualPaidAmount ?? order.payAmount ?? 0)
  if (amountFen === 0 && Number(order.balancePaidAmount || 0) > 0) return { order, balanceOnly: true, amountFen: 0 }
  const customer = db.customers.find((item) => String(item.id) === String(userId))
  if (!customer?.wechatOpenId) throw badRequest('当前账号未绑定真实微信身份，请重新登录')
  if (amountFen < 1) throw badRequest('支付金额最低为0.01元，不能为0元')
  return { order, openid: customer.wechatOpenId, amountFen, balanceOnly: false }
}

function fulfillLiveOrder(order) {
  if (order.source !== 'live' || order.cardId) return
  const live = (db.lives || []).find((item) => String(item.id) === String(order.liveId))
  if (!live) throw badRequest('课程不存在，暂时无法发放权益')
  const existing = (db.cards || []).find((item) => String(item.orderId) === String(order.id))
  if (existing) {
    order.cardId = existing.id
    return
  }
  const total = Number(live.lessonCount || 10)
  const d = new Date()
  d.setFullYear(d.getFullYear() + 1)
  const p = (n) => String(n).padStart(2, '0')
  const card = {
    id: `card${Date.now()}`,
    orderId: order.id,
    userId: order.userId,
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
  order.cardId = card.id
  live.soldCount = Number(live.soldCount || 0) + 1
}

function completeOrderPayment(order, payment = {}) {
  snapshotOrderAttributionAtPayment(order)
  order.paymentStatus = 'SUCCESS'
  order.wechatPaymentPayload = null
  order.prepayExpiresAt = 0
  order.payChannel = Number(order.wechatPayAmount || 0) > 0
    ? (Number(order.balancePaidAmount || 0) > 0 ? '余额+微信支付' : '微信支付')
    : '余额支付'
  order.wechatTransactionId = String(payment.transaction_id || '')
  order.payTime = String(payment.success_time || nowText()).replace('T', ' ').slice(0, 19)
  order.payDeadline = null
  order.balanceStatus = Number(order.balancePaidAmount || 0) > 0 ? 'consumed' : 'unused'
  order.status = order.source === 'live' ? '已完成' : pendingStatusForMode(serviceModeOfOrder(order))
  consumeOrderCoupon(order)
  fulfillLiveOrder(order)
  generateCommission(order)
  addLog('订单支付', `订单 ${order.id} 支付成功 ¥${order.actualPaidAmount}（${order.payChannel}）`)
  save()
  return order
}

export function confirmBalanceOnlyPayment(orderId, userId) {
  const order = db.orders.find((item) => String(item.id) === String(orderId))
  if (!order || order.status !== '待付款') throw badRequest('订单已支付、已取消或已超时')
  if (String(order.userId) !== String(userId)) throw forbidden('无权支付其他会员的订单')
  if (Number(order.wechatPayAmount || 0) !== 0 || Number(order.balancePaidAmount || 0) <= 0) {
    throw badRequest('该订单不能使用纯余额支付')
  }
  return completeOrderPayment(order)
}

export function confirmWechatPayment(outTradeNo, payment) {
  const order = db.orders.find((item) => String(item.id) === String(outTradeNo))
  if (order) {
    if (order.paymentStatus === 'SUCCESS') return { type: 'order', record: order, duplicate: true, requiresRefund: order.autoRefundRequired === true }
    const expectedFen = order.wechatPayFen ?? yuanToFen(order.wechatPayAmount ?? order.actualPaidAmount ?? order.payAmount ?? 0)
    const paidFen = Number(payment?.amount?.payer_total ?? payment?.amount?.total)
    if (!Number.isInteger(paidFen) || paidFen !== expectedFen) throw badRequest('微信支付金额与订单金额不一致')
    if (order.status !== '待付款') {
      order.paymentStatus = 'SUCCESS'
      order.payChannel = '微信支付'
      order.wechatTransactionId = String(payment.transaction_id || '')
      order.payTime = String(payment.success_time || nowText()).replace('T', ' ').slice(0, 19)
      order.paymentAnomaly = `支付成功时订单状态为「${order.status}」`
      order.autoRefundRequired = true
      addLog('微信支付异常', `订单 ${order.id} 已支付但状态为「${order.status}」，等待自动退款`)
      save()
      return { type: 'order', record: order, requiresRefund: true }
    }
    return { type: 'order', record: completeOrderPayment(order, payment) }
  }
  const application = (db.managerApplications || []).find((item) => String(item.id) === String(outTradeNo))
  if (application) {
    if (application.paymentStatus === '已到账') return { type: 'manager-application', record: application, duplicate: true }
    const expectedFen = Number.isSafeInteger(application.feeAmountFen)
      ? application.feeAmountFen
      : yuanToFen(application.feeAmount || 0, '申请费用')
    const paidFen = Number(payment?.amount?.payer_total ?? payment?.amount?.total)
    if (!Number.isInteger(paidFen) || paidFen !== expectedFen) throw badRequest('微信支付金额与申请费用不一致')
    application.paid = true
    application.paidAmount = paidFen / 100
    application.paymentStatus = '已到账'
    application.wechatPaymentPayload = null
    application.prepayExpiresAt = 0
    application.paymentMethod = '微信支付'
    application.paymentOrderNo = String(payment.transaction_id || '')
    application.paidAt = String(payment.success_time || nowText()).replace('T', ' ').slice(0, 19)
    application.status = '待审核'
    addLog('微信支付', `主理人申请 ${application.id} 费用支付成功 ¥${application.paidAmount}`)
    save()
    return { type: 'manager-application', record: application }
  }
  const recharge = (db.balanceRecharges || []).find((item) => String(item.id) === String(outTradeNo))
  if (recharge) {
    if (recharge.paymentStatus === 'SUCCESS') return { type: 'balance-recharge', record: recharge, duplicate: true }
    const expectedFen = recharge.amountFen ?? yuanToFen(recharge.amount || 0)
    const paidFen = Number(payment?.amount?.payer_total ?? payment?.amount?.total)
    if (!Number.isInteger(paidFen) || paidFen !== expectedFen) throw badRequest('微信支付金额与充值金额不一致')
    recharge.paymentStatus = 'SUCCESS'
    recharge.wechatPaymentPayload = null
    recharge.prepayExpiresAt = 0
    recharge.status = '已到账'
    recharge.wechatTransactionId = String(payment.transaction_id || '')
    recharge.paidAt = String(payment.success_time || nowText()).replace('T', ' ').slice(0, 19)
    changeCustomerBalanceFen(recharge.userId, expectedFen, 'recharge', {
      rechargeId: recharge.id,
      description: '微信充值'
    })
    addLog('余额充值', `会员 ${recharge.userId} 充值 ¥${recharge.amount}`)
    save()
    return { type: 'balance-recharge', record: recharge }
  }
  throw badRequest('支付关联业务单不存在')
}

export function cancelOrder(id) {
  const order = db.orders.find((o) => o.id === id)
  if (!order || order.status !== '待付款') return null
  if (order.paymentStatus === 'USERPAYING') throw badRequest('微信支付已发起，暂时不能取消，请等待支付结果')
  order.status = '已取消'
  releaseSchedule(order)
  returnCoupon(order, true)
  releaseOrderBalance(order, 1, '取消订单，余额退回')
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
    originalAmount: 0,
    discountedAmount: 0,
    actualPaidAmount: 0,
    commissionBasis: 'actualPaidAmount',
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
  order.refundRequestStatus = 'SUCCESS'
  order.paymentStatus = value >= 1 ? 'REFUNDED' : 'PARTIAL_REFUNDED'
  order.refundPrevStatus = null
  order.refundAuditRequired = false
  releaseOrderBalance(order, value, '订单退款，余额原路退回')
  releaseSchedule(order)
  clawbackCommission(order, value)
  if (value >= 1 && order.source === 'live' && order.cardId) {
    db.cards = (db.cards || []).filter((card) => String(card.id) !== String(order.cardId))
    const live = (db.lives || []).find((item) => String(item.id) === String(order.liveId))
    if (live) live.soldCount = Math.max(0, Number(live.soldCount || 0) - 1)
    order.cardId = null
  }
  return order
}

export function prepareWechatRefund(orderOrId, reason, ratio = 1) {
  const order = typeof orderOrId === 'object'
    ? orderOrId
    : db.orders.find((item) => String(item.id) === String(orderOrId))
  if (!order) throw badRequest('订单不存在')
  if (!['SUCCESS', 'REFUND_PROCESSING'].includes(order.paymentStatus)) throw badRequest('该订单没有可退的支付款项')
  if (order.status === '已退款' || order.refundRequestStatus === 'SUCCESS') throw badRequest('该订单已退款')
  if (order.refundRequest?.outRefundNo) return { order, ...order.refundRequest, balanceOnly: order.refundRequest.refundFen === 0 }
  const totalFen = order.wechatPayFen ?? yuanToFen(order.wechatPayAmount ?? order.actualPaidAmount ?? order.payAmount ?? 0)
  const normalizedRatio = Math.max(0, Math.min(1, Number(ratio == null ? 1 : ratio)))
  const refundFen = multiplyFen(totalFen, normalizedRatio)
  if (refundFen < 1 && Number(order.balancePaidAmount || 0) <= 0) throw badRequest('退款金额不能低于0.01元')
  const outRefundNo = order.outRefundNo || `RF${Date.now()}${crypto.randomBytes(4).toString('hex')}`
  order.outRefundNo = outRefundNo
  order.refundRequestStatus = 'CREATED'
  order.refundRequest = { outTradeNo: order.id, outRefundNo, reason: String(reason || '订单退款'), ratio: normalizedRatio, refundFen, totalFen }
  order.refundRequestedAt ||= nowText()
  save()
  return { order, ...order.refundRequest, balanceOnly: refundFen === 0 }
}

export function confirmBalanceRefund(orderId, reason, ratio = 1) {
  const order = db.orders.find((item) => String(item.id) === String(orderId))
  if (!order) throw badRequest('订单不存在')
  applyRefund(order, ratio, reason || '余额原路退款')
  addLog('余额退款', `订单 ${order.id} 退款成功 ¥${order.refundAmount}`)
  save()
  return { order }
}

export function markWechatRefundRequested(orderId, prepared, result = {}) {
  const order = db.orders.find((item) => String(item.id) === String(orderId))
  if (!order) throw badRequest('订单不存在')
  order.refundPrevStatus ||= order.status
  order.status = '退款中'
  order.refundRatio = prepared.ratio
  order.refundAmount = round2(Number(order.payAmount || 0) * prepared.ratio)
  order.wechatRefundFen = prepared.refundFen
  order.wechatRefundAmount = fenToYuan(prepared.refundFen)
  order.refundReason = prepared.reason
  order.outRefundNo = prepared.outRefundNo
  order.wechatRefundId = String(result.refund_id || order.wechatRefundId || '')
  order.refundRequestStatus = String(result.status || 'PROCESSING')
  order.refundRequestedAt = nowText()
  order.paymentStatus = 'REFUND_PROCESSING'
  addLog('微信退款', `订单 ${order.id} 已提交退款 ¥${order.refundAmount}`)
  save()
  return order
}

export function confirmWechatRefund(refund) {
  const order = db.orders.find((item) => String(item.id) === String(refund?.out_trade_no))
  if (!order) throw badRequest('退款关联订单不存在')
  if (order.status === '已退款' && order.refundRequestStatus === 'SUCCESS') return { order, duplicate: true }
  if (order.outRefundNo && String(order.outRefundNo) !== String(refund.out_refund_no || '')) throw badRequest('退款单号不匹配')
  const expectedFen = order.wechatRefundFen ?? yuanToFen(order.wechatRefundAmount ?? order.refundAmount ?? 0)
  const actualFen = Number(refund?.amount?.refund)
  if (!Number.isInteger(actualFen) || actualFen !== expectedFen) throw badRequest('微信退款金额与申请金额不一致')
  order.wechatRefundId = String(refund.refund_id || order.wechatRefundId || '')
  order.refundSuccessTime = String(refund.success_time || nowText()).replace('T', ' ').slice(0, 19)
  order.autoRefundRequired = false
  applyRefund(order, order.refundRatio, order.refundReason || '微信退款')
  addLog('微信退款', `订单 ${order.id} 退款成功 ¥${order.refundAmount}`)
  save()
  return { order }
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
    order.refundPrevStatus = order.status
    order.status = '退款中'
    order.refundAuditRequired = false
    save()
    return { order, pending: true, autoApprove: true }
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
  if (order.status === '待发货') throw badRequest('请通过发货功能填写配送方式和物流信息')
  if (['待签到', '待核销'].includes(order.status)) throw badRequest('请由现场工作人员完成签到或核销')
  if (order.status === '待使用') {
    order.fulfillmentStatus = '已使用'
    order.checkedAt = nowText()
    order.status = '待评价'
  } else if (order.status === '待收货') {
    order.fulfillmentStatus = '已收货'
    order.receivedAt = nowText()
    order.status = '待评价'
  } else if (order.status === '已核销') {
    order.status = '待评价'
  }
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
  if (serviceModeOfOrder(order) !== 'delivery') throw badRequest('活动报名无需发货，请使用签到或核销功能')
  const isUpdate = payload.update === true && order.status === '待收货'
  if (order.status !== '待发货' && !isUpdate) {
    throw badRequest(`订单当前状态为「${order.status}」，不可发货`)
  }
  const noLogistics = payload.deliveryType === 'self' || payload.noLogistics === true
  const carrier = String(payload.carrier || '').trim()
  const trackingNo = String(payload.trackingNo || '').trim()
  const shippingNote = String(payload.note || '').trim()
  if (!noLogistics) {
    if (!/^[A-Za-z0-9-]{6,32}$/.test(trackingNo)) throw badRequest('快递单号格式不正确（6-32位字母/数字/短横线）')
    if (!order.address) throw badRequest('该订单没有收货地址，如为线下交付请选择「无需物流」')
  } else if (!shippingNote) {
    throw badRequest('请填写线下交付或自提信息')
  }
  const receiver = orderReceiverText(order)
  order.deliveryType = noLogistics ? 'self' : 'express'
  order.carrier = noLogistics ? '无需物流' : (carrier || '自动识别中')
  order.trackingNo = noLogistics ? '' : trackingNo
  order.shippingNote = shippingNote
  order.shipTime = nowText()
  order.shippedBy = payload.operator || 'admin'
  if (!isUpdate) order.status = '待收货'
  addLog('订单发货', isUpdate
    ? `订单 ${order.id} 物流信息更新为 ${order.carrier} ${order.trackingNo || ''}`.trim()
    : `订单 ${order.id} 已发货：${order.carrier} ${order.trackingNo || ''} → ${receiver.receiver} ${receiver.receiverPhone}`.trim())
  save()
  return order
}

function logisticsState(state) {
  const value = String(state == null ? '' : state)
  if (value === '3' || value.startsWith('3')) return '已签收'
  if (value === '4' || value.startsWith('4')) return '物流异常'
  if (value === '1') return '已揽收'
  if (value === '2' || value.startsWith('2')) return value === '202' ? '派送中' : '运输中'
  return '暂无轨迹'
}

function shipmentOrder(shipment) {
  const collection = shipment.orderType === 'point' ? (db.pointOrders || []) : (db.orders || [])
  return collection.find((item) => String(item.id) === String(shipment.orderId)) || null
}

export function registerLogisticsShipment(order, orderType = 'order') {
  init()
  if (!order || order.deliveryType === 'self' || !order.trackingNo) return null
  db.logisticsShipments.forEach((item) => {
    if (item.orderType === orderType && String(item.orderId) === String(order.id) && item.trackingNo !== order.trackingNo && item.subscriptionStatus !== 'replaced') {
      item.subscriptionStatus = 'replaced'
      item.updatedAt = nowText()
    }
  })
  let shipment = db.logisticsShipments.find((item) => item.orderType === orderType && String(item.orderId) === String(order.id) && item.trackingNo === order.trackingNo)
  const address = order.address || {}
  if (!shipment) {
    shipment = {
      id: `LOG${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
      provider: 'kdniao',
      orderType,
      orderId: order.id,
      carrier: order.carrier,
      carrierCode: carrierCode(order.carrier),
      trackingNo: order.trackingNo,
      receiverPhone: address.phone || '',
      customerName: address.name || order.customerName || '',
      status: '已发货',
      providerState: '',
      latestDescription: '商家已发货，等待快递公司揽收',
      events: [],
      subscriptionStatus: 'pending',
      subscriptionError: '',
      createdAt: nowText(),
      updatedAt: nowText(),
      lastSyncedAt: '',
      lastQueryAt: '',
      signedAt: ''
    }
    db.logisticsShipments.unshift(shipment)
  } else {
    Object.assign(shipment, {
      carrier: order.carrier,
      carrierCode: carrierCode(order.carrier),
      receiverPhone: address.phone || shipment.receiverPhone || '',
      customerName: address.name || order.customerName || shipment.customerName || '',
      updatedAt: nowText()
    })
  }
  order.logisticsShipmentId = shipment.id
  order.logisticsStatus = shipment.status
  save()
  return clone(shipment)
}

export function updateLogisticsSubscription(id, result = null, error = null) {
  init()
  const shipment = db.logisticsShipments.find((item) => String(item.id) === String(id))
  if (!shipment) return null
  shipment.subscriptionStatus = error ? 'failed' : 'active'
  shipment.subscriptionError = error ? String(error.message || error) : ''
  shipment.subscriptionResult = result ? clone(result) : null
  shipment.subscribedAt = error ? shipment.subscribedAt || '' : nowText()
  shipment.updatedAt = nowText()
  save()
  return clone(shipment)
}

function applyTrackingItem(item, source = 'callback') {
  const trackingNo = String(item.LogisticCode || item.LogisticsCode || '')
  const code = String(item.ShipperCode || '')
  const shipment = db.logisticsShipments.find((row) => row.trackingNo === trackingNo && (!code || !row.carrierCode || row.carrierCode === code))
  if (!shipment) return null
  const traces = Array.isArray(item.Traces) ? item.Traces : []
  if (code) {
    shipment.carrierCode = code
    shipment.carrier = carrierName(code, item.ShipperName || shipment.carrier)
  }
  shipment.events = traces.map((trace, index) => ({
    id: `${trace.AcceptTime || trace.ActionTime || index}-${index}`,
    time: trace.AcceptTime || trace.ActionTime || '',
    description: trace.AcceptStation || trace.Action || trace.Remark || '',
    location: trace.Location || ''
  })).filter((event) => event.time || event.description)
  const latest = shipment.events[shipment.events.length - 1]
  shipment.providerState = String(item.State == null ? shipment.providerState || '' : item.State)
  shipment.status = logisticsState(shipment.providerState)
  shipment.latestDescription = latest?.description || item.Reason || shipment.latestDescription
  shipment.lastSyncedAt = nowText()
  if (source === 'query') shipment.lastQueryAt = nowText()
  shipment.updatedAt = nowText()
  shipment.subscriptionError = item.Success === false || item.Success === 'false' ? String(item.Reason || '轨迹查询失败') : ''
  if (shipment.subscriptionStatus === 'pending' && !shipment.subscriptionError) shipment.subscriptionStatus = 'active'
  const order = shipmentOrder(shipment)
  if (order) {
    if (shipment.carrier && shipment.carrier !== '自动识别中') order.carrier = shipment.carrier
    order.logisticsStatus = shipment.status
    order.logisticsLatest = shipment.latestDescription
    order.logisticsUpdatedAt = shipment.lastSyncedAt
    if (shipment.status === '已签收') {
      shipment.signedAt ||= latest?.time || nowText()
      if (shipment.orderType === 'point' && order.status === '已发货') order.status = '已完成'
      if (shipment.orderType === 'order' && order.status === '待收货') order.status = '待评价'
    }
  }
  return shipment
}

export function applyKdniaoTracking(result, source = 'callback') {
  init()
  const items = Array.isArray(result?.Data) ? result.Data : [result]
  const updated = items.map((item) => applyTrackingItem(item || {}, source)).filter(Boolean)
  save()
  return clone(updated)
}

export function recordLogisticsWebhook(entry = {}) {
  init()
  const log = {
    id: `LWH${Date.now()}${Math.floor(Math.random() * 1000)}`,
    provider: 'kdniao',
    receivedAt: nowText(),
    verified: Boolean(entry.verified),
    processed: Boolean(entry.processed),
    error: String(entry.error || ''),
    requestType: String(entry.requestType || ''),
    payload: entry.payload ? clone(entry.payload) : null
  }
  db.logisticsWebhookLogs.unshift(log)
  if (db.logisticsWebhookLogs.length > 500) db.logisticsWebhookLogs.length = 500
  save()
  return clone(log)
}

export function getOrderLogistics(orderId, orderType = 'order') {
  init()
  const shipment = db.logisticsShipments.find((item) => item.orderType === orderType && String(item.orderId) === String(orderId))
  return shipment ? clone(shipment) : null
}

export function getLogisticsShipment(id) {
  init()
  const shipment = db.logisticsShipments.find((item) => String(item.id) === String(id))
  return shipment ? clone(shipment) : null
}

export function listLogisticsExceptions() {
  init()
  return clone(db.logisticsShipments.filter((item) => item.status === '物流异常' || item.subscriptionStatus === 'failed' || item.subscriptionError))
}

export function listActiveLogisticsShipments() {
  init()
  return clone(db.logisticsShipments.filter((item) => item.subscriptionStatus !== 'replaced' && !['已签收'].includes(item.status) && item.trackingNo))
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
  const mode = serviceModeOfOrder(order)
  if (mode === 'delivery') throw new Error('实物订单不支持签到核销')
  if (order.status === '待评价' && order.fulfillmentStatus) throw new Error(mode === 'checkin' ? '该订单已签到' : '该订单已核销')
  if (!['待签到', '待核销', '待使用', '待发货', '待收货'].includes(order.status)) throw new Error('当前状态不可签到或核销')
  order.fulfillmentStatus = mode === 'checkin' ? '已签到' : (mode === 'online' ? '已使用' : '已核销')
  order.checkedAt = nowText()
  order.verifiedAt = order.checkedAt
  order.status = '待评价'
  addLog(mode === 'checkin' ? '活动签到' : '订单核销', `订单 ${order.id} ${order.fulfillmentStatus}`)
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
      time: nowText(),
      hidden: false,
      reply: '',
      repliedAt: ''
    })
  }
  save()
  return order
}

export function listReviews(includeHidden = false) {
  return (db.reviews || [])
    .filter((review) => includeHidden || review.hidden !== true)
    .map((review) => ({
      ...review,
      hidden: review.hidden === true,
      reply: String(review.reply || ''),
      repliedAt: String(review.repliedAt || '')
    }))
}

export function setReviewHidden(id, hidden) {
  const review = (db.reviews || []).find((item) => String(item.id) === String(id))
  if (!review) throw badRequest('评价不存在')
  review.hidden = Boolean(hidden)
  review.hiddenAt = review.hidden ? nowText() : ''
  addLog('评价管理', `${review.hidden ? '屏蔽' : '恢复'}评价 ${review.id}`)
  save()
  return review
}

export function replyReview(id, content) {
  const review = (db.reviews || []).find((item) => String(item.id) === String(id))
  if (!review) throw badRequest('评价不存在')
  const reply = String(content || '').trim()
  if (!reply) throw badRequest('请输入回复内容')
  if (reply.length > 500) throw badRequest('回复内容不能超过500个字符')
  review.reply = reply
  review.repliedAt = nowText()
  addLog('评价管理', `回复评价 ${review.id}`)
  save()
  return review
}

export function deleteReviewReply(id) {
  const review = (db.reviews || []).find((item) => String(item.id) === String(id))
  if (!review) throw badRequest('评价不存在')
  review.reply = ''
  review.repliedAt = ''
  addLog('评价管理', `删除评价 ${review.id} 的回复`)
  save()
  return review
}

export function deleteReview(id) {
  const review = (db.reviews || []).find((item) => String(item.id) === String(id))
  if (!review) throw badRequest('评价不存在')
  db.reviews = db.reviews.filter((item) => String(item.id) !== String(id))
  addLog('评价管理', `删除评价 ${review.id}`)
  save()
  return { ok: true }
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

export function getWithdrawDetail(id) {
  const withdraw = db.withdraws.find((item) => String(item.id) === String(id))
  if (!withdraw) throw badRequest('提现单不存在')
  const manager = findManager(withdraw.managerId)
  return {
    withdraw,
    manager: manager ? { ...manager, ...managerBalance(manager.id) } : null,
    commissions: commissionRowsOf(withdraw.id).slice().sort((a, b) => String(b.createTime || '').localeCompare(String(a.createTime || '')))
  }
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

export function approveWithdraw(id, options = {}) {
  const record = db.withdraws.find((w) => String(w.id) === String(id))
  if (!record) throw badRequest('提现单不存在')
  if (record.status !== '待审核') throw badRequest(`提现单当前状态为「${record.status}」，不可重复打款`)
  const taxRate = Number(options.taxRate ?? record.taxRate ?? db.config.withdrawTaxRate ?? 20)
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) throw badRequest('税率必须是 0 到 100 之间的数字')
  const payChannel = String(options.payChannel ?? record.payChannel ?? '').trim()
  const payOrderNo = String(options.payOrderNo ?? '').trim()
  if (!payChannel) throw badRequest('请选择支付渠道')
  if (!payOrderNo) throw badRequest('请填写打款流水号')
  const rows = commissionRowsOf(record.id, COMMISSION_STATUS.WITHDRAWING)
  const lockedTotal = sumCommissions(rows)
  if (!rows.length || lockedTotal <= 0) throw badRequest('该提现单没有锁定中的佣金，不能打款')
  if (Math.abs(lockedTotal - round2(record.amount)) > 0.01) {
    record.amount = lockedTotal
    addLog('提现审核', `提现单 ${record.id} 金额按锁定佣金校正为 ¥${record.amount}`)
  }
  record.taxRate = taxRate
  record.tax = round2(record.amount * taxRate / 100)
  record.actualAmount = round2(record.amount - record.tax)
  record.payChannel = payChannel
  record.payOrderNo = payOrderNo
  record.financeRemark = String(options.financeRemark || '').trim()
  record.status = '已到账'
  record.payTime = nowText()
  record.auditTime = record.payTime
  record.operator = String(options.operator || 'admin')
  record.settledCommissionIds = rows.map((c) => c.id)
  rows.forEach((c) => {
    c.status = COMMISSION_STATUS.SETTLED
    c.settleTime = nowText()
  })
  addLog('提现审核', `提现单 ${record.id} 已通过 ${record.payChannel} 打款 ¥${record.amount}（代扣税 ¥${record.tax}，实付 ¥${record.actualAmount}，流水号 ${record.payOrderNo}）`)
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
  if (!Number.isInteger(groupCount) || groupCount < 0 || groupCount > 50) throw badRequest('微信群数量应为0-50的整数')
  if (!Number.isInteger(memberCount) || memberCount < 0 || memberCount > 5000) throw badRequest('社群总人数应为0-5000的整数')
  const pendingPayment = db.managerApplications.find((a) => a.status === '待付款' && String(a.userId) === String(userId))
  if (pendingPayment) return pendingPayment
  const hasPending = db.managerApplications.some((a) => a.status === '待审核' && String(a.userId) === String(userId))
  const alreadyManager = Boolean(findManagerByUser(userId)) || Boolean(customer.isManager)
  if (hasPending || alreadyManager) throw badRequest('已有待审核的申请或已是主理人')
  const fee = Number(db.config.managerApplyFee ?? 0)
  const app = {
    id: `APP${Date.now()}`,
    ...form,
    userId,
    name,
    phone,
    paid: fee <= 0,
    feeAmount: fee,
    paidAmount: 0,
    paidAt: '',
    paymentOrderNo: '',
    paymentMethod: fee > 0 ? '' : '免费申请',
    paymentStatus: fee > 0 ? '待支付' : '免收费',
    financeRemark: '',
    status: fee > 0 ? '待付款' : '待审核',
    submittedAt: nowText()
  }
  db.managerApplications.unshift(app)
  save()
  return app
}

export function prepareManagerApplicationPayment(id, userId) {
  const application = (db.managerApplications || []).find((item) => String(item.id) === String(id))
  if (!application || application.status !== '待付款' || application.paymentStatus !== '待支付') {
    throw badRequest('申请费用已支付或当前状态不能支付')
  }
  if (String(application.userId) !== String(userId)) throw forbidden('无权支付其他会员的申请费用')
  const customer = db.customers.find((item) => String(item.id) === String(userId))
  if (!customer?.wechatOpenId) throw badRequest('当前账号未绑定真实微信身份，请重新登录')
  const amountFen = Number.isSafeInteger(application.feeAmountFen)
    ? application.feeAmountFen
    : yuanToFen(application.feeAmount || 0, '申请费用')
  application.feeAmountFen = amountFen
  if (amountFen <= 0) throw badRequest('该申请无需支付')
  return { application, openid: customer.wechatOpenId, amountFen }
}

export function markWechatPaymentRequested(outTradeNo, expiresAt = 0) {
  const order = db.orders.find((item) => String(item.id) === String(outTradeNo))
  if (order && order.status === '待付款') {
    order.paymentStatus = 'USERPAYING'
    order.paymentRequestedAt = nowText()
    order.paymentQueryAttempts = 0
    order.prepayExpiresAt = Number(expiresAt || order.payDeadline || 0)
    save()
    return order
  }
  const application = (db.managerApplications || []).find((item) => String(item.id) === String(outTradeNo))
  if (application && application.status === '待付款') {
    application.paymentRequestedAt = nowText()
    application.paymentQueryAttempts = 0
    application.prepayExpiresAt = Number(expiresAt || application.prepayExpiresAt || 0)
    save()
    return application
  }
  const recharge = (db.balanceRecharges || []).find((item) => String(item.id) === String(outTradeNo))
  if (recharge && recharge.status === '待支付') {
    recharge.paymentStatus = 'USERPAYING'
    recharge.paymentRequestedAt = nowText()
    recharge.paymentQueryAttempts = 0
    recharge.prepayExpiresAt = Number(expiresAt || recharge.prepayExpiresAt || 0)
    save()
    return recharge
  }
  return null
}

function wechatPaymentRecord(outTradeNo) {
  return db.orders.find((item) => String(item.id) === String(outTradeNo))
    || (db.managerApplications || []).find((item) => String(item.id) === String(outTradeNo))
    || (db.balanceRecharges || []).find((item) => String(item.id) === String(outTradeNo))
    || null
}

export function saveWechatPrepay(outTradeNo, payment, expiresAt) {
  const record = wechatPaymentRecord(outTradeNo)
  if (!record) throw badRequest('支付关联业务单不存在')
  record.wechatPaymentPayload = { ...payment }
  record.prepayExpiresAt = Number(expiresAt || (Date.now() + 2 * 60 * 60 * 1000))
  save()
  return record
}

export function cachedWechatPrepay(outTradeNo) {
  const record = wechatPaymentRecord(outTradeNo)
  if (!record?.wechatPaymentPayload || Number(record.prepayExpiresAt || 0) <= Date.now() + 60_000) return null
  return { ...record.wechatPaymentPayload }
}

export function markWechatPaymentQuery(outTradeNo, result = {}) {
  const record = wechatPaymentRecord(outTradeNo)
  if (!record) throw badRequest('支付关联业务单不存在')
  record.paymentQueryAttempts = Number(record.paymentQueryAttempts || 0) + 1
  record.paymentLastQueriedAt = nowText()
  record.wechatTradeState = String(result.trade_state || '')
  save()
  return record
}

export function markWechatPaymentClosed(outTradeNo) {
  const record = wechatPaymentRecord(outTradeNo)
  if (!record) return null
  record.paymentStatus = 'CLOSED'
  record.wechatTradeState = 'CLOSED'
  record.prepayExpiresAt = 0
  record.wechatPaymentPayload = null
  if (record.status === '待付款') {
    record.status = '已取消'
    releaseSchedule(record)
    returnCoupon(record, true)
    releaseOrderBalance(record, 1, '订单关单，余额退回')
  } else if (record.status === '待支付') {
    record.status = '已关闭'
  }
  save()
  return record
}

export function enqueueWechatNotification(notice, resource) {
  const noticeId = String(notice?.id || '')
  if (!noticeId) throw badRequest('微信支付通知缺少唯一标识')
  let item = db.wechatNotifications.find((row) => row.noticeId === noticeId)
  if (item) return item
  item = {
    id: `WN${Date.now()}${crypto.randomBytes(3).toString('hex')}`,
    noticeId,
    eventType: String(notice?.event_type || ''),
    resource,
    status: 'pending',
    attempts: 0,
    createdAt: nowText(),
    error: ''
  }
  db.wechatNotifications.push(item)
  save()
  return item
}

export function pendingWechatNotifications(limit = 20) {
  return db.wechatNotifications.filter((item) => ['pending', 'failed'].includes(item.status) && item.attempts < 10).slice(0, limit)
}

export function updateWechatNotification(id, status, error = '') {
  const item = db.wechatNotifications.find((row) => row.id === id)
  if (!item) return null
  item.status = status
  item.error = String(error || '')
  item.attempts = Number(item.attempts || 0) + (status === 'processing' ? 1 : 0)
  item.updatedAt = nowText()
  save()
  return item
}

export function markWechatPaymentRequestFailed(outTradeNo, error) {
  const order = db.orders.find((item) => String(item.id) === String(outTradeNo))
  if (order && order.status === '待付款' && order.paymentStatus === 'USERPAYING') {
    order.paymentStatus = 'NOTPAY'
    order.paymentRequestError = String(error?.message || '微信支付下单失败')
    save()
    return order
  }
  const recharge = (db.balanceRecharges || []).find((item) => String(item.id) === String(outTradeNo))
  if (recharge && recharge.status === '待支付' && recharge.paymentStatus === 'USERPAYING') {
    recharge.paymentStatus = 'NOTPAY'
    recharge.paymentRequestError = String(error?.message || '微信支付下单失败')
    save()
    return recharge
  }
  const application = (db.managerApplications || []).find((item) => String(item.id) === String(outTradeNo))
  if (application && application.status === '待付款') {
    application.paymentRequestError = String(error?.message || '微信支付下单失败')
    save()
    return application
  }
  return null
}

export function applyProvider(payload) {
  const { userId, name, phone, type, intro, address } = payload || {}
  const normalizedName = String(name || '').trim()
  const normalizedPhone = normalizePhone(phone)
  const normalizedIntro = String(intro || '').trim()
  const normalizedAddress = String(address || '').trim()
  if (!normalizedName || !normalizedPhone) throw badRequest('请填写名称和手机号')
  if (!/^1\d{10}$/.test(normalizedPhone)) throw badRequest('请填写正确的11位手机号')
  if (!['personal', 'company'].includes(type)) throw badRequest('请选择个人或公司主体类型')
  if (!normalizedAddress) throw badRequest('请填写联系地址')
  if (!normalizedIntro) throw badRequest('请填写主营产品或服务')
  const hasPending = (db.providerApplications || []).some((a) => a.status === '待审核' && String(a.userId) === String(userId))
  if (hasPending) throw new Error('已有待审核的申请')
  const alreadyApproved = (db.providerApplications || []).some((a) => a.status === '已通过' && String(a.userId) === String(userId))
  if (alreadyApproved) throw new Error('该账号已开通商户资格')
  const record = {
    id: `PA${Date.now()}`,
    userId,
    name: normalizedName,
    phone: normalizedPhone,
    type: type || '',
    intro: normalizedIntro,
    address: normalizedAddress,
    status: '待审核',
    submittedAt: nowText()
  }
  db.providerApplications.unshift(record)
  save()
  return record
}

export function auditProvider(id, approve, rejectReason, account = null) {
  const app = (db.providerApplications || []).find((a) => String(a.id) === String(id))
  if (!app) return null
  if (app.status !== '待审核') throw badRequest('该申请已经处理')
  const normalizedRejectReason = String(rejectReason || '').trim()
  if (!approve && !normalizedRejectReason) throw badRequest('请填写拒绝原因')
  if (approve) {
    if (!account || !account.username || !account.passwordHash || !account.salt) throw badRequest('请配置商户登录账号和临时密码')
    if (db.merchantAccounts.some((item) => item.username === account.username)) throw badRequest('该商户登录账号已存在')
    const name = String(account.name ?? app.name ?? '').trim()
    const phone = normalizePhone(account.phone ?? app.phone)
    const type = account.type === 'company' ? 'company' : 'personal'
    const intro = String(account.intro ?? app.intro ?? '').trim()
    const address = String(account.address ?? app.address ?? '').trim()
    const merchantId = Date.now()
    const shopName = String(account.shopName || name).trim()
    const contactName = String(account.contactName || name).trim()
    const contactPhone = normalizePhone(account.contactPhone || phone)
    const contactWechat = String(account.contactWechat || '').trim()
    const cooperationMode = String(account.cooperationMode || '').trim()
    const cooperationContent = String(account.cooperationContent || '').trim()
    if (!name || !shopName) throw badRequest('请填写申请人和商户名称')
    if (!/^1\d{10}$/.test(phone) || !/^1\d{10}$/.test(contactPhone)) throw badRequest('请填写正确的申请手机号和合作联系电话')
    if (!intro || !address) throw badRequest('请完整填写主营服务和联系地址')
    if (!contactName || !cooperationMode || !cooperationContent) throw badRequest('请完整填写合作联系人、合作方式和合作内容')
    Object.assign(app, {
      name,
      phone,
      type,
      intro,
      address,
      shopName,
      contactName,
      contactPhone,
      contactWechat,
      cooperationMode,
      cooperationContent,
      cooperationStartAt: String(account.cooperationStartAt || '').trim(),
      cooperationEndAt: String(account.cooperationEndAt || '').trim(),
      cooperationRemark: String(account.cooperationRemark || '').trim(),
      auditedAt: nowText()
    })
    db.managers.push({ id: merchantId, userId: app.userId || null, name: contactName, shopName, shopIntro: intro, phone: contactPhone, address, cooperationMode, cooperationContent, inviteCode: `SYL${String(merchantId).slice(-6)}`, commissionRate: 8, status: 1, totalPerformance: 0, totalCommission: 0, totalCustomers: 0 })
    db.merchantAccounts.push({ id: `merchant-${merchantId}`, merchantId, providerApplicationId: app.id, userId: app.userId || null, username: account.username, phone: contactPhone, shopName, contactName, contactWechat, cooperationMode, cooperationContent, cooperationStartAt: app.cooperationStartAt, cooperationEndAt: app.cooperationEndAt, cooperationRemark: app.cooperationRemark, permissions: ['merchant.activities', 'merchant.products', 'merchant.courses'], status: 1, createdAt: nowText(), salt: account.salt, passwordHash: account.passwordHash })
    app.merchantId = merchantId
    app.loginUsername = account.username
    app.shopName = shopName
  }
  app.status = approve ? '已通过' : '已拒绝'
  if (!approve) {
    app.rejectReason = normalizedRejectReason
    app.auditedAt = nowText()
  }
  addLog('服务商审核', `${approve ? '通过' : '拒绝'} ${app.name} 的服务商申请${approve ? '' : `，原因：${rejectReason || ''}`}`)
  save()
  return app
}

export function approveManagerApp(id, audit = {}) {
  const app = db.managerApplications.find((a) => a.id === id)
  if (!app) return null
  if (app.status !== '待审核') throw badRequest('该申请已经处理')
  const existing = app.userId ? findManagerByUser(app.userId) : null
  if (existing) throw badRequest(`${app.name} 已是主理人，无需重复通过`)
  const name = String(audit.name ?? app.name ?? '').trim()
  const phone = normalizePhone(audit.phone ?? app.phone)
  const groupCount = Number(audit.groupCount ?? app.groupCount ?? 0)
  const memberCount = Number(audit.memberCount ?? app.memberCount ?? 0)
  const paidAmount = Math.max(0, Number(audit.paidAmount ?? app.paidAmount ?? 0))
  const feeAmount = Math.max(0, Number(audit.feeAmount ?? app.feeAmount ?? paidAmount))
  const paymentOrderNo = String(audit.paymentOrderNo ?? app.paymentOrderNo ?? '').trim()
  const paidAt = String(audit.paidAt ?? app.paidAt ?? '').trim()
  const paymentMethod = String(audit.paymentMethod ?? app.paymentMethod ?? '').trim()
  const paymentStatus = String(audit.paymentStatus ?? app.paymentStatus ?? (paidAmount > 0 ? '待核对' : '免收费')).trim()
  const commissionRate = audit.commissionRate == null || audit.commissionRate === '' ? null : Number(audit.commissionRate)
  if (!name) throw badRequest('申请人姓名不能为空')
  if (!/^1\d{10}$/.test(phone)) throw badRequest('申请人手机号格式不正确')
  if (!Number.isInteger(groupCount) || groupCount < 0 || groupCount > 50) throw badRequest('微信群数量应为0-50的整数')
  if (!Number.isInteger(memberCount) || memberCount < 0 || memberCount > 5000) throw badRequest('社群总人数应为0-5000的整数')
  if (feeAmount > 0 && !['已到账', '免收费'].includes(paymentStatus)) throw badRequest('收费申请需要先确认费用已到账，或明确设为免收费')
  if (paymentStatus === '已到账' && paidAmount <= 0) throw badRequest('请填写实际到账金额')
  if (paymentStatus === '已到账' && (!paymentOrderNo || !paidAt || !paymentMethod)) throw badRequest('请完整填写支付订单编号、支付时间和支付方式')
  if (commissionRate != null && (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 100)) throw badRequest('分佣比例必须在0到100之间')
  Object.assign(app, {
    name,
    phone,
    groupCount,
    memberCount,
    scale: `${groupCount}个群，约${memberCount}人`,
    fields: Array.isArray(audit.fields) ? audit.fields.map((item) => String(item).trim()).filter(Boolean) : (app.fields || []),
    intro: String(audit.intro ?? app.intro ?? '').trim(),
    feeAmount,
    paidAmount,
    paid: paymentStatus === '已到账',
    paymentOrderNo,
    paidAt,
    paymentMethod,
    paymentStatus: feeAmount <= 0 ? '免收费' : paymentStatus,
    financeRemark: String(audit.financeRemark ?? app.financeRemark ?? '').trim(),
    auditedAt: nowText()
  })
  app.status = '已通过'
  const manager = {
    id: Date.now(),
    userId: app.userId || null,
    name: app.name,
    phone: app.phone,
    inviteCode: `SYL${Math.floor(100 + Math.random() * 900)}`,
    commissionRate,
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
  addLog('主理人审核', `通过 ${app.name} 的主理人申请${paidAmount > 0 ? `，到账 ¥${paidAmount}，支付单 ${paymentOrderNo}` : '，免收费'}`)
  save()
  return manager
}

export function rejectManagerApp(id, reason) {
  const app = db.managerApplications.find((a) => a.id === id)
  if (!app) return null
  if (app.status !== '待审核') throw badRequest('该申请已经处理')
  const rejectReason = String(reason || '').trim()
  if (!rejectReason) throw badRequest('请填写拒绝原因')
  app.status = '已拒绝'
  app.rejectReason = rejectReason
  app.auditedAt = nowText()
  if (Number(app.paidAmount || 0) > 0 && app.paymentStatus !== '已退款') app.paymentStatus = '待退款'
  addLog('主理人审核', `拒绝 ${app.name} 的申请，原因：${rejectReason}`)
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
  const manager = findManager(managerId)
  if (!manager || Number(manager.status) === 3) throw badRequest('请选择有效主理人')
  const previousManagerId = c.managerId || null
  if (String(previousManagerId || '') === String(manager.id)) throw badRequest('客户已经归属该主理人')
  const effectiveAt = nowText()
  c.managerId = manager.id
  db.bindings.forEach((b) => {
    if (b.customerId === customerId && b.status === 1) {
      b.status = 3
      b.unbindTime = effectiveAt
      b.unbindReason = reason
      b.nextManagerId = manager.id
    }
  })
  db.bindings.unshift({
    id: `B${Date.now()}`,
    customerId,
    customerName: c.name,
    managerId: manager.id,
    managerName: manager.name,
    previousManagerId,
    bindSource: 4,
    bindTime: effectiveAt,
    effectiveAt,
    changeReason: String(reason || '').trim(),
    status: 1
  })
  addLog('归属管理', `客户 ${c.name} 从主理人 ${previousManagerId || '散客'} 变更到 ${manager.name}；历史订单归属不变，新消费自 ${effectiveAt} 起计入新主理人。原因：${reason}`)
  save()
  return c
}

function bindingConsumption(binding) {
  const start = String(binding.effectiveAt || binding.bindTime || '')
  const end = String(binding.unbindTime || '')
  const orders = customerOrders(binding.customerId).filter((order) => {
    if (['待付款', '已取消', '已退款'].includes(order.status)) return false
    if (String(order.managerId || '') !== String(binding.managerId || '')) return false
    if (order.bindingId) return String(order.bindingId) === String(binding.id)
    const consumedAt = String(order.payTime || order.managerAssignedAt || order.createdAt || '')
    if (start && consumedAt && consumedAt < start) return false
    if (end && consumedAt && consumedAt >= end) return false
    return true
  })
  return customerConsumption(orders)
}

export function listBindingsForAdmin() {
  return (db.bindings || []).map((binding) => {
    const customer = (db.customers || []).find((item) => String(item.id) === String(binding.customerId))
    const summary = customer ? customerAdminSummary(customer) : null
    const consumption = bindingConsumption(binding)
    return {
      ...binding,
      customerName: summary?.name || binding.customerName || '用户',
      phone: summary?.phone || '',
      idCard: summary?.idCard || '',
      birthday: summary?.birthday || '',
      memberId: summary?.memberId || '',
      memberSince: summary?.memberSince || '',
      memberExpireAt: summary?.memberExpireAt || '',
      memberType: summary?.memberType || '',
      consumptionCount: summary?.consumptionCount || 0,
      consumptionAmount: summary?.consumptionAmount || 0,
      attributionConsumptionCount: consumption.consumptionCount,
      attributionConsumptionAmount: consumption.consumptionAmount,
      currentManagerId: customer?.managerId || null,
      isCurrent: Boolean(customer && binding.status === 1 && String(customer.managerId || '') === String(binding.managerId || ''))
    }
  })
}

export function addLog(action, detail, actor = null) {
  db.logs = db.logs || []
  db.logs.unshift({
    id: `LOG${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    action,
    detail,
    operatorId: actor?.id || '',
    operatorAccount: actor?.username || '',
    operatorName: actor?.name || '',
    operatorRole: actor?.role || '',
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
    throw badRequest('同意退款必须通过微信退款流程提交')
  } else {
    // 拒绝后回到申请前的状态，订单继续正常履约
    order.status = order.refundPrevStatus || pendingStatusForMode(serviceModeOfOrder(order))
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
  const customer = db.customers.find((item) => String(item.id) === String(id))
  if (!customer) throw badRequest('会员不存在')

  const input = data || {}
  const idCard = String(input.idCard == null ? customer.idCard || '' : input.idCard).trim().toUpperCase()
  const birthday = String(input.birthday == null ? customer.birthday || '' : input.birthday).trim()
  const memberId = String(input.memberId == null ? customer.memberId || '' : input.memberId).trim()
  if (idCard && !/^\d{15}$|^\d{17}[\dX]$/.test(idCard)) throw badRequest('身份证号码格式不正确')
  if (birthday && !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) throw badRequest('生日格式应为 YYYY-MM-DD')
  if (memberId && db.customers.some((item) => String(item.id) !== String(id) && String(item.memberId || '') === memberId)) {
    throw badRequest('会员码编号已存在')
  }

  // 归属只能通过 rebindCustomer 变更，确保绑定周期、历史订单和佣金都有完整留痕。
  const allowed = ['name', 'phone', 'member', 'balance', 'points', 'memberSince', 'memberExpireAt', 'memberType']
  allowed.forEach((key) => {
    if (input[key] !== undefined) customer[key] = input[key]
  })
  if (input.memberLevel !== undefined) {
    const level = Number(input.memberLevel)
    if (!Number.isInteger(level) || level < 1 || level > 5) throw badRequest('会员等级不正确')
    customer.memberLevel = level
  }
  customer.idCard = idCard
  customer.memberId = memberId
  customer.birthday = birthday || birthdayFromIdCard(idCard)
  addLog('用户管理', `更新客户 ${customer.name} 资料`)
  save()
  return customerAdminSummary(customer)
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
    pendingCheckinCount: db.orders.filter((o) => ['待签到', '待核销'].includes(o.status)).length,
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

function liveVideoUrl(value) {
  const url = String(value || '').trim()
  if (url && !/^(https:\/\/|\/api\/uploads\/files\/)/.test(url)) throw badRequest('课节视频仅支持 HTTPS 或已上传的视频地址')
  return url
}

function normalizeLiveLessons(lessons) {
  if (!Array.isArray(lessons)) return []
  if (lessons.length > 100) throw badRequest('单个课程最多添加100节内容')
  return lessons.map((lesson, index) => {
    const title = String(lesson?.title || '').trim()
    if (!title) throw badRequest(`第${index + 1}节课程缺少标题`)
    return {
      id: String(lesson.id || `lesson-${Date.now()}-${index}`),
      title,
      duration: String(lesson.duration || '').trim(),
      videoUrl: liveVideoUrl(lesson.videoUrl),
      isPreview: Boolean(lesson.isPreview),
      status: Number(lesson.status ?? 1) === 1 ? 1 : 0,
      sort: index + 1
    }
  })
}

export function listLives(userId, options = {}) {
  const all = (get().lives || []).map((live) => {
    const enriched = enrichLive(live)
    const purchased = Boolean(userId && (db.cards || []).some((c) => String(c.liveId) === String(live.id) && String(c.userId) === String(userId)))
    if (userId) enriched.purchased = purchased
    if (!options.admin) {
      enriched.lessons = (enriched.lessons || [])
        .filter((lesson) => Number(lesson.status) === 1)
        .map((lesson) => ({ ...lesson, videoUrl: purchased || lesson.isPreview ? lesson.videoUrl : '' }))
      if (!purchased) {
        enriched.streamUrl = ''
        enriched.replayUrl = ''
      }
    }
    return enriched
  })
  // 线上学堂属于公开课程市场：登录只用于标记购买状态，不能反而缩小课程范围。
  // 未购买用户仍只能拿到已设置为“允许试看”的课节视频地址。
  return all
}

export function createLive(data) {
  const managerId = Number(data && data.managerId)
  if (!managerId || !findManager(managerId)) throw badRequest('请先选择有效商家')
  const lessons = normalizeLiveLessons(data?.lessons || [])
  const live = {
    id: `live${Date.now()}`,
    title: String((data && data.title) || '未命名直播').trim(),
    cover: (data && data.cover) || '📺',
    coverTone: (data && data.coverTone) || 'linear-gradient(135deg,#c25e3d,#e19a6d)',
    hostName: (data && data.hostName) || '岁悦里',
    hostAvatar: (data && data.hostAvatar) || '🧑‍🏫',
    managerId,
    status: (data && data.status) || 'scheduled',
    startAt: (data && data.startAt) || '',
    endAt: (data && data.endAt) || '',
    streamUrl: (data && data.streamUrl) || '',
    replayUrl: (data && data.replayUrl) || '',
    description: (data && data.description) || '',
    memberPrice: Number((data && data.memberPrice) || 0),
    originalPrice: Number((data && data.originalPrice) || 0),
    lessonCount: lessons.length || Number((data && data.lessonCount) || 1),
    lessons,
    duration: (data && data.duration) || '',
    category: (data && data.category) || '视频课程',
    coverImage: (data && data.coverImage) || '',
    activityId: (data && data.activityId != null && data.activityId !== '') ? Number(data.activityId) : null,
    viewers: Number((data && data.viewers) || 0),
    createdAt: new Date().toLocaleString('zh-CN', { hour12: false })
  }
  normalizePaidOfferingPrices(live, '课程', { includeRegularPrice: false })
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
  if (!next.managerId || !findManager(next.managerId)) throw badRequest('请先选择有效商家')
  if (data && data.activityId != null) next.activityId = data.activityId === '' ? null : Number(data.activityId)
  if (data && data.viewers != null) next.viewers = Number(data.viewers)
  if (data && data.lessons !== undefined) {
    next.lessons = normalizeLiveLessons(data.lessons)
    if (next.lessons.length) next.lessonCount = next.lessons.length
  }
  normalizePaidOfferingPrices(next, '课程', { includeRegularPrice: false })
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
  return (get().products || []).map(activitySalesView)
}

function normalizeProductImages(images, coverImage = '') {
  const source = Array.isArray(images) ? images : []
  if (source.length > 9) throw badRequest('商品展示图最多上传9张')
  const normalized = source.map((image, index) => {
    const src = typeof image === 'string' ? image : image?.src
    const url = contentMediaUrl(src, `第${index + 1}张商品展示图`)
    return url ? {
      id: typeof image === 'object' && image?.id ? String(image.id) : `product-image-${index + 1}`,
      src: url,
      label: typeof image === 'object' ? String(image?.label || '').trim() : ''
    } : null
  }).filter(Boolean)
  if (!normalized.length && coverImage) {
    normalized.push({ id: 'product-image-cover', src: contentMediaUrl(coverImage, '商品主图'), label: '商品主图' })
  }
  if (!normalized.length) throw badRequest('请至少上传一张商品展示图')
  return normalized
}

export function createProduct(data) {
  const publisherType = data && data.publisherType === 'platform' ? 'platform' : 'merchant'
  const managerId = publisherType === 'platform' ? null : Number(data && data.managerId)
  if (publisherType === 'merchant' && (!managerId || !findManager(managerId))) throw badRequest('请先选择有效商家')
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
    publisherType,
    managerId,
    regionIds: normalizeRegionIds(data && data.regionIds)
  }
  normalizePaidOfferingPrices(product, '商品')
  product.images = normalizeProductImages(product.images, product.coverImage)
  product.coverImage = product.images[0].src
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
  next.publisherType = next.publisherType === 'platform' ? 'platform' : 'merchant'
  next.managerId = next.publisherType === 'platform' ? null : Number(next.managerId)
  if (next.publisherType === 'merchant' && (!next.managerId || !findManager(next.managerId))) throw badRequest('请先选择有效商家')
  if (data && data.regionIds !== undefined) next.regionIds = normalizeRegionIds(data.regionIds)
  normalizePaidOfferingPrices(next, '商品')
  next.images = normalizeProductImages(next.images, next.coverImage)
  next.coverImage = next.images[0].src
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

function normalizePointProduct(data, current = {}) {
  const next = {
    ...current,
    ...data,
    title: String(data?.title ?? current.title ?? '').trim(),
    coverImage: String(data?.coverImage ?? current.coverImage ?? '').trim(),
    description: String(data?.description ?? current.description ?? '').trim(),
    pointsCost: Number(data?.pointsCost ?? current.pointsCost ?? 0),
    stock: Number(data?.stock ?? current.stock ?? 0),
    soldCount: Number(data?.soldCount ?? current.soldCount ?? 0),
    limitPerUser: Number(data?.limitPerUser ?? current.limitPerUser ?? 1),
    status: Number(data?.status ?? current.status ?? 1)
  }
  if (!next.title) throw badRequest('请填写积分商品名称')
  if (!Number.isInteger(next.pointsCost) || next.pointsCost <= 0) throw badRequest('兑换积分必须是大于0的整数')
  if (!Number.isInteger(next.stock) || next.stock < 0) throw badRequest('库存必须是大于等于0的整数')
  if (!Number.isInteger(next.limitPerUser) || next.limitPerUser <= 0) throw badRequest('每人限兑必须是大于0的整数')
  next.status = next.status === 1 ? 1 : 0
  return next
}

export function listPointProducts(options = {}) {
  const products = get().pointProducts || []
  return options.publishedOnly ? products.filter((item) => item.status === 1) : products
}

export function createPointProduct(data) {
  const product = normalizePointProduct(data)
  product.id = `point-${Date.now()}`
  product.soldCount = 0
  db.pointProducts.unshift(product)
  addLog('积分商城', `新增积分商品：${product.title}`)
  save()
  return product
}

export function updatePointProduct(id, data) {
  const index = (db.pointProducts || []).findIndex((item) => String(item.id) === String(id))
  if (index < 0) return null
  const product = normalizePointProduct(data, db.pointProducts[index])
  product.id = db.pointProducts[index].id
  db.pointProducts[index] = product
  addLog('积分商城', `编辑积分商品：${product.title}`)
  save()
  return product
}

export function deletePointProduct(id) {
  const product = (db.pointProducts || []).find((item) => String(item.id) === String(id))
  if (!product) return null
  if ((db.pointOrders || []).some((order) => String(order.productId) === String(id))) {
    throw badRequest('该商品已有兑换记录，请改为下架，不能删除')
  }
  db.pointProducts = db.pointProducts.filter((item) => String(item.id) !== String(id))
  addLog('积分商城', `删除积分商品：${product.title}`)
  save()
  return { ok: true }
}

export function listPointOrders(userId = null) {
  const orders = get().pointOrders || []
  return userId ? orders.filter((item) => String(item.userId) === String(userId)) : orders
}

export function redeemPointProduct(userId, payload = {}) {
  const product = (db.pointProducts || []).find((item) => String(item.id) === String(payload.productId))
  const user = (db.customers || []).find((item) => String(item.id) === String(userId))
  const address = (db.addresses || []).find((item) => String(item.id) === String(payload.addressId) && String(item.userId) === String(userId))
  const count = Number(payload.count || 1)
  if (!user) throw badRequest('会员信息不存在')
  if (!product || product.status !== 1) throw badRequest('商品已下架或不存在')
  if (!Number.isInteger(count) || count <= 0) throw badRequest('兑换数量不正确')
  if (!address) throw badRequest('请选择有效的收货地址')
  if (product.stock < count) throw badRequest('商品库存不足')
  const exchanged = (db.pointOrders || [])
    .filter((item) => String(item.userId) === String(userId) && String(item.productId) === String(product.id) && item.status !== '已取消')
    .reduce((sum, item) => sum + Number(item.count || 0), 0)
  if (exchanged + count > product.limitPerUser) throw badRequest(`每位会员限兑${product.limitPerUser}件`)
  const pointsUsed = product.pointsCost * count
  if (Number(user.points || 0) < pointsUsed) throw badRequest('积分不足，暂时无法兑换')

  user.points = Number(user.points || 0) - pointsUsed
  product.stock -= count
  product.soldCount = Number(product.soldCount || 0) + count
  const order = {
    id: `JF${Date.now()}`,
    userId: String(userId),
    customerName: user.name || '会员',
    productId: product.id,
    productTitle: product.title,
    coverImage: product.coverImage,
    pointsCost: product.pointsCost,
    pointsUsed,
    count,
    address: clone(address),
    status: '待发货',
    createdAt: nowText()
  }
  db.pointOrders.unshift(order)
  addLog('积分商城', `${user.name || user.id}兑换${product.title}，扣除${pointsUsed}积分`)
  save()
  return { order, user: { ...user, ...memberIdentity(user) }, product }
}

export function updatePointOrder(id, data = {}) {
  const order = (db.pointOrders || []).find((item) => String(item.id) === String(id))
  if (!order) throw badRequest('兑换单不存在')
  const nextStatus = data.status
  if (nextStatus === '已发货') {
    if (!['待发货', '已发货'].includes(order.status)) throw badRequest(`兑换单当前状态为「${order.status}」，不可发货`)
    const noLogistics = data.deliveryType === 'self'
    const carrier = String(data.carrier || '').trim()
    const trackingNo = String(data.trackingNo || '').trim()
    const shippingNote = String(data.note || '').trim()
    if (!noLogistics) {
      if (!/^[A-Za-z0-9-]{6,32}$/.test(trackingNo)) throw badRequest('快递单号格式不正确（6-32位字母/数字/短横线）')
      if (!order.address) throw badRequest('该兑换单没有收货地址，如为线下交付请选择「无需物流」')
    } else if (!shippingNote) {
      throw badRequest('请填写线下交付或自提信息')
    }
    order.deliveryType = noLogistics ? 'self' : 'express'
    order.carrier = noLogistics ? '无需物流' : (carrier || '自动识别中')
    order.trackingNo = noLogistics ? '' : trackingNo
    order.shippingNote = shippingNote
    order.shipTime = order.status === '待发货' ? nowText() : (order.shipTime || nowText())
    order.status = '已发货'
  } else if (nextStatus === '已完成') {
    if (order.status !== '已发货') throw badRequest('兑换单尚未发货，不能直接完成')
    order.status = '已完成'
  } else if (nextStatus && nextStatus !== order.status) {
    throw badRequest('不支持的兑换单状态操作')
  }
  order.updatedAt = nowText()
  addLog('积分商城', order.status === '已发货'
    ? `兑换单 ${order.id} 已发货：${order.carrier} ${order.trackingNo || ''}`.trim()
    : `更新兑换单 ${order.id}：${order.status}`)
  save()
  return order
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

function birthdayFromIdCard(idCard) {
  const value = String(idCard || '').trim().toUpperCase()
  const digits = value.length === 18 ? value.slice(6, 14) : (value.length === 15 ? `19${value.slice(6, 12)}` : '')
  if (!/^\d{8}$/.test(digits)) return ''
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
}

function customerOrders(userId) {
  return (db.orders || [])
    .filter((order) => String(order.userId) === String(userId))
    .slice()
    .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')))
}

function customerConsumption(orders) {
  const paidOrders = orders.filter((order) => !['待付款', '已取消', '已退款'].includes(order.status))
  return {
    consumptionCount: paidOrders.length,
    consumptionAmount: round2(paidOrders.reduce((sum, order) => sum + Number(order.payAmount || 0), 0))
  }
}

function customerAdminSummary(customer) {
  const identity = memberIdentity(customer)
  const orders = customerOrders(customer.id)
  const consumption = customerConsumption(orders)
  return {
    ...customer,
    ...identity,
    birthday: customer.birthday || birthdayFromIdCard(customer.idCard),
    memberType: customer.memberType || identity.memberLevelName,
    ...consumption
  }
}

export function listCustomersForAdmin() {
  return (db.customers || []).map(customerAdminSummary)
}

export function getCustomerAdminDetail(userId) {
  const customer = (db.customers || []).find((item) => String(item.id) === String(userId))
  if (!customer) throw badRequest('会员不存在')
  const orders = customerOrders(userId)
  const cards = (db.cards || [])
    .filter((card) => String(card.userId) === String(userId))
    .map((card) => {
      const attendanceRecords = Array.isArray(card.attendanceRecords) ? card.attendanceRecords : []
      return {
        ...card,
        attendanceRecords,
        checkedCount: attendanceRecords.filter((record) => record.status === 'checked').length,
        absentCount: attendanceRecords.filter((record) => record.status === 'absent').length
      }
    })
  return {
    customer: { ...customerAdminSummary(customer), ...customerConsumption(orders) },
    orders,
    cards
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

export function updateUserProfile(userId, data) {
  const user = db.customers.find((item) => String(item.id) === String(userId))
  if (!user) throw badRequest('会员不存在')

  const name = String((data && data.name) || '').trim()
  if (!name) throw badRequest('请输入用户名')
  if (name.length > 20) throw badRequest('用户名不能超过20个字符')
  if (/[\u0000-\u001f\u007f]/.test(name)) throw badRequest('用户名包含无效字符')

  if (user.name === name) return { ...user, ...memberIdentity(user) }
  user.name = name
  addLog('用户管理', `会员 ${user.id} 修改用户名为 ${name}`)
  save()
  return { ...user, ...memberIdentity(user) }
}

export function joinMember(userId) {
  const user = db.customers.find((c) => String(c.id) === String(userId))
  if (!user) throw badRequest('会员不存在')
  const wasMember = Boolean(user.member)
  let issuedCount = 0
  user.member = true
  const now = new Date()
  if (!user.memberSince) user.memberSince = `${now.getFullYear()}年${now.getMonth() + 1}月`
  if (!user.memberLevel) user.memberLevel = 2
  if (!user.memberExpireAt) user.memberExpireAt = '长期有效'
  // 首次入会赠送 2 张无门槛券；已入会则不重复发放
  if (!wasMember) {
    let template = db.couponTemplates.find((coupon) => coupon.code === 'MEMBER_WELCOME_10')
    if (!template) {
      template = {
        id: `TPL-WELCOME-10`,
        code: 'MEMBER_WELCOME_10',
        type: 1,
        title: '入会专享10元券',
        desc: '全场通用',
        value: 10,
        minAmount: 0,
        expireAt: '2026-12-31',
        status: 1,
        publisherType: 'platform',
        managerId: null,
        distribution: 'join',
        perUserLimit: 2
      }
      db.couponTemplates.push(template)
    }
    const granted = db.userCoupons.filter((record) => String(record.templateId) === String(template.id) && String(record.userId) === String(userId))
    const grantLimit = Math.max(0, Number(template.perUserLimit || 0))
    for (let index = granted.length; index < grantLimit; index += 1) {
      issueCoupon(template, userId, { source: 'member-join' })
      issuedCount += 1
    }
  }
  save()
  return { user: { ...user, ...memberIdentity(user) }, coupons: visibleCouponsFor(userId), alreadyMember: wasMember, issuedCount }
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

export function purchaseLive(liveId, userId, options = {}) {
  const live = (db.lives || []).find((l) => String(l.id) === String(liveId))
  if (!live) throw new Error('课程不存在')
  const exists = (db.cards || []).some((c) => String(c.liveId) === String(live.id) && String(c.userId) === String(userId))
  if (exists) throw new Error('已购买过该课程')
  const pending = (db.orders || []).find((order) => order.source === 'live'
    && order.status === '待付款'
    && String(order.liveId) === String(live.id)
    && String(order.userId) === String(userId))
  if (pending) return pending
  const total = Number(live.lessonCount || 10)
  // 先创建待付款订单；课程权益只能由微信支付成功回调发放。
  const buyer = db.customers.find((c) => String(c.id) === String(userId)) || null
  const price = round2(live.memberPrice || live.originalPrice || 0)
  if (price < 0.01) throw badRequest('课程价格最低为0.01元，不能为0元')
  const originalPrice = round2(live.originalPrice || live.memberPrice || 0)
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
    originalUnitPrice: originalPrice,
    originalAmount: Math.max(originalPrice, price),
    discountedAmount: price,
    couponDiscountAmount: 0,
    actualPaidAmount: price,
    payAmount: price,
    balancePaidAmount: 0,
    balanceRefundAmount: 0,
    wechatPayAmount: price,
    balanceStatus: 'unused',
    discount: 0,
    status: '待付款',
    coupon: '未使用',
    couponId: null,
    code: `${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)}`,
    managerId: buyer ? buyer.managerId : null,
    managerAssignedAt: nowText(),
    attributionSource: '购课时会员归属快照',
    commissionRate: 0,
    commissionAmount: 0,
    createdAt: nowText(),
    paymentStatus: 'NOTPAY',
    payChannel: '',
    payTime: '',
    payDeadline: Date.now() + 30 * 60 * 1000,
    cardId: null
  }
  db.orders.unshift(order)
  reserveOrderBalance(order, options.useBalance)
  save()
  return order
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
