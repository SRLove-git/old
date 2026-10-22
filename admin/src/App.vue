<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, defineAsyncComponent } from 'vue'
import Message from '@arco-design/web-vue/es/message'
import Modal from '@arco-design/web-vue/es/modal'
import {
  IconMenuFold,
  IconMenuUnfold,
  IconNotification
} from '@arco-design/web-vue/es/icon'
import { api, isAuthed, setToken, clearToken, getAccount, setAccount } from './api.js'
import { NAV_ITEMS as nav } from './navigation.js'
import {
  BRAND_COPY_FIELDS, copyForEditor, copyForStorage, createDefaultConfig as defaultConfig,
  replaceText, wechatNoteForEditor, wechatNoteForStorage
} from './config-model.js'
import {
  CONTENT_TYPE_OPTIONS as contentTypeOptions,
  COUPON_TYPES as couponTypes, MANAGER_FINANCE_STATUS_OPTIONS as managerFinanceStatusOptions,
  MANAGER_PAYMENT_STATUS_OPTIONS as managerPaymentStatusOptions, ORDER_STATUSES as orderStatuses,
  POST_TYPE_OPTIONS as postTypeOptions, PROVIDER_TYPE_OPTIONS as providerTypeOptions,
  PUBLISH_OPTIONS as publishOptions, REFUND_RULE_TYPE_OPTIONS as refundRuleTypeOptions,
  SELL_TYPE_OPTIONS as sellTypeOptions, SERVICE_MODE_OPTIONS as serviceModeOptions,
  WITHDRAW_STATUS_OPTIONS as withdrawStatusOptions
} from './options.js'
import { areaChildrenByParent, areaName, provinceOptions, regionArea } from './utils/regions.js'
import {
  fmtMoney, fuzzyMatch, isPaidPrice, notificationColor,
  notificationLabel, orderAddressText, orderChip, statusChip, transferStateText
} from './utils/presentation.js'

const DashboardView = defineAsyncComponent(() => import('./views/DashboardView.vue'))
const AuditLogsView = defineAsyncComponent(() => import('./views/AuditLogsView.vue'))
const CategoriesView = defineAsyncComponent(() => import('./views/CategoriesView.vue'))
const RegionsView = defineAsyncComponent(() => import('./views/RegionsView.vue'))
const OrdersView = defineAsyncComponent(() => import('./views/OrdersView.vue'))
const LogisticsView = defineAsyncComponent(() => import('./views/LogisticsView.vue'))
const ReviewsView = defineAsyncComponent(() => import('./views/ReviewsView.vue'))
const CustomersView = defineAsyncComponent(() => import('./views/CustomersView.vue'))
const ManagersView = defineAsyncComponent(() => import('./views/ManagersView.vue'))
const WithdrawsView = defineAsyncComponent(() => import('./views/WithdrawsView.vue'))
const BindingsView = defineAsyncComponent(() => import('./views/BindingsView.vue'))
const CommissionsView = defineAsyncComponent(() => import('./views/CommissionsView.vue'))
const PermissionsView = defineAsyncComponent(() => import('./views/PermissionsView.vue'))
const ConfigView = defineAsyncComponent(() => import('./views/ConfigView.vue'))
const MerchantsView = defineAsyncComponent(() => import('./views/MerchantsView.vue'))
const LivesView = defineAsyncComponent(() => import('./views/LivesView.vue'))
const PointsMallView = defineAsyncComponent(() => import('./views/PointsMallView.vue'))
const CouponsView = defineAsyncComponent(() => import('./views/CouponsView.vue'))
const BannersView = defineAsyncComponent(() => import('./views/BannersView.vue'))
const ContentView = defineAsyncComponent(() => import('./views/ContentView.vue'))
const ApplicationsView = defineAsyncComponent(() => import('./views/ApplicationsView.vue'))
const ProvidersView = defineAsyncComponent(() => import('./views/ProvidersView.vue'))
const ActivitiesView = defineAsyncComponent(() => import('./views/ActivitiesView.vue'))
const ProductsView = defineAsyncComponent(() => import('./views/ProductsView.vue'))
const VerifyView = defineAsyncComponent(() => import('./views/VerifyView.vue'))

const view = ref(new URLSearchParams(window.location.search).get('view') || 'dashboard')
const loading = ref(false)
const error = ref('')
const collapsed = ref(false)
const authed = ref(isAuthed())
const currentAdmin = ref(getAccount())
const loginUsername = ref('')
const loginPassword = ref('')
const loginLoading = ref(false)
const loginError = ref('')
const notifications = ref([])
const notificationLoading = ref(false)
const notificationOpen = ref(false)
let notificationTimer = null

const stats = ref(null)
const activities = ref([])
const lives = ref([])
const orders = ref([])
const logisticsExceptions = ref([])
const logisticsConfig = ref({ provider: 'kdniao', configured: false })
const logisticsQueryForm = ref({ trackingNo: '' })
const logisticsQueryResult = ref(null)
const logisticsQueryLoading = ref(false)
const applications = ref([])
const providerApplications = ref([])
const providerApproveTarget = ref(null)
const providerAccountForm = ref({})
const managerReviewTarget = ref(null)
const managerApprovalForm = ref(null)
const managerRejectMode = ref(false)
const managerRejectReason = ref('')
const managerForm = ref(null)
const managerFinanceTarget = ref(null)
const managerFinanceDetail = ref(null)
const managerFinanceLoading = ref(false)
const managerFinanceStatus = ref('')
const unbindApplications = ref([])
const managers = ref([])
const customers = ref([])
const bindings = ref([])
const commissions = ref([])
const settlementRecords = ref([])
const commissionManagerId = ref('')
const withdraws = ref([])
const withdrawStatusFilter = ref('')
const withdrawDateRange = ref([])
const withdrawDetailTarget = ref(null)
const withdrawDetail = ref(null)
const withdrawDetailLoading = ref(false)
const withdrawAuditForm = ref(null)
const coupons = ref([])
const couponRecordsTarget = ref(null)
const couponRecords = ref([])
const couponRecordsLoading = ref(false)
const reviews = ref([])
const banners = ref([])
const products = ref([])
const pointProducts = ref([])
const pointOrders = ref([])
const regions = ref([])
const contentPosts = ref([])
const logs = ref([])
const adminAccounts = ref([])
const merchantAccounts = ref([])
const merchantStatusFilter = ref('all')
const permissionOptions = ref({ admin: [], merchant: [] })
const adminAccountForm = ref(null)
const merchantPermissionForm = ref(null)
const passwordForm = ref(null)
const selfPasswordForm = ref(null)

const initialConfig = defaultConfig()
initialConfig.copy = copyForEditor(initialConfig.copy, initialConfig.brand.chineseName)
initialConfig.homeAssistant.wechatNote = wechatNoteForEditor(initialConfig.homeAssistant.wechatNote, initialConfig.assistant.wechat)
const config = ref(initialConfig)
const configBrandOriginal = ref(initialConfig.brand.chineseName)
const configWechatOriginal = ref(initialConfig.assistant.wechat)

watch(() => config.value.brand?.chineseName, (nextBrand, previousBrand) => {
  if (!nextBrand || !previousBrand || nextBrand === previousBrand) return
  BRAND_COPY_FIELDS.forEach((field) => {
    config.value.copy[field] = replaceText(config.value.copy[field], previousBrand, nextBrand)
  })
})

watch(() => config.value.assistant?.wechat, (nextWechat, previousWechat) => {
  if (!nextWechat || !previousWechat || nextWechat === previousWechat) return
  config.value.homeAssistant.wechatNote = replaceText(config.value.homeAssistant.wechatNote, previousWechat, nextWechat)
})
const qrUploading = ref({ officialAccount: false, videoChannel: false, homeAssistant: false })

const verifyCode = ref('')
const verifyOrder = ref(null)
const verifySearching = ref(false)

const cardCustomerId = ref('')
const cardProfile = ref(null)
const cardList = ref([])
const cardLoading = ref(false)
const makeupTarget = ref(null)
const makeupForm = ref({ date: '', time: '', reason: '' })

const kw = ref('')
const selectedMerchantId = ref('')
const activityPublisherId = ref('platform')
const productPublisherId = ref('platform')
const activityCategoryFilter = ref('all')
const orderStatusFilter = ref('全部')

const activityForm = ref(null)
const activityCoverInput = ref(null)
const activityCoverUploading = ref(false)
const productGalleryInput = ref(null)
const productImagesUploading = ref(false)
const productImages = ref([])
const activitySchedules = ref([])
const activitySkus = ref([])
const activityDetailBlocks = ref([])
const activityDetailUploading = ref({})
const activityRefundLadder = ref([])
const productForm = ref(null)
const productSkus = ref([])
const productDetailBlocks = ref([])
const productDetailUploading = ref({})
const productRefundLadder = ref([])

const activityEditorSections = [
  { key: 'basic', label: '基础信息', hint: '标题、图片与分类' },
  { key: 'sales', label: '销售设置', hint: '价格、状态与归属' },
  { key: 'fulfillment', label: '预约与履约', hint: '场次、规格与退改' },
  { key: 'detail', label: '活动详情', hint: '图文与视频介绍' }
]
const productEditorSections = [
  { key: 'basic', label: '基础信息', hint: '标题、图片与分类' },
  { key: 'sales', label: '销售信息', hint: '价格、库存与状态' },
  { key: 'fulfillment', label: '履约与售后', hint: '配送、核销与退改' },
  { key: 'variants', label: '商品规格', hint: '规格价格与库存' },
  { key: 'detail', label: '商品详情', hint: '图文与视频介绍' }
]

function editorSectionDone(type, key) {
  if (type === 'activity') {
    const form = activityForm.value || {}
    if (key === 'basic') return Boolean(String(form.title || '').trim() && form.category)
    if (key === 'sales') return isPaidPrice(form.memberPrice) && isPaidPrice(form.price) && form.status !== undefined
    if (key === 'fulfillment') return Boolean(form.serviceMode && (form.sellType !== 'date' || activitySchedules.value.length) && (form.sellType !== 'sku' || activitySkus.value.length))
    if (key === 'detail') return activityDetailBlocks.value.some((block) => block.type === 'text' ? String(block.text || '').trim() : block.src || block.url)
  } else {
    const form = productForm.value || {}
    if (key === 'basic') return Boolean(String(form.title || '').trim() && form.category && productImages.value.length)
    if (key === 'sales') return isPaidPrice(form.memberPrice) && isPaidPrice(form.price) && Number(form.stock) >= 0 && form.status !== undefined
    if (key === 'fulfillment') return Boolean(form.serviceMode && form.refundRule?.type)
    if (key === 'variants') return !productSkus.value.length || productSkus.value.every((sku) => String(sku.name || '').trim() && Number(sku.stock) >= 0)
    if (key === 'detail') return productDetailBlocks.value.some((block) => block.type === 'text' ? String(block.text || '').trim() : block.src || block.url)
  }
  return false
}

function editorProgress(type) {
  const sections = type === 'activity' ? activityEditorSections : productEditorSections
  const done = sections.filter((item) => editorSectionDone(type, item.key)).length
  return Math.round(done / sections.length * 100)
}

function scrollEditorSection(type, key) {
  document.getElementById(`${type}-editor-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
const pointProductForm = ref(null)
const pointCoverInput = ref(null)
const pointCoverUploading = ref(false)
const liveForm = ref(null)
const liveCoverInput = ref(null)
const liveCoverUploading = ref(false)
const liveVideoUploading = ref({})
const regionForm = ref(null)
const contentForm = ref(null)
const contentBlocks = ref([])
const contentCoverInput = ref(null)
const contentCoverUploading = ref(false)
const contentBlockUploading = ref({})
const couponForm = ref(null)
const reviewReplyTarget = ref(null)
const reviewReplyText = ref('')
const bannerForm = ref(null)
const bannerMediaInput = ref(null)
const bannerMediaUploading = ref(false)
const customerForm = ref(null)
const customerDetail = ref(null)
const customerDetailLoading = ref(false)
const customerDetailBinding = ref(null)
const rebindTarget = ref(null)
const rebindManagerId = ref('')
const rebindReason = ref('')
const adjustTarget = ref(null)
const adjustAmount = ref('')
const adjustReason = ref('')
const shipTarget = ref(null)
const shipForm = ref({ update: false, deliveryType: 'express', trackingNo: '', note: '' })

const categories = ref({})
const categoryForm = ref(null)
const cityOptions = computed(() => areaChildrenByParent.get(String(regionForm.value?.provinceCode || '')) || [])
const districtOptions = computed(() => areaChildrenByParent.get(String(regionForm.value?.cityCode || '')) || [])

function onRegionProvinceChange(value) {
  regionForm.value.provinceCode = String(value || '')
  regionForm.value.cityCode = ''
  regionForm.value.districtCode = ''
}

function onRegionCityChange(value) {
  regionForm.value.cityCode = String(value || '')
  regionForm.value.districtCode = ''
}

const categoryList = computed(() =>
  Object.keys(categories.value)
    .map((id) => ({ id: Number(id), ...categories.value[id] }))
    .sort((a, b) => Number(a.id) - Number(b.id))
)

const categoryOptions = computed(() =>
  categoryList.value.map((c) => ({ label: c.name, value: c.id }))
)
const productCategoryOptions = computed(() =>
  categoryList.value
    .filter((c) => c.type === 'product')
    .map((c) => ({ label: c.name, value: c.id }))
)
const enabledRegionOptions = computed(() =>
  regions.value
    .filter((region) => region.enabled !== false)
    .sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0))
    .map((region) => ({ label: region.name, value: String(region.id) }))
)

function regionNames(record) {
  const ids = Array.isArray(record && record.regionIds) ? record.regionIds.map(String) : []
  const names = ids.map((id) => regions.value.find((region) => String(region.id) === id)?.name).filter(Boolean)
  return names.length ? names.join('、') : (record && record.city) || '线上/全国'
}

function inferRegionIds(record) {
  if (Array.isArray(record && record.regionIds)) return record.regionIds.map(String)
  const city = String((record && record.city) || '')
  return regions.value.filter((region) => city.split(/[、,，/]/).includes(region.name)).map((region) => String(region.id))
}
const managerOptions = computed(() =>
  managers.value.filter((m) => m.status !== 3).map((m) => ({ label: `${m.shopName || m.name}（${m.name}）`, value: String(m.id) }))
)
const activityPublisherOptions = computed(() => [
  { label: '岁悦里平台', value: 'platform' },
  ...managerOptions.value
])
const activityPublisherName = (record) => {
  if (record.publisherType === 'platform' || !record.managerId) return '岁悦里平台'
  const manager = managers.value.find((item) => String(item.id) === String(record.managerId))
  return manager ? (manager.shopName || manager.name) : `商家 ${record.managerId}`
}
const selectedMerchant = computed(() => managers.value.find((m) => String(m.id) === String(selectedMerchantId.value)) || null)
const customerOptions = computed(() =>
  customers.value.map((c) => ({
    label: `${c.name}（${c.phone || '无手机号'}）`,
    value: String(c.id)
  }))
)
const managerCandidateOptions = computed(() => {
  const linked = new Set(managers.value.map((manager) => String(manager.userId || '')).filter(Boolean))
  return customerOptions.value.filter((option) => !linked.has(String(option.value)))
})
const couponTypeOptions = Object.keys(couponTypes).map((k) => ({
  label: couponTypes[k],
  value: Number(k)
}))
const orderStatusOptions = orderStatuses.map((s) => ({ label: s, value: s }))
const scopeCategoryOptions = computed(() => [
  { label: '无', value: null },
  ...categoryOptions.value
])

function catName(id) {
  const c = categories.value[String(id)] || categories.value[id]
  return c ? c.name : '未知'
}

function hasPermission(permission) {
  const account = currentAdmin.value
  return Boolean(account && (account.role === 'super_admin' || account.permissions?.includes('*') || account.permissions?.includes(permission)))
}

const visibleNav = computed(() => nav.filter((item) => hasPermission(item.permission)))
const pageTitle = computed(() => nav.find((n) => n.key === view.value)?.name || '')
const notificationCount = computed(() => notifications.value.length)

const statItems = computed(() => {
  if (!stats.value) return []
  const s = stats.value
  return [
    { label: '活动数', value: s.activityCount, target: 'activities' },
    { label: '订单数', value: s.orderCount, target: 'orders' },
    { label: '客户数', value: s.customerCount, target: 'customers' },
    { label: '主理人数', value: s.managerCount, target: 'managers' },
    { label: '待审核申请', value: s.pendingApply, target: 'applications' },
    { label: '待审核提现', value: s.pendingWithdraw, target: 'withdraws' },
    { label: '待发货订单', value: s.pendingShipCount, target: 'orders', orderStatus: '待发货' },
    { label: '待签到/核销', value: s.pendingCheckinCount, target: 'orders' },
    { label: '待审退款', value: s.pendingRefundCount, target: 'orders', orderStatus: '退款中' },
    { label: '待审核提现金额', value: s.pendingWithdrawAmount, prefix: '¥', precision: 2, target: 'withdraws' },
    { label: '有效营收', value: s.totalRevenue, prefix: '¥', precision: 2, target: 'orders' },
    { label: '累计佣金', value: s.totalCommission, prefix: '¥', precision: 2, target: 'commissions' },
    { label: '待结算佣金', value: s.pendingCommission, prefix: '¥', precision: 2, target: 'commissions' },
    { label: '可结算佣金', value: s.availableCommission, prefix: '¥', precision: 2, target: 'commissions' },
    { label: '已打款佣金', value: s.withdrawnCommission, prefix: '¥', precision: 2, target: 'commissions' }
  ]
})

const customerOrderColumns = [
  { title: '订单号', dataIndex: 'id', width: 155 },
  { title: '商品/活动/课程', dataIndex: 'title', ellipsis: true, tooltip: true },
  { title: '数量', dataIndex: 'count', align: 'right', width: 75 },
  { title: '实付', slotName: 'amount', align: 'right', width: 100 },
  { title: '状态', slotName: 'status', width: 95 },
  { title: '消费归属主理人', slotName: 'manager', width: 140 },
  { title: '下单时间', dataIndex: 'createdAt', width: 165 }
]
const attendanceColumns = [
  { title: '日期', dataIndex: 'date', width: 110 },
  { title: '课程/课次', dataIndex: 'lesson', ellipsis: true, tooltip: true },
  { title: '签到时间', dataIndex: 'checkedAt', width: 165 },
  { title: '签到地址', dataIndex: 'location', width: 240, ellipsis: true, tooltip: true },
  { title: '方式', slotName: 'type', width: 100 },
  { title: '状态', slotName: 'status', width: 90 }
]
const memberTypeOptions = ['普通会员', '银卡会员', '金卡会员', '铂金会员', '钻石会员'].map((value) => ({ label: value, value }))
const couponRecordColumns = [
  { title: '会员', dataIndex: 'userName', width: 110 },
  { title: '手机号', dataIndex: 'userPhone', width: 125 },
  { title: '会员券编号', dataIndex: 'id', width: 190, ellipsis: true, tooltip: true },
  { title: '领取时间', dataIndex: 'claimedAt', width: 165 },
  { title: '状态', dataIndex: 'statusLabel', width: 90 },
  { title: '使用时间', dataIndex: 'usedAt', width: 165 },
  { title: '关联订单', dataIndex: 'orderId', width: 165, ellipsis: true, tooltip: true }
]
const managerFinanceColumns = [
  { title: '佣金单', dataIndex: 'id', width: 155, ellipsis: true, tooltip: true },
  { title: '订单号', dataIndex: 'orderId', width: 150, ellipsis: true, tooltip: true },
  { title: '客户', dataIndex: 'customerName', width: 100 },
  { title: '商品/活动', dataIndex: 'productName', ellipsis: true, tooltip: true },
  { title: '原价', slotName: 'originalAmount', align: 'right', width: 95 },
  { title: '优惠价', slotName: 'discountedAmount', align: 'right', width: 95 },
  { title: '实际支付', slotName: 'actualPaidAmount', align: 'right', width: 100 },
  { title: '比例', slotName: 'rate', align: 'right', width: 70 },
  { title: '佣金金额', slotName: 'amount', align: 'right', width: 105 },
  { title: '状态', slotName: 'status', width: 100 },
  { title: '创建时间', dataIndex: 'createTime', width: 150 },
  { title: '结算时间', dataIndex: 'settleTime', width: 150 }
]
const managerFinanceWithdrawColumns = [
  { title: '提现单', dataIndex: 'id', width: 150, ellipsis: true, tooltip: true },
  { title: '申请金额', slotName: 'amount', align: 'right', width: 100 },
  { title: '税费', slotName: 'tax', align: 'right', width: 90 },
  { title: '实际到账', slotName: 'actual', align: 'right', width: 105 },
  { title: '状态', slotName: 'status', width: 90 },
  { title: '申请时间', dataIndex: 'applyTime', width: 150 },
  { title: '打款时间', dataIndex: 'payTime', width: 150 }
]
const settlementColumns = [
  { title: '结算单', dataIndex: 'id', width: 150 },
  { title: '主理人', dataIndex: 'managerName', width: 120 },
  { title: '笔数', dataIndex: 'count', align: 'right', width: 80 },
  { title: '金额', slotName: 'amount', align: 'right', width: 120 },
  { title: '结算时间', dataIndex: 'settledAt', width: 160 }
]
async function load() {
  loading.value = true
  error.value = ''
  try {
    categories.value = await api.get('/categories')
    regions.value = await api.get('/regions')
    if (view.value === 'dashboard') stats.value = await api.get('/stats/dashboard')
    if (['activities', 'products', 'lives'].includes(view.value) && managers.value.length === 0) managers.value = await api.get('/managers')
    if (view.value === 'activities') activities.value = await api.get('/activities')
    if (view.value === 'products') products.value = await api.get('/products')
    if (view.value === 'pointsMall') {
      pointProducts.value = await api.get('/point-products')
      pointOrders.value = await api.get('/point-orders')
    }
    if (view.value === 'lives') lives.value = await api.get('/lives')
    if (view.value === 'orders') orders.value = await api.get('/orders')
    if (view.value === 'logistics') {
      const [exceptions, provider] = await Promise.all([api.get('/logistics/exceptions'), api.get('/logistics/config')])
      logisticsExceptions.value = exceptions
      logisticsConfig.value = provider
    }
    if (view.value === 'verify') customers.value = await api.get('/customers')
    if (view.value === 'customers') {
      customers.value = await api.get('/customers')
      bindings.value = await api.get('/bindings')
      if (managers.value.length === 0) managers.value = await api.get('/managers')
    }
    if (view.value === 'coupons') {
      coupons.value = await api.get('/coupons')
      if (managers.value.length === 0) managers.value = await api.get('/managers')
    }
    if (view.value === 'reviews') {
      reviews.value = await api.get('/reviews')
      if (activities.value.length === 0) activities.value = await api.get('/activities')
    }
    if (view.value === 'banners') banners.value = await api.get('/banners')
    if (view.value === 'content') contentPosts.value = await api.get('/content-posts')
    if (view.value === 'applications') applications.value = await api.get('/manager-applications')
    if (view.value === 'providers') providerApplications.value = await api.get('/provider-applications')
    if (view.value === 'managers') {
      managers.value = await api.get('/managers')
      if (customers.value.length === 0) customers.value = await api.get('/customers')
    }
    if (view.value === 'bindings') {
      customers.value = await api.get('/customers')
      bindings.value = await api.get('/bindings')
      unbindApplications.value = await api.get('/unbind-applications')
    }
    if (view.value === 'commissions') {
      commissions.value = await api.get('/commissions')
      settlementRecords.value = await api.get('/commission-settlements')
      if (managers.value.length === 0) managers.value = await api.get('/managers')
    }
    if (view.value === 'withdraws') {
      withdraws.value = await api.get('/withdraws')
      if (managers.value.length === 0) managers.value = await api.get('/managers')
    }
    if (view.value === 'logs') logs.value = await api.get('/logs')
    if (view.value === 'merchants') {
      const [merchants, options] = await Promise.all([
        api.get('/admin/merchant-accounts'),
        api.get('/admin/permission-options')
      ])
      merchantAccounts.value = merchants
      permissionOptions.value = options
    }
    if (view.value === 'permissions') {
      const [accounts, merchants, options] = await Promise.all([
        api.get('/admin/accounts'),
        api.get('/admin/merchant-accounts'),
        api.get('/admin/permission-options')
      ])
      adminAccounts.value = accounts
      merchantAccounts.value = merchants
      permissionOptions.value = options
    }
    if (view.value === 'config') {
      const [loadedConfig, loadedCategories] = await Promise.all([api.get('/config'), api.get('/categories')])
      categories.value = loadedCategories || {}
      const defaults = defaultConfig()
      const mergedBrand = { ...defaults.brand, ...(loadedConfig.brand || {}) }
      const mergedAssistant = { ...defaults.assistant, ...(loadedConfig.assistant || {}) }
      const mergedHomeAssistant = { ...defaults.homeAssistant, ...(loadedConfig.homeAssistant || {}) }
      config.value = {
        ...defaults,
        ...loadedConfig,
        brand: mergedBrand,
        copy: copyForEditor({ ...defaults.copy, ...(loadedConfig.copy || {}) }, mergedBrand.chineseName),
        assistant: mergedAssistant,
        homeAssistant: {
          ...mergedHomeAssistant,
          wechatNote: wechatNoteForEditor(mergedHomeAssistant.wechatNote, mergedAssistant.wechat)
        },
        homeDisplay: { ...defaults.homeDisplay, ...(loadedConfig.homeDisplay || {}) },
        socialQrs: { ...defaults.socialQrs, ...(loadedConfig.socialQrs || {}) },
        filing: { ...defaults.filing, ...(loadedConfig.filing || {}) }
      }
      configBrandOriginal.value = mergedBrand.chineseName
      configWechatOriginal.value = mergedAssistant.wechat
      if (!config.value.assistant) {
        config.value.assistant = { name: '小助理', wechat: 'suiyueli6070', phone: '400-800-6070', avatar: '🧑‍💼', intro: '' }
      }
      if (!config.value.filing) {
        config.value.filing = { companyName: '', icp: '', police: '' }
      }
      if (config.value.withdrawTaxRate === undefined) {
        config.value.withdrawTaxRate = 20
      }
      if (config.value.managerApplyFee === undefined) {
        config.value.managerApplyFee = 0
      }
      if (!config.value.brand) {
        config.value.brand = { englishName: 'SUI YUE LI', slogan: '和同龄人一起，玩得开心又省心' }
      } else if (config.value.brand.englishName === undefined) {
        config.value.brand.englishName = 'SUI YUE LI'
      }
      if (!config.value.homeAssistant) {
        config.value.homeAssistant = {
          title: '小助理服务',
          qrImage: '',
          tip: '长按二维码，添加小助理微信',
          wechatNote: '微信号：{wechat}（长按识别或保存二维码）'
        }
      }
      if (!config.value.socialQrs) {
        config.value.socialQrs = { officialAccount: '', videoChannel: '' }
      }
      if (!config.value.couponRefundReturn) {
        config.value.couponRefundReturn = 'auto'
      }
      if (config.value.refundNeedAudit === undefined) {
        config.value.refundNeedAudit = true
      }
    }
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function loadNotifications(silent = false) {
  if (!hasPermission('dashboard.view')) return
  if (!silent) notificationLoading.value = true
  try {
    const result = await api.get('/admin/notifications')
    notifications.value = Array.isArray(result?.items) ? result.items : []
  } catch (e) {
    if (!silent) Message.error(e.message || '消息通知加载失败')
  } finally {
    if (!silent) notificationLoading.value = false
  }
}

function openNotification(item) {
  notificationOpen.value = false
  switchView(item.target)
}

function switchView(key) {
  view.value = key
  const url = new URL(window.location.href)
  url.searchParams.set('view', key)
  window.history.replaceState({}, '', url)
  kw.value = ''
  orderStatusFilter.value = '全部'
  merchantStatusFilter.value = 'all'
  load()
}

function openStatItem(item) {
  switchView(item.target)
  if (item.orderStatus) orderStatusFilter.value = item.orderStatus
}

async function handleLogin() {
  if (!loginUsername.value.trim() || !loginPassword.value) {
    loginError.value = '请输入账号和密码'
    return
  }
  loginLoading.value = true
  loginError.value = ''
  try {
    const result = await api.login(loginUsername.value.trim(), loginPassword.value)
    if (result && result.token) {
      setToken(result.token)
      setAccount(result.account)
      currentAdmin.value = result.account
      authed.value = true
      loginPassword.value = ''
      if (!hasPermission(nav.find((item) => item.key === view.value)?.permission)) view.value = visibleNav.value[0]?.key || 'dashboard'
      await Promise.all([load(), loadNotifications()])
    } else {
      loginError.value = '登录失败，请稍后重试'
    }
  } catch (e) {
    loginError.value = e.message || '登录失败'
  } finally {
    loginLoading.value = false
  }
}

function handleLogout() {
  clearToken()
  authed.value = false
  currentAdmin.value = null
  view.value = 'dashboard'
  notifications.value = []
}

function handleAuthExpired() {
  handleLogout()
  loginError.value = '登录已失效，请重新登录'
}

function permissionNames(keys, type = 'admin') {
  if (keys?.includes('*')) return '全部权限'
  const options = permissionOptions.value[type] || []
  return (keys || []).map((key) => options.find((item) => item.key === key)?.name || key).join('、') || '未分配'
}

function openAdminAccount(account = null) {
  adminAccountForm.value = account
    ? { ...account, permissions: [...(account.permissions || [])], password: '' }
    : { username: '', name: '', password: '', role: 'staff', permissions: [], status: 1 }
}

function saveAdminAccount() {
  const form = adminAccountForm.value
  if (!form) return
  if (!form.id && String(form.password || '').length < 8) return Message.warning('初始密码至少8位')
  doAction(async () => {
    if (form.id) await api.put(`/admin/accounts/${form.id}`, form)
    else await api.post('/admin/accounts', form)
    adminAccountForm.value = null
  }, form.id ? '后台账号已更新' : '员工账号已新增')
}

function openMerchantPermission(account) {
  merchantPermissionForm.value = { ...account, permissions: [...(account.permissions || [])] }
}

function saveMerchantPermission() {
  const form = merchantPermissionForm.value
  doAction(async () => {
    await api.put(`/admin/merchant-accounts/${form.id}`, { status: form.status, permissions: form.permissions })
    merchantPermissionForm.value = null
  }, '商户发布权限已更新')
}

function openPasswordReset(type, account) {
  passwordForm.value = { type, id: account.id, username: account.username, newPassword: '' }
}

function submitPasswordReset() {
  const form = passwordForm.value
  if (String(form?.newPassword || '').length < 8) return Message.warning('新密码至少8位')
  const path = form.type === 'merchant'
    ? `/admin/merchant-accounts/${form.id}/password`
    : `/admin/accounts/${form.id}/password`
  doAction(async () => {
    await api.put(path, { newPassword: form.newPassword })
    passwordForm.value = null
  }, '密码已重置')
}

function submitSelfPassword() {
  const form = selfPasswordForm.value
  if (!form?.oldPassword) return Message.warning('请输入原密码')
  if (String(form.newPassword || '').length < 8) return Message.warning('新密码至少8位')
  if (form.newPassword !== form.confirmPassword) return Message.warning('两次输入的新密码不一致')
  doAction(async () => {
    await api.put('/admin/password', form)
    selfPasswordForm.value = null
  }, '登录密码已修改')
}

onMounted(async () => {
  window.addEventListener('suiyueli:admin-auth-expired', handleAuthExpired)
  if (!authed.value) return
  try {
    const account = await api.get('/admin/me')
    currentAdmin.value = account
    setAccount(account)
    if (!hasPermission(nav.find((item) => item.key === view.value)?.permission)) view.value = visibleNav.value[0]?.key || 'dashboard'
  } catch {
    handleLogout()
    return
  }
  await Promise.all([load(), loadNotifications()])
  notificationTimer = setInterval(() => loadNotifications(true), 30000)
})

onBeforeUnmount(() => {
  window.removeEventListener('suiyueli:admin-auth-expired', handleAuthExpired)
  if (notificationTimer) clearInterval(notificationTimer)
  notificationTimer = null
})

async function doAction(fn, successMsg) {
  error.value = ''
  try {
    await fn()
    await load()
    await loadNotifications(true)
    if (successMsg) Message.success(successMsg)
  } catch (e) {
    error.value = e.message
    Message.error(e.message)
  }
}

function confirmDanger(content, action) {
  Modal.confirm({
    title: '二次确认',
    content,
    okText: '确定',
    cancelText: '取消',
    okButtonProps: { status: 'danger' },
    onOk: () => action()
  })
}

const reasonModal = ref({ visible: false, title: '', placeholder: '' })
const reasonValue = ref('')
let reasonOk = null

function askReason(title, placeholder, onOk, okText = '确定') {
  reasonValue.value = ''
  reasonOk = onOk
  reasonModal.value = { visible: true, title, placeholder, okText }
}

function closeReason() {
  reasonModal.value.visible = false
  reasonOk = null
}

function submitReason() {
  const cb = reasonOk
  const val = reasonValue.value.trim()
  if (!val) return Message.warning('请填写原因后再提交')
  closeReason()
  if (cb) cb(val)
}

const filteredOrders = computed(() => {
  const k = kw.value.trim()
  return orders.value.filter((o) => {
    const okStatus = orderStatusFilter.value === '全部' || o.status === orderStatusFilter.value
    const okKey = fuzzyMatch(`${o.id} ${o.title} ${o.participants} ${orderAddressText(o)} ${o.carrier || ''} ${o.trackingNo || ''}`, k)
    return okStatus && okKey
  })
})
const orderExportRows = computed(() => filteredOrders.value.map((o) => ({
  订单号: o.id,
  会员ID: o.userId,
  报名人: o.participants || '',
  标题: o.title || '',
  规格: o.skuName || '',
  收件人: (o.address && o.address.name) || '',
  收件电话: (o.address && o.address.phone) || '',
  收货地址: orderAddressText(o),
  实付: o.payAmount,
  状态: o.status,
  履约方式: ({ checkin: '现场签到', verify_code: '到店核销', online: '线上使用', delivery: '物流配送' })[o.serviceMode] || '',
  签到核销时间: o.checkedAt || o.verifiedAt || '',
  快递公司: o.carrier || '',
  快递单号: o.trackingNo || '',
  发货时间: o.shipTime || '',
  下单时间: o.createdAt || '',
  主理人: o.managerId || ''
})))
const pendingShipOrders = computed(() => orders.value.filter((o) => o.status === '待发货').length)
const pendingCheckinOrders = computed(() => orders.value.filter((o) => ['待签到', '待核销'].includes(o.status)).length)
const filteredCustomers = computed(() => {
  const k = kw.value.trim()
  return customers.value.filter((c) => fuzzyMatch(`${c.id} ${c.name} ${c.phone} ${c.idCard || ''} ${c.memberId || ''}`, k))
})
const filteredCommissions = computed(() => {
  const k = kw.value.trim()
  return commissions.value.filter((c) => {
    const okManager = !commissionManagerId.value || String(c.managerId) === String(commissionManagerId.value)
    const manager = managers.value.find((item) => String(item.id) === String(c.managerId))
    const managerText = manager ? `${manager.name || ''} ${manager.phone || ''} ${manager.inviteCode || ''}` : String(c.managerId || '')
    return okManager && fuzzyMatch(`${c.id} ${c.orderId || ''} ${managerText} ${c.customerName} ${c.productName} ${c.status} ${c.createTime || ''}`, k)
  })
})
const filteredWithdraws = computed(() => {
  const k = kw.value.trim()
  const [from, to] = withdrawDateRange.value || []
  return withdraws.value.filter((withdraw) => {
    const manager = managers.value.find((item) => String(item.id) === String(withdraw.managerId))
    const managerText = manager
      ? `${manager.name || ''} ${manager.phone || ''} ${manager.inviteCode || ''}`
      : `${withdraw.managerName || ''} ${withdraw.managerId || ''}`
    const applyDate = String(withdraw.applyTime || '').slice(0, 10)
    const matchesStatus = !withdrawStatusFilter.value || withdraw.status === withdrawStatusFilter.value
    const matchesDate = (!from || applyDate >= from) && (!to || applyDate <= to)
    const matchesKey = fuzzyMatch(`${withdraw.id} ${managerText} ${withdraw.status || ''} ${withdraw.applyTime || ''} ${withdraw.payTime || ''} ${withdraw.payChannel || ''} ${withdraw.payOrderNo || ''} ${withdraw.financeRemark || ''} ${withdraw.outBillNo || ''} ${withdraw.transferBillNo || ''} ${transferStateText(withdraw.transferState)} ${withdraw.transferFailReasonText || ''}`, k)
    return matchesStatus && matchesDate && matchesKey
  })
})
const withdrawExportRows = computed(() => filteredWithdraws.value.map((withdraw) => {
  const manager = managers.value.find((item) => String(item.id) === String(withdraw.managerId)) || {}
  return {
    提现单号: withdraw.id,
    主理人ID: withdraw.managerId,
    主理人: manager.name || withdraw.managerName || '',
    手机号: manager.phone || '',
    申请金额: Number(withdraw.amount || 0),
    税率: `${Number(withdraw.taxRate || 0)}%`,
    税费: Number(withdraw.tax || 0),
    实际到账: Number(withdraw.actualAmount ?? withdraw.amount ?? 0),
    锁定佣金笔数: Number(withdraw.commissionCount || 0),
    退款扣减: Number(withdraw.clawbackAmount || 0),
    状态: withdraw.status || '',
    打款方式: withdraw.payMethod === 'wechat' ? '微信零钱商家转账' : '人工打款',
    转账状态: transferStateText(withdraw.transferState),
    微信转账单号: withdraw.transferBillNo || '',
    微信商户单号: withdraw.outBillNo || '',
    转账失败原因: withdraw.transferFailReasonText || withdraw.transferFailReason || '',
    申请时间: withdraw.applyTime || '',
    打款时间: withdraw.payTime || '',
    支付渠道: withdraw.payChannel || '',
    打款流水号: withdraw.payOrderNo || '',
    财务备注: withdraw.financeRemark || '',
    拒绝原因: withdraw.rejectReason || ''
  }
}))
const withdrawAuditTax = computed(() => {
  const amount = Number(withdrawDetail.value?.withdraw?.amount || 0)
  return amount * Number(withdrawAuditForm.value?.taxRate || 0) / 100
})
const withdrawAuditActual = computed(() => Number(withdrawDetail.value?.withdraw?.amount || 0) - withdrawAuditTax.value)
const managerFinanceCommissions = computed(() => {
  const rows = managerFinanceDetail.value?.commissions || []
  return managerFinanceStatus.value ? rows.filter((row) => row.status === managerFinanceStatus.value) : rows
})
const commissionManagerOptions = computed(() =>
  managers.value.map((m) => ({ label: `${m.name}（可结算 ¥${m.available ?? 0}）`, value: String(m.id) }))
)

function parseScheduleTime(value) {
  const text = String(value || '').trim()
  const matched = text.match(/^(\d{1,2}:\d{2})\s*[-—~至]\s*(\d{1,2}:\d{2})$/)
  return matched ? { startTime: matched[1], endTime: matched[2], originalTime: '' } : { startTime: '', endTime: '', originalTime: text }
}

function scheduleEditorRow(schedule = {}) {
  const parsed = parseScheduleTime(schedule.time)
  return {
    ...schedule,
    full: String(schedule.full || ''),
    startTime: parsed.startTime,
    endTime: parsed.endTime,
    originalTime: parsed.originalTime,
    totalQuota: Number(schedule.totalQuota ?? activityForm.value?.maxGroup ?? 0),
    soldQuota: Number(schedule.soldQuota || 0)
  }
}

function localTodayKey() {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function disablePastActivityDate(current) {
  const value = current instanceof Date ? current : new Date(current)
  if (Number.isNaN(value.getTime())) return false
  value.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return value.getTime() < today.getTime()
}

function addActivitySchedule() {
  activitySchedules.value.push(scheduleEditorRow({ totalQuota: activityForm.value?.maxGroup || 0 }))
}

function removeActivitySchedule(index) {
  activitySchedules.value.splice(index, 1)
}

function scheduleDateText(full) {
  const matched = String(full || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return matched ? `${Number(matched[2])}月${Number(matched[3])}日` : ''
}

function scheduleWeekday(full) {
  const date = new Date(`${full}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  return `周${['日', '一', '二', '三', '四', '五', '六'][date.getDay()]}`
}

function serializeActivitySchedules() {
  const today = localTodayKey()
  return activitySchedules.value.map((schedule, index) => {
    const full = String(schedule.full || '').trim()
    const startTime = String(schedule.startTime || '').trim()
    const endTime = String(schedule.endTime || '').trim()
    const time = startTime && endTime ? `${startTime}-${endTime}` : String(schedule.originalTime || '').trim()
    if (!full || !time || (!!startTime !== !!endTime)) throw new Error(`请完整填写第 ${index + 1} 个场次的日期和时间`)
    if (full < today) throw new Error(`第 ${index + 1} 个场次只能选择今天或未来日期`)
    const totalQuota = Math.max(0, Number(schedule.totalQuota || 0))
    const soldQuota = Math.max(0, Number(schedule.soldQuota || 0))
    return {
      ...schedule,
      id: schedule.id || `schedule-${Date.now()}-${index + 1}`,
      full,
      date: scheduleDateText(full),
      weekday: scheduleWeekday(full),
      time,
      totalQuota,
      soldQuota,
      remaining: Math.max(0, totalQuota - soldQuota),
      startTime: undefined,
      endTime: undefined,
      originalTime: undefined
    }
  })
}

function openActivity(a) {
  const platformPublisher = activityPublisherId.value === 'platform'
  activityForm.value = a
    ? { ...a, publisherType: a.publisherType || (a.managerId ? 'merchant' : 'platform'), regionIds: inferRegionIds(a), sellType: a.sellType || 'date', serviceMode: a.serviceMode || (a.category === 5 ? 'delivery' : (a.city === '线上' || a.address === '线上直播') ? 'online' : 'checkin'), serviceDescription: a.serviceDescription || '' }
    : { title: '', coverImage: '', publisherType: platformPublisher ? 'platform' : 'merchant', managerId: platformPublisher ? null : Number(activityPublisherId.value), category: activityCategoryFilter.value === 'all' ? 1 : Number(activityCategoryFilter.value), city: '线上/全国', regionIds: [], address: '', price: 0.01, memberPrice: 0.01, originalPrice: 0, minGroup: 0, maxGroup: 40, soldCount: 0, soldCountMode: 'actual', manualSoldCount: 0, highlight: '', time: '', managerCommissionRate: null, status: 1, sellType: 'date', serviceMode: 'checkin', serviceDescription: '', hasSku: false, skuLabel: '', schedules: [], skus: [], points: [], detail: '' }
  activitySchedules.value = Array.isArray(a && a.schedules) ? a.schedules.map(scheduleEditorRow) : []
  activitySkus.value = Array.isArray(a && a.skus) ? a.skus.map((sku) => ({ ...sku })) : []
  activityDetailBlocks.value = Array.isArray(a && a.detailBlocks) && a.detailBlocks.length
    ? a.detailBlocks.map((block) => ({ ...block }))
    : [{ type: 'text', text: (a && a.detail) || '' }]
  const refundRule = (a && a.refundRule) || { type: 'day', fullDays: 2, partialDays: 0, partialRate: 0 }
  activityForm.value.refundRule = {
    ...refundRule,
    partialRatePercent: Math.round(Number(refundRule.partialRate || 0) * 100)
  }
  activityRefundLadder.value = (refundRule.ladder || []).map((item) => ({
    days: Number(item.days || 0),
    ratePercent: Math.round(Number(item.rate || 0) * 100)
  }))
}

function addRefundLadderRow() {
  activityRefundLadder.value.push({ days: 0, ratePercent: 0 })
}

function removeRefundLadderRow(index) {
  activityRefundLadder.value.splice(index, 1)
}

function addActivitySku() {
  activitySkus.value.push({ id: `sku-${Date.now()}`, name: '', price: 0.01, memberPrice: 0.01, stock: 0, address: '', district: '', hot: false })
}

function removeActivitySku(index) {
  activitySkus.value.splice(index, 1)
}

function addActivityDetailBlock(type) {
  const block = type === 'text'
    ? { type: 'text', text: '' }
    : type === 'image'
      ? { type: 'image', src: '', caption: '' }
      : { type: 'video', url: '', caption: '' }
  activityDetailBlocks.value.push(block)
}

function removeActivityDetailBlock(index) {
  activityDetailBlocks.value.splice(index, 1)
}

function moveActivityDetailBlock(index, direction) {
  const target = index + direction
  if (target < 0 || target >= activityDetailBlocks.value.length) return
  const blocks = activityDetailBlocks.value.slice()
  const [block] = blocks.splice(index, 1)
  blocks.splice(target, 0, block)
  activityDetailBlocks.value = blocks
}

function saveActivity() {
  const form = { ...activityForm.value }
  form.title = String(form.title || '').trim()
  if (!form.title) {
    Message.error('请填写活动标题')
    scrollEditorSection('activity', 'basic')
    return
  }
  if (!isPaidPrice(form.memberPrice) || !isPaidPrice(form.price)) {
    Message.error('会员价和非会员价最低为0.01元，不能为0元')
    scrollEditorSection('activity', 'sales')
    return
  }
  if (form.publisherType === 'merchant' && !form.managerId) {
    Message.error('请先选择商家')
    scrollEditorSection('activity', 'basic')
    return
  }
  if (form.sellType === 'date' && !activitySchedules.value.length) {
    Message.error('请至少添加一个预约场次')
    scrollEditorSection('activity', 'fulfillment')
    return
  }
  if (form.sellType === 'sku' && !activitySkus.value.length) {
    Message.error('请至少添加一个活动规格')
    scrollEditorSection('activity', 'fulfillment')
    return
  }
  if (activitySkus.value.some((sku) => !String(sku.name || '').trim())) {
    Message.error('请补全活动规格名称，或删除空白规格')
    scrollEditorSection('activity', 'fulfillment')
    return
  }
  if (activitySkus.value.some((sku) => !isPaidPrice(sku.memberPrice) || !isPaidPrice(sku.price))) {
    Message.error('每个活动规格的会员价和非会员价最低为0.01元')
    scrollEditorSection('activity', 'fulfillment')
    return
  }
  if (form.publisherType === 'platform') form.managerId = null
  try {
    form.schedules = serializeActivitySchedules()
    form.skus = activitySkus.value
      .map((sku, index) => ({ ...sku, id: sku.id || `sku-${Date.now()}-${index + 1}`, name: String(sku.name || '').trim() }))
      .filter((sku) => sku.name)
  } catch (e) {
    error.value = e.message || '预约场次数据格式错误'
    Message.error(error.value)
    return
  }
  form.hasSku = form.sellType === 'sku' || (Array.isArray(form.skus) && form.skus.length > 0)
  form.detailBlocks = activityDetailBlocks.value
    .map((block) => ({ ...block }))
    .filter((block) => block.type === 'text' ? String(block.text || '').trim() : block.type === 'image' ? block.src : block.url)
  form.detail = form.detailBlocks.filter((block) => block.type === 'text').map((block) => block.text).join('\n\n')
  const refundType = form.refundRule?.type || 'never'
  if (refundType === 'day') {
    form.refundRule = {
      type: 'day',
      fullDays: Number(form.refundRule.fullDays || 0),
      partialDays: Number(form.refundRule.partialDays || 0),
      partialRate: Number(form.refundRule.partialRatePercent || 0) / 100
    }
  } else if (refundType === 'ladder') {
    form.refundRule = {
      type: 'ladder',
      ladder: activityRefundLadder.value
        .map((item) => ({ days: Number(item.days || 0), rate: Number(item.ratePercent || 0) / 100 }))
        .sort((a, b) => b.days - a.days)
    }
  } else {
    form.refundRule = { type: refundType }
  }
  form.regionIds = (form.regionIds || []).map(String)
  form.city = regionNames(form)
  doAction(async () => {
    if (form.id) await api.put(`/activities/${form.id}`, form)
    else await api.post('/activities', form)
    activityForm.value = null
  }, '活动已保存')
}

function removeActivity(id) {
  confirmDanger('确定删除该活动？删除后不可恢复。', () =>
    doAction(() => api.del(`/activities/${id}`), '活动已删除')
  )
}

function openProduct(p) {
  const platformPublisher = productPublisherId.value === 'platform'
  productForm.value = p
    ? { ...p, publisherType: p.publisherType || (p.managerId ? 'merchant' : 'platform'), regionIds: inferRegionIds(p) }
    : { title: '', publisherType: platformPublisher ? 'platform' : 'merchant', managerId: platformPublisher ? null : Number(productPublisherId.value), category: 5, city: '全国', regionIds: [], price: 0.01, memberPrice: 0.01, originalPrice: 0, soldCount: 0, soldCountMode: 'actual', manualSoldCount: 0, stock: 0, highlight: '', points: [], detail: '', cover: '🛍️', coverTone: 'linear-gradient(135deg,#7a5cae,#b39ddb)', sellType: 'sku', hasSku: false, skus: [], status: 1 }
  productSkus.value = Array.isArray(p && p.skus) ? p.skus.map((sku) => ({ ...sku })) : []
  const savedImages = Array.isArray(p && p.images)
    ? p.images.map((image, index) => ({
      id: image?.id || `product-image-${index + 1}`,
      src: typeof image === 'string' ? image : image?.src,
      label: image?.label || ''
    })).filter((image) => image.src)
    : []
  productImages.value = savedImages.length
    ? savedImages.slice(0, 9)
    : (p && p.coverImage ? [{ id: 'product-image-cover', src: p.coverImage, label: '主图' }] : [])
  productDetailBlocks.value = Array.isArray(p && p.detailBlocks) && p.detailBlocks.length
    ? p.detailBlocks.map((block) => ({ ...block }))
    : [{ type: 'text', text: (p && p.detail) || '' }]
  productForm.value.serviceMode = productForm.value.serviceMode || 'delivery'
  productForm.value.serviceDescription = productForm.value.serviceDescription || ''
  const refundRule = productForm.value.refundRule || { type: 'day', fullDays: 7, partialDays: 0, partialRate: 0 }
  productForm.value.refundRule = { ...refundRule, partialRatePercent: Math.round(Number(refundRule.partialRate || 0) * 100) }
  productRefundLadder.value = (refundRule.ladder || []).map((item) => ({ days: Number(item.days || 0), ratePercent: Math.round(Number(item.rate || 0) * 100) }))
}

function addProductSku() {
  productSkus.value.push({ id: `sku-${Date.now()}`, name: '', price: 0.01, memberPrice: 0.01, stock: 0, address: '', district: '', hot: false })
}

function removeProductSku(index) {
  productSkus.value.splice(index, 1)
}

function removeProductImage(index) {
  productImages.value.splice(index, 1)
}

function moveProductImage(index, direction) {
  const target = index + direction
  if (target < 0 || target >= productImages.value.length) return
  const images = productImages.value.slice()
  const [image] = images.splice(index, 1)
  images.splice(target, 0, image)
  productImages.value = images
}

function addProductDetailBlock(type) {
  productDetailBlocks.value.push(type === 'text'
    ? { type: 'text', text: '' }
    : type === 'image'
      ? { type: 'image', src: '', caption: '' }
      : { type: 'video', url: '', caption: '' })
}

function removeProductDetailBlock(index) {
  productDetailBlocks.value.splice(index, 1)
}

function addProductRefundLadderRow() {
  productRefundLadder.value.push({ days: 0, ratePercent: 0 })
}

function removeProductRefundLadderRow(index) {
  productRefundLadder.value.splice(index, 1)
}

function moveProductDetailBlock(index, direction) {
  const target = index + direction
  if (target < 0 || target >= productDetailBlocks.value.length) return
  const blocks = productDetailBlocks.value.slice()
  const [block] = blocks.splice(index, 1)
  blocks.splice(target, 0, block)
  productDetailBlocks.value = blocks
}

function saveProduct() {
  const form = { ...productForm.value }
  form.title = String(form.title || '').trim()
  if (!form.title) {
    Message.error('请填写商品标题')
    scrollEditorSection('product', 'basic')
    return
  }
  if (!isPaidPrice(form.memberPrice) || !isPaidPrice(form.price)) {
    Message.error('会员价和非会员价最低为0.01元，不能为0元')
    scrollEditorSection('product', 'sales')
    return
  }
  if (!productImages.value.length) {
    Message.error('请至少上传一张商品展示图')
    scrollEditorSection('product', 'basic')
    return
  }
  if (form.publisherType === 'merchant' && !form.managerId) {
    Message.error('请先选择商家')
    scrollEditorSection('product', 'basic')
    return
  }
  if (productSkus.value.some((sku) => !String(sku.name || '').trim())) {
    Message.error('请补全商品规格名称，或删除空白规格')
    scrollEditorSection('product', 'variants')
    return
  }
  if (productSkus.value.some((sku) => !isPaidPrice(sku.memberPrice) || !isPaidPrice(sku.price))) {
    Message.error('每个商品规格的会员价和非会员价最低为0.01元')
    scrollEditorSection('product', 'variants')
    return
  }
  if (form.publisherType === 'platform') form.managerId = null
  form.images = productImages.value.slice(0, 9).map((image, index) => ({
    id: image.id || `product-image-${Date.now()}-${index + 1}`,
    src: image.src,
    label: image.label || (index === 0 ? '商品主图' : `商品展示图${index + 1}`)
  }))
  form.coverImage = form.images[0].src
  form.skus = productSkus.value
    .map((sku, index) => ({ ...sku, id: sku.id || `sku-${Date.now()}-${index + 1}`, name: String(sku.name || '').trim() }))
    .filter((sku) => sku.name)
  form.hasSku = Array.isArray(form.skus) && form.skus.length > 0
  form.detailBlocks = productDetailBlocks.value
    .map((block) => ({ ...block }))
    .filter((block) => block.type === 'text' ? String(block.text || '').trim() : block.type === 'image' ? block.src : block.url)
  form.detail = form.detailBlocks.filter((block) => block.type === 'text').map((block) => block.text).join('\n\n')
  const refundType = form.refundRule?.type || 'never'
  if (refundType === 'day') {
    form.refundRule = { type: 'day', fullDays: Number(form.refundRule.fullDays || 0), partialDays: Number(form.refundRule.partialDays || 0), partialRate: Number(form.refundRule.partialRatePercent || 0) / 100 }
  } else if (refundType === 'ladder') {
    form.refundRule = { type: 'ladder', ladder: productRefundLadder.value.map((item) => ({ days: Number(item.days || 0), rate: Number(item.ratePercent || 0) / 100 })).sort((a, b) => b.days - a.days) }
  } else {
    form.refundRule = { type: refundType }
  }
  form.regionIds = (form.regionIds || []).map(String)
  form.city = regionNames(form)
  doAction(async () => {
    if (form.id) await api.put(`/products/${form.id}`, form)
    else await api.post('/products', form)
    productForm.value = null
  }, '商品已保存')
}

function removeProduct(id) {
  confirmDanger('确定删除该商品？删除后不可恢复。', () =>
    doAction(() => api.del(`/products/${id}`), '商品已删除')
  )
}

function openRegion(region) {
  const area = regionArea(region)
  regionForm.value = region
    ? { ...region, ...area }
    : { name: '', provinceCode: '', cityCode: '', districtCode: '', sort: (regions.value.length + 1) * 10, enabled: true }
}

function openPointProduct(product) {
  pointProductForm.value = product
    ? { ...product }
    : { title: '', coverImage: '', description: '', pointsCost: 100, stock: 0, limitPerUser: 1, status: 1 }
}

function savePointProduct() {
  const form = { ...pointProductForm.value }
  if (!String(form.title || '').trim()) {
    Message.warning('请填写商品名称')
    return
  }
  doAction(async () => {
    if (form.id) await api.put(`/point-products/${form.id}`, form)
    else await api.post('/point-products', form)
    pointProductForm.value = null
  }, '积分商品已保存')
}

function removePointProduct(id) {
  confirmDanger('确定删除该积分商品？已有兑换记录的商品请改为下架。', () =>
    doAction(() => api.del(`/point-products/${id}`), '积分商品已删除')
  )
}

function completePointOrder(record) {
  doAction(() => api.put(`/point-orders/${record.id}`, { status: '已完成' }), '兑换单已完成')
}

function openLive(item) {
  if (!item && !selectedMerchantId.value) {
    Message.warning('请先选择商家')
    return
  }
  liveForm.value = item ? { ...JSON.parse(JSON.stringify(item)), lessons: Array.isArray(item.lessons) ? JSON.parse(JSON.stringify(item.lessons)) : [] } : {
    title: '', managerId: Number(selectedMerchantId.value), hostName: '', category: '视频课程',
    status: 'scheduled', startAt: '', endAt: '', streamUrl: '', replayUrl: '', description: '',
    memberPrice: 0.01, originalPrice: 0, lessonCount: 1, lessons: [], duration: '', coverImage: '', activityId: ''
  }
  liveVideoUploading.value = {}
  liveCoverUploading.value = false
}

function chooseLiveCover() {
  liveCoverInput.value?.click()
}

async function uploadLiveCover(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    return Message.error('课程封面仅支持 PNG、JPG 或 WebP 图片')
  }
  if (file.size > 2 * 1024 * 1024) return Message.error('课程封面不能超过 2MB')
  liveCoverUploading.value = true
  try {
    const result = await api.post('/uploads/image', { dataUrl: await fileDataUrl(file), fileName: file.name })
    liveForm.value.coverImage = result.url
    Message.success('课程封面上传成功，保存课程后生效')
  } catch (e) {
    Message.error(e.message || '课程封面上传失败')
  } finally {
    liveCoverUploading.value = false
  }
}

function addLiveLesson() {
  liveForm.value.lessons ||= []
  liveForm.value.lessons.push({ id: `lesson-${Date.now()}`, title: '', duration: '', videoUrl: '', isPreview: false, status: 1 })
}

function moveLiveLesson(index, direction) {
  const target = index + direction
  if (target < 0 || target >= liveForm.value.lessons.length) return
  const rows = [...liveForm.value.lessons]
  ;[rows[index], rows[target]] = [rows[target], rows[index]]
  liveForm.value.lessons = rows
}

function removeLiveLesson(index) {
  liveForm.value.lessons.splice(index, 1)
}

function liveLessonUploadKey(lesson, index) {
  return lesson.id || `lesson-${index}`
}

async function uploadLiveLessonVideo(event, lesson, index) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  const extension = String(file.name || '').split('.').pop().toLowerCase()
  const validType = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v'].includes(file.type)
  if (!validType && !['mp4', 'webm', 'mov', 'm4v'].includes(extension)) return Message.error('课程视频仅支持 MP4、WebM、MOV 或 M4V 格式')
  const key = liveLessonUploadKey(lesson, index)
  liveVideoUploading.value = { ...liveVideoUploading.value, [key]: true }
  try {
    const result = await api.post('/uploads/course-video', { dataUrl: await fileDataUrl(file), fileName: file.name })
    lesson.videoUrl = result.url
    Message.success(`第 ${index + 1} 节视频上传成功，保存课程后生效`)
  } catch (e) {
    Message.error(e.message || '视频上传失败')
  } finally {
    liveVideoUploading.value = { ...liveVideoUploading.value, [key]: false }
  }
}

function saveLive() {
  const form = { ...liveForm.value }
  if (!form.managerId) {
    Message.error('请先选择商家')
    return
  }
  if (!String(form.title || '').trim()) {
    Message.error('请填写课程名称')
    return
  }
  if (!isPaidPrice(form.memberPrice)) {
    Message.error('课程会员价最低为0.01元，不能为0元')
    return
  }
  const invalidLesson = (form.lessons || []).findIndex((lesson) => !String(lesson.title || '').trim())
  if (invalidLesson >= 0) return Message.error(`请填写第 ${invalidLesson + 1} 节标题`)
  form.lessonCount = form.lessons?.length || Number(form.lessonCount || 1)
  doAction(async () => {
    if (form.id) await api.put(`/lives/${form.id}`, form)
    else await api.post('/lives', form)
    liveForm.value = null
  }, '学堂课程已保存')
}

function removeLive(id) {
  confirmDanger('确定删除该课程？删除后不可恢复。', () =>
    doAction(() => api.del(`/lives/${id}`), '课程已删除')
  )
}

function saveRegion() {
  const provinceCode = String(regionForm.value.provinceCode || '')
  const cityCode = String(regionForm.value.cityCode || '')
  const districtCode = String(regionForm.value.districtCode || '')
  if (!provinceCode || !cityCode || !districtCode) {
    Message.error('请选择完整的省、市、区/县')
    return
  }
  const province = areaName(provinceCode)
  const city = areaName(cityCode)
  const district = areaName(districtCode)
  const form = {
    ...regionForm.value,
    province,
    city,
    district,
    provinceCode,
    cityCode,
    districtCode,
    code: districtCode,
    name: district,
    fullName: `${province}${city}${district}`
  }
  doAction(async () => {
    if (form.id) await api.put(`/regions/${form.id}`, form)
    else await api.post('/regions', form)
    regionForm.value = null
  }, '地区已保存')
}

function toggleRegion(region) {
  const enabled = region.enabled === false
  doAction(() => api.put(`/regions/${region.id}`, { enabled }), enabled ? '地区已启用' : '地区已停用')
}

function openContent(post) {
  contentForm.value = post
    ? { ...post, regionIds: inferRegionIds(post) }
    : { type: 'news', title: '', summary: '', source: '', publishedAt: new Date().toISOString().slice(0, 10), coverImage: '', originalUrl: '', videoUrl: '', content: '', regionIds: [], featured: false, status: 1 }
  contentBlocks.value = Array.isArray(post?.contentBlocks) && post.contentBlocks.length
    ? post.contentBlocks.map((block) => ({ ...block }))
    : (String(post?.content || '').trim() ? [{ type: 'text', text: post.content }] : [{ type: 'text', text: '' }])
}

function addContentBlock(type) {
  const block = type === 'text'
    ? { type: 'text', text: '' }
    : type === 'image'
      ? { type: 'image', src: '', caption: '' }
      : type === 'video'
        ? { type: 'video', url: '', caption: '' }
        : { type: 'link', title: '', description: '', url: '' }
  contentBlocks.value.push(block)
}

function removeContentBlock(index) {
  contentBlocks.value.splice(index, 1)
}

function moveContentBlock(index, direction) {
  const target = index + direction
  if (target < 0 || target >= contentBlocks.value.length) return
  const blocks = contentBlocks.value.slice()
  const [block] = blocks.splice(index, 1)
  blocks.splice(target, 0, block)
  contentBlocks.value = blocks
}

function saveContent() {
  const form = { ...contentForm.value, regionIds: (contentForm.value.regionIds || []).map(String) }
  if (!String(form.title || '').trim()) {
    Message.error('请输入标题')
    return
  }
  if (!String(form.coverImage || '').trim()) return Message.error('请上传封面图片')
  form.contentBlocks = contentBlocks.value
    .map((block) => ({ ...block }))
    .filter((block) => block.type === 'text' ? String(block.text || '').trim() : block.type === 'image' ? block.src : block.type === 'video' ? block.url : block.title && block.url)
  form.content = form.contentBlocks.filter((block) => block.type === 'text').map((block) => block.text).join('\n\n')
  doAction(async () => {
    if (form.id) await api.put(`/content-posts/${form.id}`, form)
    else await api.post('/content-posts', form)
    contentForm.value = null
  }, '内容已保存')
}

function removeContent(id) {
  confirmDanger('确定删除这条内容？删除后不可恢复。', () =>
    doAction(() => api.del(`/content-posts/${id}`), '内容已删除')
  )
}

function orderAction(id, action, body) {
  doAction(() => api.post(`/orders/${id}/${action}`, body || {}))
}

function completeOrderFulfillment(record) {
  const isCheckin = record.serviceMode === 'checkin' || record.status === '待签到'
  const actionLabel = isCheckin ? '签到' : '核销'
  Modal.confirm({
    title: `确认${actionLabel}`,
    content: `确认「${record.title}」已完成${actionLabel}？操作后订单将进入待评价。`,
    okText: `确认${actionLabel}`,
    onOk: () => doAction(() => api.post(`/orders/${record.id}/verify`), `${actionLabel}成功`)
  })
}

function openShip(record, update, scope = 'order') {
  shipTarget.value = { ...record, shipmentScope: scope }
  shipForm.value = {
    update: Boolean(update),
    deliveryType: record.deliveryType === 'self' ? 'self' : 'express',
    trackingNo: record.trackingNo || '',
    note: record.shippingNote || ''
  }
}

function closeShip() {
  shipTarget.value = null
}

function submitShip() {
  const target = shipTarget.value
  if (!target) return
  const form = shipForm.value
  if (form.deliveryType === 'express') {
    if (!/^[A-Za-z0-9-]{6,32}$/.test(String(form.trackingNo).trim())) {
      Message.warning('请填写正确的快递单号（6-32位字母/数字）')
      return
    }
  } else if (!String(form.note || '').trim()) {
    Message.warning('请填写线下交付或自提信息')
    return
  }
  doAction(async () => {
    const payload = {
      update: form.update,
      deliveryType: form.deliveryType,
      carrier: form.deliveryType === 'self' ? '无需物流' : '',
      trackingNo: form.deliveryType === 'self' ? '' : String(form.trackingNo).trim(),
      note: String(form.note || '').trim()
    }
    if (target.shipmentScope === 'point') {
      await api.put(`/point-orders/${target.id}`, { ...payload, status: '已发货' })
    } else {
      await api.post(`/orders/${target.id}/ship`, payload)
    }
    closeShip()
  }, form.update ? '物流信息已更新' : '已发货')
}

function refreshLogistics(record) {
  doAction(() => api.post(`/logistics/${record.id}/refresh`), '物流轨迹已刷新')
}

async function queryLogistics() {
  const trackingNo = String(logisticsQueryForm.value.trackingNo || '').trim()
  if (!/^[A-Za-z0-9-]{6,32}$/.test(trackingNo)) return Message.warning('请输入正确的快递单号')
  logisticsQueryLoading.value = true
  logisticsQueryResult.value = null
  try {
    logisticsQueryResult.value = await api.post('/logistics/query', { trackingNo })
  } catch (e) {
    Message.error(e.message || '物流查询失败')
  } finally {
    logisticsQueryLoading.value = false
  }
}

function refundOrder(id) {
  confirmDanger('确认对该订单执行退款？', () =>
    doAction(() => api.post(`/orders/${id}/refund-audit`, { approve: true, reason: '运营退款' }), '已退款')
  )
}

function approveRefund(id) {
  confirmDanger('同意该笔退款申请？同意后将按规则退款并扣回佣金。', () =>
    doAction(() => api.post(`/orders/${id}/refund-audit`, { approve: true, reason: '运营同意退款' }), '已退款')
  )
}

function rejectRefund(record) {
  askReason('拒绝退款申请', '请输入拒绝原因', (reason) =>
    doAction(() => api.post(`/orders/${record.id}/refund-audit`, { approve: false, reason }), '已拒绝退款')
  )
}

async function searchVerify() {
  const digits = verifyCode.value.replace(/\s+/g, '')
  if (!digits) {
    Message.warning('请输入核销码')
    return
  }
  error.value = ''
  verifySearching.value = true
  try {
    verifyOrder.value = await api.get('/orders/code/' + encodeURIComponent(digits))
  } catch (e) {
    verifyOrder.value = null
    Message.error(e.message)
  } finally {
    verifySearching.value = false
  }
}

function confirmVerify() {
  if (!verifyOrder.value) return
  const isCheckin = verifyOrder.value.serviceMode === 'checkin' || verifyOrder.value.status === '待签到'
  const actionLabel = isCheckin ? '签到' : '核销'
  Modal.confirm({
    title: `确认${actionLabel}`,
    content: `确认订单「${verifyOrder.value.title}」已完成${actionLabel}（凭证码 ${verifyOrder.value.code}）？`,
    okText: '确定',
    cancelText: '取消',
    onOk: () => doVerify()
  })
}

async function doVerify() {
  error.value = ''
  try {
    const isCheckin = verifyOrder.value.serviceMode === 'checkin' || verifyOrder.value.status === '待签到'
    verifyOrder.value = await api.post(`/orders/${verifyOrder.value.id}/verify`)
    Message.success(isCheckin ? '签到成功' : '核销成功')
  } catch (e) {
    error.value = e.message
    Message.error(e.message)
  }
}

async function loadCardCustomer(id) {
  const value = id ? String(id) : ''
  cardCustomerId.value = value
  if (!value) {
    cardProfile.value = null
    cardList.value = []
    return
  }
  cardLoading.value = true
  try {
    const profile = await api.get('/users/' + encodeURIComponent(value))
    cardProfile.value = profile
    cardList.value = Array.isArray(profile.cards) ? profile.cards : []
  } catch (e) {
    cardProfile.value = null
    cardList.value = []
    Message.error(e.message)
  } finally {
    cardLoading.value = false
  }
}

function openMakeup(card) {
  const remain = Number(card.remain || 0)
  if (remain <= 0) {
    Message.warning('该计次卡已无剩余次数')
    return
  }
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  makeupTarget.value = card
  makeupForm.value = {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    reason: ''
  }
}

async function submitMakeup() {
  const card = makeupTarget.value
  const form = makeupForm.value
  if (!card) return
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(form.date || ''))) return Message.warning('请填写正确的补签日期')
  if (!String(form.reason || '').trim()) return Message.warning('请填写补签原因')
  error.value = ''
  try {
    const updated = await api.post(`/cards/${card.id}/makeup-checkin`, {
      date: form.date,
      time: form.time,
      reason: String(form.reason).trim(),
      memberName: cardProfile.value?.user?.name || '',
      memberPhone: cardProfile.value?.user?.phone || '',
      operator: '后台管理员'
    })
    const idx = cardList.value.findIndex((c) => String(c.id) === String(card.id))
    if (idx >= 0) cardList.value[idx] = updated
    makeupTarget.value = null
    Message.success('补签成功')
  } catch (e) {
    error.value = e.message
    Message.error(e.message)
  }
}

function openCustomer(c) {
  customerForm.value = { ...c }
}

async function openCustomerDetail(customer, binding = null) {
  customerDetailLoading.value = true
  customerDetailBinding.value = binding
  error.value = ''
  try {
    customerDetail.value = await api.get(`/customers/${customer.id}`)
  } catch (e) {
    customerDetailBinding.value = null
    error.value = e.message
    Message.error(e.message)
  } finally {
    customerDetailLoading.value = false
  }
}

function closeCustomerDetail() {
  customerDetail.value = null
  customerDetailBinding.value = null
}

function saveCustomer() {
  const form = { ...(customerForm.value || {}) }
  delete form.balance
  delete form.points
  doAction(async () => {
    await api.put(`/customers/${form.id}`, form)
    customerForm.value = null
  }, '用户已保存')
}

function openCoupon(c) {
  couponForm.value = c
    ? { ...c, publisherType: c.publisherType === 'merchant' ? 'merchant' : 'platform', managerId: c.managerId == null ? '' : String(c.managerId), status: c.status === 0 ? 0 : 1 }
    : { title: '', desc: '', publisherType: 'platform', managerId: '', type: 1, value: 10, minAmount: 0, scopeCategory: null, scopeProductId: null, expireAt: '2026-12-31', status: 1 }
}

function saveCoupon() {
  const form = { ...couponForm.value }
  if (!String(form.title || '').trim()) return Message.warning('请填写优惠券标题')
  if (form.publisherType === 'merchant' && !form.managerId) return Message.warning('请选择发布商家')
  if (Number(form.value || 0) <= 0) return Message.warning('优惠券面额必须大于0')
  const creating = !form.id
  doAction(async () => {
    if (form.id) await api.put(`/coupons/${form.id}`, form)
    else await api.post('/coupons', form)
    couponForm.value = null
  }, creating ? '优惠券已发布' : '优惠券已保存')
}

function removeCoupon(id) {
  confirmDanger('确定删除该优惠券？', () =>
    doAction(() => api.del(`/coupons/${id}`), '优惠券已删除')
  )
}

async function openCouponRecords(record) {
  couponRecordsTarget.value = record
  couponRecordsLoading.value = true
  try {
    couponRecords.value = await api.get(`/coupons/${record.id}/records`)
  } catch (e) {
    couponRecordsTarget.value = null
    Message.error(e.message)
  } finally {
    couponRecordsLoading.value = false
  }
}

function openCategory(c) {
  categoryForm.value = c
    ? { ...c, homeDisplayLimit: Number(c.homeDisplayLimit ?? 6) }
    : { name: '', short: '', emoji: '📌', color: '#6f747b', type: 'activity', homeDisplayLimit: 6 }
}

function saveCategory() {
  const form = { ...categoryForm.value }
  if (!Number.isInteger(Number(form.homeDisplayLimit)) || Number(form.homeDisplayLimit) < 0 || Number(form.homeDisplayLimit) > 50) {
    return Message.warning('首页显示数量请输入0到50之间的整数')
  }
  form.homeDisplayLimit = Number(form.homeDisplayLimit)
  doAction(async () => {
    if (form.id) await api.put(`/categories/${form.id}`, form)
    else await api.post('/categories', form)
    categoryForm.value = null
  }, '分类已保存')
}

function removeCategory(id) {
  confirmDanger('删除该分类？该分类下的活动会变为「未分类」。', () =>
    doAction(() => api.del(`/categories/${id}`), '分类已删除')
  )
}

function openBanner(b) {
  bannerForm.value = b
    ? { ...b, mediaType: b.mediaType === 'video' ? 'video' : 'image', status: b.status === 0 ? 0 : 1, sort: Number(b.sort || 0) }
    : { title: '', sub: '', mediaType: 'image', mediaUrl: '', linkUrl: '/pages/list/list', status: 1, sort: 0, emoji: '🎁', tone: 'linear-gradient(135deg,#c25e3d,#e19a6d)', cat: 0 }
}

function saveBanner() {
  const form = { ...bannerForm.value }
  if (!String(form.title || '').trim()) return Message.warning('请填写 Banner 标题')
  if (!String(form.mediaUrl || '').trim()) return Message.warning('请上传 Banner 图片或视频')
  doAction(async () => {
    if (form.id) await api.put(`/banners/${form.id}`, form)
    else await api.post('/banners', form)
    bannerForm.value = null
  }, form.id ? 'Banner 已保存' : 'Banner 已发布')
}

function chooseBannerMedia() {
  if (bannerMediaInput.value) bannerMediaInput.value.click()
}

async function uploadBannerMedia(event) {
  const file = event.target.files && event.target.files[0]
  event.target.value = ''
  if (!file) return
  const mediaType = file.type.startsWith('video/') ? 'video' : 'image'
  const imageTypes = ['image/png', 'image/jpeg', 'image/webp']
  const videoTypes = ['video/mp4', 'video/webm']
  if (mediaType === 'image' && !imageTypes.includes(file.type)) return Message.error('图片仅支持 PNG、JPG 或 WebP')
  if (mediaType === 'video' && !videoTypes.includes(file.type)) return Message.error('视频仅支持 MP4 或 WebM')
  const maxSize = mediaType === 'video' ? 15 * 1024 * 1024 : 2 * 1024 * 1024
  if (file.size > maxSize) return Message.error(mediaType === 'video' ? 'Banner 视频不能超过15MB' : 'Banner 图片不能超过2MB')
  bannerMediaUploading.value = true
  try {
    const dataUrl = await fileDataUrl(file)
    const result = await api.post('/banners/upload/media', { dataUrl, mediaType, fileName: file.name })
    bannerForm.value.mediaType = mediaType
    bannerForm.value.mediaUrl = result.url
    Message.success(`${mediaType === 'video' ? '视频' : '图片'}上传成功，发布 Banner 后生效`)
  } catch (e) {
    Message.error(e.message || '媒体上传失败')
  } finally {
    bannerMediaUploading.value = false
  }
}

function removeBanner(id) {
  confirmDanger('确定删除该 Banner？', () =>
    doAction(() => api.del(`/banners/${id}`), 'Banner 已删除')
  )
}

function openManagerReview(record) {
  managerReviewTarget.value = record
  managerRejectMode.value = false
  managerRejectReason.value = ''
  managerApprovalForm.value = {
    name: record.name || '',
    phone: record.phone || '',
    groupCount: Number(record.groupCount ?? 0),
    memberCount: Number(record.memberCount ?? 0),
    fieldsText: (record.fields || []).join('、'),
    intro: record.intro || '',
    feeAmount: Number(record.feeAmount ?? record.paidAmount ?? 0),
    paidAmount: Number(record.paidAmount || 0),
    paymentStatus: record.paymentStatus || (Number(record.paidAmount || 0) > 0 ? '待核对' : '免收费'),
    paymentOrderNo: record.paymentOrderNo || '',
    paidAt: record.paidAt || '',
    paymentMethod: record.paymentMethod || '',
    financeRemark: record.financeRemark || '',
    commissionRate: record.commissionRate ?? ''
  }
}

function closeManagerReview() {
  managerReviewTarget.value = null
  managerApprovalForm.value = null
  managerRejectMode.value = false
  managerRejectReason.value = ''
}

function startManagerReject() {
  managerRejectMode.value = true
  managerRejectReason.value = ''
}

function submitManagerApproval() {
  const target = managerReviewTarget.value
  const form = managerApprovalForm.value
  if (!target || !form) return
  if (!String(form.name || '').trim()) return Message.warning('请填写申请人姓名')
  if (!/^1\d{10}$/.test(String(form.phone || '').replace(/\D/g, ''))) return Message.warning('请填写正确的11位手机号')
  if (Number(form.feeAmount || 0) > 0 && form.paymentStatus !== '已到账') {
    return Message.warning('收费申请必须等待微信支付确认到账后才能通过')
  }
  if (form.paymentStatus === '已到账') {
    if (Number(form.paidAmount || 0) <= 0) return Message.warning('请填写实际到账金额')
    if (!String(form.paymentOrderNo || '').trim() || !String(form.paidAt || '').trim() || !String(form.paymentMethod || '').trim()) {
      return Message.warning('请完整填写支付订单编号、支付时间和支付方式')
    }
  }
  const payload = {
    ...form,
    phone: String(form.phone || '').replace(/\D/g, ''),
    groupCount: Number(form.groupCount || 0),
    memberCount: Number(form.memberCount || 0),
    feeAmount: Number(form.feeAmount || 0),
    paidAmount: Number(form.paidAmount || 0),
    fields: String(form.fieldsText || '').split(/[、,，\n]+/).map((item) => item.trim()).filter(Boolean)
  }
  delete payload.fieldsText
  delete payload.feeAmount
  delete payload.paidAmount
  delete payload.paymentStatus
  delete payload.paymentOrderNo
  delete payload.paidAt
  delete payload.paymentMethod
  doAction(async () => {
    await api.post(`/manager-applications/${target.id}/approve`, payload)
    closeManagerReview()
  }, '主理人申请已通过')
}

function submitManagerReject() {
  const target = managerReviewTarget.value
  const reason = String(managerRejectReason.value || '').trim()
  if (!target) return
  if (!reason) return Message.warning('请填写拒绝原因')
  doAction(async () => {
    await api.post(`/manager-applications/${target.id}/reject`, { reason })
    closeManagerReview()
  }, '主理人申请已拒绝')
}

function approveProvider(record) {
  const phoneSuffix = String(record.phone || '').slice(-6)
  providerApproveTarget.value = record
  providerAccountForm.value = {
    name: record.name || '',
    phone: record.phone || '',
    type: record.type === 'company' ? 'company' : 'personal',
    intro: record.intro || '',
    address: record.address || '',
    shopName: record.shopName || record.name || '',
    contactName: record.contactName || record.name || '',
    contactPhone: record.contactPhone || record.phone || '',
    contactWechat: record.contactWechat || '',
    cooperationMode: record.cooperationMode || '',
    cooperationContent: record.cooperationContent || record.intro || '',
    cooperationStartAt: record.cooperationStartAt || '',
    cooperationEndAt: record.cooperationEndAt || '',
    cooperationRemark: record.cooperationRemark || '',
    username: record.loginUsername || `shop_${phoneSuffix}`,
    password: record.status === '待审核' ? `Syl${phoneSuffix}!` : ''
  }
}

function submitProviderApproval() {
  const target = providerApproveTarget.value
  const form = providerAccountForm.value
  if (!target || !form) return
  if (!String(form.name || '').trim() || !/^1\d{10}$/.test(String(form.phone || '').replace(/\D/g, ''))) return Message.warning('请填写正确的申请人和手机号')
  if (!String(form.intro || '').trim() || !String(form.address || '').trim()) return Message.warning('请填写主营服务和联系地址')
  if (!String(form.shopName || '').trim() || !String(form.contactName || '').trim()) return Message.warning('请填写商户名称和合作联系人')
  if (!/^1\d{10}$/.test(String(form.contactPhone || '').replace(/\D/g, ''))) return Message.warning('请填写正确的合作联系电话')
  if (!String(form.cooperationMode || '').trim() || !String(form.cooperationContent || '').trim()) return Message.warning('请填写合作方式和合作内容')
  doAction(async () => {
    await api.post(`/provider-applications/${target.id}/approve`, {
      ...form,
      phone: String(form.phone || '').replace(/\D/g, ''),
      contactPhone: String(form.contactPhone || '').replace(/\D/g, '')
    })
    providerApproveTarget.value = null
  }, '已通过并开通商户账号')
}

function rejectProvider(id) {
  askReason('拒绝服务商申请', '请输入拒绝原因', (reason) =>
    doAction(async () => {
      await api.post(`/provider-applications/${id}/reject`, { reason })
      providerApproveTarget.value = null
    }, '服务商申请已拒绝'),
  '提交拒绝')
}

function setManagerStatus(id, status) {
  const action = () => doAction(() => api.post(`/managers/${id}/status`, { status }))
  if (status === 3) {
    confirmDanger('确定清退该主理人？清退后不可恢复。', action)
  } else {
    action()
  }
}

function openManagerForm() {
  managerForm.value = {
    userId: '',
    name: '',
    phone: '',
    wechat: '',
    address: '',
    intro: '',
    remark: '',
    inviteCode: '',
    commissionRate: '',
    status: 1
  }
}

function fillManagerCustomer(userId) {
  const customer = customers.value.find((item) => String(item.id) === String(userId))
  if (!customer || !managerForm.value) return
  managerForm.value.name = customer.name || managerForm.value.name
  managerForm.value.phone = customer.phone || managerForm.value.phone
}

function saveManager() {
  const form = { ...managerForm.value }
  if (!String(form.name || '').trim()) return Message.warning('请填写主理人姓名')
  if (!/^1\d{10}$/.test(String(form.phone || '').replace(/\D/g, ''))) return Message.warning('请填写正确的11位手机号')
  form.phone = String(form.phone).replace(/\D/g, '')
  form.userId = form.userId || null
  doAction(async () => {
    await api.post('/managers', form)
    managerForm.value = null
  }, '主理人已新增')
}

async function openManagerFinance(record, status = '') {
  managerFinanceTarget.value = record
  managerFinanceStatus.value = status
  managerFinanceDetail.value = null
  managerFinanceLoading.value = true
  try {
    managerFinanceDetail.value = await api.get(`/managers/${record.id}/finance`)
  } catch (e) {
    managerFinanceTarget.value = null
    Message.error(e.message || '金额明细加载失败')
  } finally {
    managerFinanceLoading.value = false
  }
}

function unbindCustomer(id) {
  askReason('解绑客户', '请输入解绑原因', (reason) =>
    doAction(() => api.post('/bindings/unbind', { customerId: id, reason }), '已解绑')
  )
}

function approveUnbind(id) {
  doAction(() => api.post(`/unbind-applications/${id}/approve`), '已通过')
}

function rejectUnbind(id) {
  askReason('拒绝解绑申请', '请输入拒绝原因', (reason) =>
    doAction(() => api.post(`/unbind-applications/${id}/reject`, { reason }), '已拒绝')
  )
}

function openRebind(c) {
  rebindTarget.value = c
  const currentManagerId = c.currentManagerId || c.managerId
  const target = managers.value.find((manager) => String(manager.id) !== String(currentManagerId) && Number(manager.status) !== 3)
  rebindManagerId.value = target ? String(target.id) : ''
  rebindReason.value = ''
}

function confirmRebind() {
  if (!rebindManagerId.value) return Message.warning('请选择新的主理人')
  if (!String(rebindReason.value || '').trim()) return Message.warning('请填写归属变更原因')
  doAction(async () => {
    await api.post('/bindings/rebind', {
      customerId: rebindTarget.value.id,
      managerId: Number(rebindManagerId.value),
      reason: rebindReason.value.trim()
    })
    rebindTarget.value = null
  }, '归属已变更')
}

function openAdjust(c) {
  adjustTarget.value = c
  adjustAmount.value = String(c.commissionAmount)
  adjustReason.value = ''
}

function confirmAdjust() {
  doAction(async () => {
    await api.post(`/commissions/${adjustTarget.value.id}/adjust`, {
      amount: Number(adjustAmount.value),
      reason: adjustReason.value || '手动调整'
    })
    adjustTarget.value = null
  }, '佣金已调整')
}

function settleAll() {
  confirmDanger('确认把所有待结算佣金转为可结算？', () =>
    doAction(() => api.post('/commissions/settle'), '已转入可结算')
  )
}

function settleByManager() {
  if (!commissionManagerId.value) {
    Message.warning('请先选择要结算的主理人')
    return
  }
  const name = managers.value.find((m) => String(m.id) === String(commissionManagerId.value))?.name || commissionManagerId.value
  confirmDanger(`确认结算「${name}」名下全部待结算佣金？`, () =>
    doAction(() => api.post('/commissions/settle', { managerId: commissionManagerId.value }), '已生成结算单')
  )
}

function settleOne(record) {
  doAction(() => api.post('/commissions/settle', { orderId: record.orderId }), '已按订单结算')
}

async function openWithdrawDetail(record) {
  withdrawDetailTarget.value = record
  withdrawDetail.value = null
  withdrawDetailLoading.value = true
  try {
    withdrawDetail.value = await api.get(`/withdraws/${record.id}`)
    const withdraw = withdrawDetail.value.withdraw
    withdrawAuditForm.value = {
      taxRate: Number(withdraw.taxRate ?? 20),
      payMethod: 'wechat',
      financeRemark: withdraw.financeRemark || ''
    }
  } catch (e) {
    withdrawDetailTarget.value = null
    Message.error(e.message || '提现明细加载失败')
  } finally {
    withdrawDetailLoading.value = false
  }
}

function approveWithdraw() {
  const id = withdrawDetail.value?.withdraw?.id
  const form = withdrawAuditForm.value
  if (!id || !form) return
  if (!withdrawDetail.value?.transfer?.enabled) return Message.warning('服务端未启用微信商家转账，不能审核打款')
  if (withdrawAuditActual.value < 0.1) return Message.warning('扣税后实际到账不足 0.10 元，无法微信转账')
  doAction(async () => {
    await api.post(`/withdraws/${id}/approve`, {
      payMethod: 'wechat',
      taxRate: Number(form.taxRate || 0),
      financeRemark: String(form.financeRemark || '').trim()
    })
    withdrawDetailTarget.value = null
    withdrawDetail.value = null
    withdrawAuditForm.value = null
  }, '已发起微信零钱转账，等待主理人确认收款')
}

async function syncWithdrawTransfer(id) {
  doAction(async () => {
    const record = await api.post(`/withdraws/${id}/transfer/sync`)
    await openWithdrawDetail({ id })
    Message.success(`转账状态：${transferStateText(record.transferState)}`)
  })
}

function cancelWithdrawTransfer(id) {
  Modal.confirm({
    title: '撤销微信转账',
    content: '撤销后主理人将无法确认收款，锁定佣金会在微信确认撤销后释放。确定撤销？',
    okText: '撤销转账',
    cancelText: '取消',
    onOk: () => doAction(async () => {
      await api.post(`/withdraws/${id}/transfer/cancel`)
      await openWithdrawDetail({ id })
    }, '已提交撤销，请稍后查单确认结果')
  })
}

function rejectWithdraw(id) {
  askReason('拒绝提现申请', '请输入拒绝原因', (reason) =>
    doAction(async () => {
      await api.post(`/withdraws/${id}/reject`, { reason })
      withdrawDetailTarget.value = null
      withdrawDetail.value = null
      withdrawAuditForm.value = null
    }, '已拒绝')
  )
}

function removeReview(id) {
  confirmDanger('确定删除该评价？', () =>
    doAction(() => api.del(`/reviews/${id}`), '评价已删除')
  )
}

function toggleReviewVisibility(review) {
  const hidden = !review.hidden
  const text = hidden ? '屏蔽后会员端将不再显示该评价，确定继续？' : '确定恢复展示该评价？'
  Modal.confirm({
    title: hidden ? '屏蔽评价' : '恢复评价',
    content: text,
    okText: hidden ? '确认屏蔽' : '确认恢复',
    cancelText: '取消',
    okButtonProps: hidden ? { status: 'warning' } : {},
    onOk: () => doAction(() => api.put(`/reviews/${review.id}/visibility`, { hidden }), hidden ? '评价已屏蔽' : '评价已恢复')
  })
}

function openReviewReply(review) {
  reviewReplyTarget.value = review
  reviewReplyText.value = review.reply || ''
}

function saveReviewReply() {
  const reply = String(reviewReplyText.value || '').trim()
  if (!reply) return Message.warning('请输入回复内容')
  if (reply.length > 500) return Message.warning('回复内容不能超过500个字符')
  doAction(async () => {
    await api.put(`/reviews/${reviewReplyTarget.value.id}/reply`, { reply })
    reviewReplyTarget.value = null
    reviewReplyText.value = ''
  }, '回复已保存')
}

function removeReviewReply() {
  if (!reviewReplyTarget.value?.reply) return
  confirmDanger('确定删除这条官方回复？', () => doAction(async () => {
    await api.del(`/reviews/${reviewReplyTarget.value.id}/reply`)
    reviewReplyTarget.value = null
    reviewReplyText.value = ''
  }, '回复已删除'))
}

function saveConfig() {
  const invalidCategory = categoryList.value.find((item) => !Number.isInteger(Number(item.homeDisplayLimit)) || Number(item.homeDisplayLimit) < 0 || Number(item.homeDisplayLimit) > 50)
  if (invalidCategory) return Message.warning(`${invalidCategory.name}的首页展示数量请输入0到50之间的整数`)
  const newsLimit = Number(config.value.homeDisplay.newsLimit)
  const videoLimit = Number(config.value.homeDisplay.videoLimit)
  if (![newsLimit, videoLimit].every((value) => Number.isInteger(value) && value >= 0 && value <= 20)) return Message.warning('资讯和视频展示数量请输入0到20之间的整数')
  const rechargeAmounts = (config.value.balanceRechargeAmounts || []).map(Number)
  if (rechargeAmounts.length < 1 || rechargeAmounts.length > 8) return Message.warning('请设置1至8个快捷充值金额')
  if (rechargeAmounts.some((amount) => !Number.isFinite(amount) || amount < 1 || amount > 50000 || Number(amount.toFixed(2)) !== amount)) return Message.warning('快捷充值金额须为1至50000元，最多保留两位小数')
  if (new Set(rechargeAmounts.map(String)).size !== rechargeAmounts.length) return Message.warning('快捷充值金额不能重复')
  doAction(async () => {
    const copyForSave = copyForStorage(config.value.copy, config.value.brand.chineseName, configBrandOriginal.value)
    const homeAssistantForSave = {
      ...config.value.homeAssistant,
      wechatNote: wechatNoteForStorage(config.value.homeAssistant.wechatNote, config.value.assistant.wechat, configWechatOriginal.value)
    }
    const savedBundle = await api.put('/config/bundle', {
      config: {
        ...config.value,
        copy: copyForSave,
        homeAssistant: homeAssistantForSave,
        homeDisplay: { newsLimit, videoLimit },
        balanceRechargeAmounts: rechargeAmounts
      },
      categories: categoryList.value.map((item) => ({ ...item, homeDisplayLimit: Number(item.homeDisplayLimit) }))
    })
    const saved = savedBundle.config
    if (savedBundle.categories) categories.value = savedBundle.categories
    const defaults = defaultConfig()
    const mergedBrand = { ...defaults.brand, ...(saved.brand || {}) }
    const mergedAssistant = { ...defaults.assistant, ...(saved.assistant || {}) }
    const mergedHomeAssistant = { ...defaults.homeAssistant, ...(saved.homeAssistant || {}) }
    config.value = {
      ...defaults,
      ...saved,
      brand: mergedBrand,
      copy: copyForEditor({ ...defaults.copy, ...(saved.copy || {}) }, mergedBrand.chineseName),
      assistant: mergedAssistant,
      homeAssistant: {
        ...mergedHomeAssistant,
        wechatNote: wechatNoteForEditor(mergedHomeAssistant.wechatNote, mergedAssistant.wechat)
      },
      homeDisplay: { ...defaults.homeDisplay, ...(saved.homeDisplay || {}) },
      socialQrs: { ...defaults.socialQrs, ...(saved.socialQrs || {}) },
      filing: { ...defaults.filing, ...(saved.filing || {}) }
    }
    configBrandOriginal.value = mergedBrand.chineseName
    configWechatOriginal.value = mergedAssistant.wechat
  }, '配置已保存，用户端重新进入页面即可看到最新内容')
}

function setCategoryHomeLimit(id, value) {
  const category = categories.value[String(id)] || categories.value[id]
  if (category) category.homeDisplayLimit = Number(value)
}

function qrPreviewUrl(value) {
  const url = String(value || '')
  if (!url || /^(https?:|data:)/.test(url)) return url
  if (import.meta.env.PROD && url.startsWith('/api/')) return `/admin${url}`
  return url.startsWith('/') ? url : `/${url}`
}

function fileDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}

async function uploadQr(event, field) {
  const file = event.target.files && event.target.files[0]
  event.target.value = ''
  if (!file) return
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    Message.error('仅支持 PNG、JPG 或 WebP 图片')
    return
  }
  if (file.size > 2 * 1024 * 1024) {
    Message.error('二维码图片不能超过2MB')
    return
  }
  qrUploading.value = { ...qrUploading.value, [field]: true }
  try {
    const dataUrl = await fileDataUrl(file)
    const result = await api.post('/uploads/image', { dataUrl, fileName: file.name })
    if (field === 'homeAssistant') config.value.homeAssistant.qrImage = result.url
    else config.value.socialQrs[field] = result.url
    Message.success('二维码上传成功，请点击“保存全部配置”使小程序生效')
  } catch (e) {
    Message.error(e.message || '上传失败')
  } finally {
    qrUploading.value = { ...qrUploading.value, [field]: false }
  }
}

function chooseActivityCover() {
  if (activityCoverInput.value) activityCoverInput.value.click()
}

function chooseProductImages() {
  if (productGalleryInput.value) productGalleryInput.value.click()
}

function choosePointCover() {
  if (pointCoverInput.value) pointCoverInput.value.click()
}

function chooseContentCover() {
  if (contentCoverInput.value) contentCoverInput.value.click()
}

async function uploadContentCover(event) {
  const file = event.target.files && event.target.files[0]
  event.target.value = ''
  if (!file) return
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return Message.error('封面仅支持 PNG、JPG 或 WebP 图片')
  if (file.size > 2 * 1024 * 1024) return Message.error('封面图片不能超过2MB')
  contentCoverUploading.value = true
  try {
    const dataUrl = await fileDataUrl(file)
    const result = await api.post('/uploads/image', { dataUrl, fileName: file.name })
    contentForm.value.coverImage = result.url
    Message.success('封面上传成功，保存内容后生效')
  } catch (e) {
    Message.error(e.message || '上传失败')
  } finally {
    contentCoverUploading.value = false
  }
}

async function uploadContentBlockImage(event, index) {
  const file = event.target.files && event.target.files[0]
  event.target.value = ''
  if (!file) return
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return Message.error('正文图片仅支持 PNG、JPG 或 WebP')
  if (file.size > 2 * 1024 * 1024) return Message.error('正文图片不能超过2MB')
  contentBlockUploading.value = { ...contentBlockUploading.value, [index]: true }
  try {
    const dataUrl = await fileDataUrl(file)
    const result = await api.post('/uploads/image', { dataUrl, fileName: file.name })
    contentBlocks.value[index].src = result.url
    Message.success('正文图片上传成功，保存内容后生效')
  } catch (e) {
    Message.error(e.message || '上传失败')
  } finally {
    contentBlockUploading.value = { ...contentBlockUploading.value, [index]: false }
  }
}

async function uploadPointCover(event) {
  const file = event.target.files && event.target.files[0]
  event.target.value = ''
  if (!file) return
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    Message.error('仅支持 PNG、JPG 或 WebP 图片')
    return
  }
  if (file.size > 2 * 1024 * 1024) {
    Message.error('商品图片不能超过2MB')
    return
  }
  pointCoverUploading.value = true
  try {
    const dataUrl = await fileDataUrl(file)
    const result = await api.post('/uploads/image', { dataUrl, fileName: file.name })
    pointProductForm.value.coverImage = result.url
    Message.success('商品图片上传成功，保存商品后生效')
  } catch (e) {
    Message.error(e.message || '上传失败')
  } finally {
    pointCoverUploading.value = false
  }
}

async function uploadActivityCover(event) {
  const file = event.target.files && event.target.files[0]
  event.target.value = ''
  if (!file) return
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    Message.error('仅支持 PNG、JPG 或 WebP 图片')
    return
  }
  if (file.size > 2 * 1024 * 1024) {
    Message.error('活动图片不能超过2MB')
    return
  }
  activityCoverUploading.value = true
  try {
    const dataUrl = await fileDataUrl(file)
    const result = await api.post('/uploads/image', { dataUrl, fileName: file.name })
    activityForm.value.coverImage = result.url
    Message.success('活动封面上传成功，保存活动后生效')
  } catch (e) {
    Message.error(e.message || '上传失败')
  } finally {
    activityCoverUploading.value = false
  }
}

async function uploadProductImages(event) {
  const files = Array.from(event.target.files || [])
  event.target.value = ''
  if (!files.length) return
  const remaining = 9 - productImages.value.length
  if (remaining <= 0) return Message.warning('商品展示图最多上传9张')
  if (files.length > remaining) return Message.warning(`还可以上传${remaining}张图片`)
  if (files.some((file) => !['image/png', 'image/jpeg', 'image/webp'].includes(file.type))) return Message.error('仅支持 PNG、JPG 或 WebP 图片')
  if (files.some((file) => file.size > 2 * 1024 * 1024)) return Message.error('每张商品图片不能超过2MB')
  productImagesUploading.value = true
  try {
    const uploaded = []
    for (const file of files) {
      const dataUrl = await fileDataUrl(file)
      const result = await api.post('/uploads/image', { dataUrl, fileName: file.name })
      uploaded.push({ id: `product-image-${Date.now()}-${uploaded.length}`, src: result.url, label: '' })
    }
    productImages.value = [...productImages.value, ...uploaded]
    Message.success(`已上传${uploaded.length}张商品图片，第一张将作为主图`)
  } catch (e) {
    Message.error(e.message || '上传失败')
  } finally {
    productImagesUploading.value = false
  }
}

async function uploadDetailVideo(event, type, index) {
  const file = event.target.files && event.target.files[0]
  event.target.value = ''
  if (!file) return
  if (!['video/mp4', 'video/webm'].includes(file.type)) return Message.error('视频仅支持 MP4 或 WebM 格式')
  if (file.size > 15 * 1024 * 1024) return Message.error('详情视频不能超过15MB')
  const uploading = type === 'activity' ? activityDetailUploading : productDetailUploading
  uploading.value = { ...uploading.value, [index]: true }
  try {
    const dataUrl = await fileDataUrl(file)
    const result = await api.post('/uploads/video', { dataUrl, fileName: file.name })
    const blocks = type === 'activity' ? activityDetailBlocks : productDetailBlocks
    blocks.value[index].url = result.url
    Message.success('详情视频上传成功，保存后生效')
  } catch (e) {
    Message.error(e.message || '视频上传失败')
  } finally {
    uploading.value = { ...uploading.value, [index]: false }
  }
}

async function uploadActivityDetailImage(event, index) {
  const file = event.target.files && event.target.files[0]
  event.target.value = ''
  if (!file) return
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    Message.error('仅支持 PNG、JPG 或 WebP 图片')
    return
  }
  if (file.size > 2 * 1024 * 1024) {
    Message.error('详情图片不能超过2MB')
    return
  }
  activityDetailUploading.value = { ...activityDetailUploading.value, [index]: true }
  try {
    const dataUrl = await fileDataUrl(file)
    const result = await api.post('/uploads/image', { dataUrl, fileName: file.name })
    activityDetailBlocks.value[index].src = result.url
    Message.success('详情图片上传成功，保存活动后生效')
  } catch (e) {
    Message.error(e.message || '上传失败')
  } finally {
    activityDetailUploading.value = { ...activityDetailUploading.value, [index]: false }
  }
}

async function uploadProductDetailImage(event, index) {
  const file = event.target.files && event.target.files[0]
  event.target.value = ''
  if (!file) return
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    Message.error('仅支持 PNG、JPG 或 WebP 图片')
    return
  }
  if (file.size > 2 * 1024 * 1024) {
    Message.error('详情图片不能超过2MB')
    return
  }
  productDetailUploading.value = { ...productDetailUploading.value, [index]: true }
  try {
    const dataUrl = await fileDataUrl(file)
    const result = await api.post('/uploads/image', { dataUrl, fileName: file.name })
    productDetailBlocks.value[index].src = result.url
    Message.success('详情图片上传成功，保存商品后生效')
  } catch (e) {
    Message.error(e.message || '上传失败')
  } finally {
    productDetailUploading.value = { ...productDetailUploading.value, [index]: false }
  }
}

function exportCsv(filename, rows) {
  if (!rows.length) {
    Message.warning('没有可导出的数据')
    return
  }
  const headers = Object.keys(rows[0])
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
</script>

<template>
  <div v-if="!authed" class="login-page">
    <div class="login-card">
      <div class="login-logo">岁</div>
      <div class="login-title">岁悦里 · 运营后台</div>
      <div class="login-sub">请使用管理员账号登录</div>
      <a-form layout="vertical" class="login-form">
        <a-form-item label="账号">
          <a-input v-model="loginUsername" size="large" placeholder="请输入账号" allow-clear @press-enter="handleLogin" />
        </a-form-item>
        <a-form-item label="密码">
          <a-input-password v-model="loginPassword" size="large" placeholder="请输入密码" @press-enter="handleLogin" />
        </a-form-item>
        <div v-if="loginError" class="login-error">{{ loginError }}</div>
        <a-button type="primary" size="large" long :loading="loginLoading" @click="handleLogin">登 录</a-button>
      </a-form>
    </div>
  </div>
  <a-layout v-else class="layout">
    <a-layout-sider
      collapsible
      :collapsed="collapsed"
      :width="240"
      :collapsed-width="64"
      breakpoint="lg"
      class="sider"
    >
      <div class="logo">{{ collapsed ? '岁' : '岁悦里 · 运营后台' }}</div>
      <a-menu
        :selected-keys="[view]"
        :collapsed="collapsed"
        @menu-item-click="switchView"
      >
        <a-menu-item v-for="n in visibleNav" :key="n.key">
          <template #icon><component :is="n.icon" /></template>
          {{ n.name }}
        </a-menu-item>
      </a-menu>
      <template #trigger>
        <div class="sider-trigger">
          <component :is="collapsed ? IconMenuUnfold : IconMenuFold" />
        </div>
      </template>
    </a-layout-sider>

    <a-layout>
      <a-layout-header class="topbar">
        <div class="topbar-inner">
          <a-button type="text" aria-label="切换导航" @click="collapsed = !collapsed">
            <template #icon><component :is="collapsed ? IconMenuUnfold : IconMenuFold" /></template>
          </a-button>
          <span class="topbar-title">{{ pageTitle }}</span>
          <div class="topbar-spacer"></div>
          <a-popover v-model:popup-visible="notificationOpen" trigger="click" position="br">
            <a-badge :count="notificationCount" :max-count="99">
              <a-button type="text" aria-label="消息通知">
                <template #icon><IconNotification /></template>
              </a-button>
            </a-badge>
            <template #content>
              <div class="notification-panel">
                <div class="notification-head">
                  <div><strong>消息通知</strong><span>{{ notificationCount }} 项待处理</span></div>
                  <a-button type="text" size="mini" :loading="notificationLoading" @click="loadNotifications()">刷新</a-button>
                </div>
                <div v-if="notificationCount === 0" class="notification-empty">暂无待处理消息</div>
                <div v-else class="notification-list">
                  <button v-for="item in notifications" :key="item.id" class="notification-item" @click="openNotification(item)">
                    <div class="notification-item-head">
                      <a-tag :color="notificationColor(item.type)" size="small">{{ notificationLabel(item.type) }}</a-tag>
                      <span>{{ item.time || '刚刚' }}</span>
                    </div>
                    <strong>{{ item.title }}</strong>
                    <p>{{ item.description }}</p>
                  </button>
                </div>
              </div>
            </template>
          </a-popover>
          <a-space :size="10">
            <a-avatar :size="30" class="avatar">管</a-avatar>
            <span class="topbar-user">{{ currentAdmin?.name || currentAdmin?.username || '运营管理员' }}</span>
          </a-space>
          <a-button type="text" size="small" @click="selfPasswordForm = { oldPassword: '', newPassword: '', confirmPassword: '' }">修改密码</a-button>
          <a-button type="text" size="small" @click="handleLogout">退出登录</a-button>
        </div>
      </a-layout-header>

      <a-layout-content class="content">
        <a-alert
          v-if="error"
          type="error"
          closable
          class="error"
          @close="error = ''"
        >
          {{ error }}
        </a-alert>

        <a-spin :loading="loading" tip="加载中…" class="spin">
          <DashboardView
            v-if="view === 'dashboard' && stats"
            :stats="stats"
            :stat-items="statItems"
            :categories="categories"
            @open-stat="openStatItem"
          />

          <ActivitiesView
            v-if="view === 'activities'"
            v-model:keyword="kw"
            v-model:publisher-id="activityPublisherId"
            v-model:category="activityCategoryFilter"
            :activities="activities"
            :categories="categoryList"
            :publisher-options="activityPublisherOptions"
            :publisher-name="activityPublisherName"
            :category-name="catName"
            :region-names="regionNames"
            @edit="openActivity"
            @remove="removeActivity"
          />

          <ProductsView
            v-if="view === 'products'"
            v-model:publisher-id="productPublisherId"
            :products="products"
            :publisher-options="activityPublisherOptions"
            :publisher-name="activityPublisherName"
            :category-name="catName"
            :region-names="regionNames"
            @edit="openProduct"
            @remove="removeProduct"
          />

          <LivesView
            v-if="view === 'lives'"
            v-model:merchant-id="selectedMerchantId"
            :lives="lives"
            :merchant="selectedMerchant"
            :merchant-options="managerOptions"
            @edit="openLive"
            @remove="removeLive"
          />

          <PointsMallView
            v-if="view === 'pointsMall'"
            :products="pointProducts"
            :orders="pointOrders"
            :preview-url="qrPreviewUrl"
            @edit="openPointProduct"
            @remove="removePointProduct"
            @ship="(record, editing) => openShip(record, editing, 'point')"
            @complete="completePointOrder"
          />

          <RegionsView v-if="view === 'regions'" :regions="regions" @edit="openRegion" @toggle="toggleRegion" />

          <OrdersView v-if="view === 'orders'" v-model:keyword="kw" v-model:status="orderStatusFilter" :orders="filteredOrders" :export-rows="orderExportRows" :status-options="orderStatusOptions" :pending-checkin="pendingCheckinOrders" :pending-ship="pendingShipOrders" @export="rows => exportCsv('orders.csv', rows)" @cancel="id => orderAction(id, 'cancel')" @advance="id => orderAction(id, 'advance')" @ship="openShip" @complete="completeOrderFulfillment" @approve-refund="approveRefund" @reject-refund="rejectRefund" @refund="refundOrder" />

          <LogisticsView v-if="view === 'logistics'" :config="logisticsConfig" :exceptions="logisticsExceptions" :loading="logisticsQueryLoading" v-model:query-form="logisticsQueryForm" :result="logisticsQueryResult" @query="queryLogistics" @refresh="refreshLogistics" />

          <VerifyView
            v-if="view === 'verify'"
            v-model:code="verifyCode"
            v-model:customer-id="cardCustomerId"
            :order="verifyOrder"
            :searching="verifySearching"
            :customer-options="customerOptions"
            :cards="cardList"
            :card-loading="cardLoading"
            @search="searchVerify"
            @confirm="confirmVerify"
            @load-customer="loadCardCustomer"
            @makeup="openMakeup"
          />

          <CustomersView v-if="view === 'customers'" v-model:keyword="kw" :customers="filteredCustomers" :managers="managers" :loading="customerDetailLoading" @detail="openCustomerDetail" @edit="openCustomer" @rebind="openRebind" @unbind="unbindCustomer" />

          <CouponsView
            v-if="view === 'coupons'"
            :coupons="coupons"
            :coupon-types="couponTypes"
            :publisher-name="activityPublisherName"
            @records="openCouponRecords"
            @edit="openCoupon"
            @remove="removeCoupon"
          />

          <ReviewsView v-if="view === 'reviews'" :activities="activities" :reviews="reviews" @reply="openReviewReply" @toggle="toggleReviewVisibility" @remove="removeReview" />

          <BannersView
            v-if="view === 'banners'"
            :banners="banners"
            :preview-url="qrPreviewUrl"
            @edit="openBanner"
            @remove="removeBanner"
          />

          <ContentView
            v-if="view === 'content'"
            :posts="contentPosts"
            @edit="openContent"
            @remove="removeContent"
          />

          <ApplicationsView
            v-if="view === 'applications'"
            :applications="applications"
            @review="openManagerReview"
          />

          <ProvidersView
            v-if="view === 'providers'"
            :applications="providerApplications"
            @review="approveProvider"
          />

          <MerchantsView
            v-if="view === 'merchants'"
            v-model:keyword="kw"
            v-model:status="merchantStatusFilter"
            :accounts="merchantAccounts"
            :permission-name="permissionNames"
            @edit="openMerchantPermission"
            @reset-password="record => openPasswordReset('merchant', record)"
          />

          <ManagersView v-if="view === 'managers'" :managers="managers" @create="openManagerForm" @finance="openManagerFinance" @status="setManagerStatus" />

          <BindingsView v-if="view === 'bindings'" :applications="unbindApplications" :bindings="bindings" :managers="managers" :loading="customerDetailLoading" @approve="approveUnbind" @reject="rejectUnbind" @detail="openCustomerDetail" @rebind="openRebind" @unbind="unbindCustomer" />

          <CommissionsView v-if="view === 'commissions'" v-model:keyword="kw" v-model:manager-id="commissionManagerId" :commissions="filteredCommissions" :managers="managers" :manager-options="commissionManagerOptions" :settlements="settlementRecords" :settlement-columns="settlementColumns" @settle-manager="settleByManager" @settle-all="settleAll" @settle-one="settleOne" @adjust="openAdjust" @export="rows => exportCsv('commissions.csv', rows)" />

          <WithdrawsView v-if="view === 'withdraws'" v-model:keyword="kw" v-model:status="withdrawStatusFilter" v-model:date-range="withdrawDateRange" :withdraws="filteredWithdraws" :export-rows="withdrawExportRows" :managers="managers" :status-options="withdrawStatusOptions" @detail="openWithdrawDetail" @export="rows => exportCsv('withdraw-finance.csv', rows)" />

          <PermissionsView
            v-if="view === 'permissions'"
            :admin-accounts="adminAccounts"
            :merchant-accounts="merchantAccounts"
            :permission-name="permissionNames"
            @create-admin="openAdminAccount()"
            @edit-admin="openAdminAccount"
            @reset-admin="record => openPasswordReset('admin', record)"
            @edit-merchant="openMerchantPermission"
            @reset-merchant="record => openPasswordReset('merchant', record)"
          />

          <AuditLogsView v-if="view === 'logs'" :logs="logs" />

          <CategoriesView
            v-if="view === 'categories'"
            :categories="categoryList"
            @edit="openCategory"
            @remove="removeCategory"
          />

          <ConfigView
            v-if="view === 'config' && config"
            v-model:config="config"
            :categories="categoryList"
            :qr-uploading="qrUploading"
            :preview-url="qrPreviewUrl"
            @category-limit="setCategoryHomeLimit"
            @upload-qr="uploadQr"
            @save="saveConfig"
          />
        </a-spin>
      </a-layout-content>
    </a-layout>
  </a-layout>

  <a-modal v-if="adminAccountForm" :visible="true" :title="adminAccountForm.id ? '编辑后台账号' : '新增员工账号'" :width="680" class="admin-editor-modal" @cancel="adminAccountForm = null">
    <a-form :model="adminAccountForm" layout="vertical">
      <a-row :gutter="12">
        <a-col :span="12"><a-form-item label="登录账号" required><a-input v-model="adminAccountForm.username" :disabled="Boolean(adminAccountForm.id)" placeholder="4-24位字母、数字或下划线" /></a-form-item></a-col>
        <a-col :span="12"><a-form-item label="员工姓名" required><a-input v-model="adminAccountForm.name" /></a-form-item></a-col>
      </a-row>
      <a-form-item v-if="!adminAccountForm.id" label="初始密码" required><a-input-password v-model="adminAccountForm.password" placeholder="至少8位" /></a-form-item>
      <a-row :gutter="12">
        <a-col :span="12"><a-form-item label="角色"><a-radio-group v-model="adminAccountForm.role" type="button"><a-radio value="staff">员工账号</a-radio><a-radio value="super_admin">超级管理员</a-radio></a-radio-group></a-form-item></a-col>
        <a-col :span="12"><a-form-item label="账号状态"><a-radio-group v-model="adminAccountForm.status" type="button"><a-radio :value="1">启用</a-radio><a-radio :value="0">停用</a-radio></a-radio-group></a-form-item></a-col>
      </a-row>
      <a-form-item label="功能权限" required>
        <a-alert v-if="adminAccountForm.role === 'super_admin'" type="warning" style="margin-bottom: 12px">超级管理员自动拥有全部权限。</a-alert>
        <a-checkbox-group v-else v-model="adminAccountForm.permissions" direction="vertical" :options="permissionOptions.admin.map((item) => ({ label: `${item.name}：${item.description}`, value: item.key }))" />
      </a-form-item>
    </a-form>
    <template #footer><a-button @click="adminAccountForm = null">取消</a-button><a-button type="primary" @click="saveAdminAccount">保存账号</a-button></template>
  </a-modal>

  <a-modal v-if="merchantPermissionForm" :visible="true" :title="`${merchantPermissionForm.shopName || merchantPermissionForm.username} · 发布权限`" :width="560" class="admin-editor-modal" @cancel="merchantPermissionForm = null">
    <a-form :model="merchantPermissionForm" layout="vertical">
      <a-form-item label="账号状态"><a-radio-group v-model="merchantPermissionForm.status" type="button"><a-radio :value="1">启用</a-radio><a-radio :value="0">停用</a-radio></a-radio-group></a-form-item>
      <a-form-item label="允许发布"><a-checkbox-group v-model="merchantPermissionForm.permissions" direction="vertical" :options="permissionOptions.merchant.map((item) => ({ label: item.name, value: item.key }))" /></a-form-item>
    </a-form>
    <template #footer><a-button @click="merchantPermissionForm = null">取消</a-button><a-button type="primary" @click="saveMerchantPermission">保存权限</a-button></template>
  </a-modal>

  <a-modal v-if="passwordForm" :visible="true" :title="`重置密码 · ${passwordForm.username}`" :width="460" class="admin-editor-modal" @cancel="passwordForm = null">
    <a-form :model="passwordForm" layout="vertical"><a-form-item label="新密码" required><a-input-password v-model="passwordForm.newPassword" placeholder="至少8位" /></a-form-item></a-form>
    <template #footer><a-button @click="passwordForm = null">取消</a-button><a-button type="primary" @click="submitPasswordReset">确认重置</a-button></template>
  </a-modal>

  <a-modal v-if="selfPasswordForm" :visible="true" title="修改登录密码" :width="460" class="admin-editor-modal" @cancel="selfPasswordForm = null">
    <a-form :model="selfPasswordForm" layout="vertical">
      <a-form-item label="原密码" required><a-input-password v-model="selfPasswordForm.oldPassword" /></a-form-item>
      <a-form-item label="新密码" required><a-input-password v-model="selfPasswordForm.newPassword" placeholder="至少8位" /></a-form-item>
      <a-form-item label="确认新密码" required><a-input-password v-model="selfPasswordForm.confirmPassword" /></a-form-item>
    </a-form>
    <template #footer><a-button @click="selfPasswordForm = null">取消</a-button><a-button type="primary" @click="submitSelfPassword">修改密码</a-button></template>
  </a-modal>

  <a-modal
    v-if="makeupTarget"
    :visible="true"
    class="admin-editor-modal"
    title="课程补签"
    :width="480"
    @cancel="makeupTarget = null"
  >
    <a-alert type="warning" style="margin-bottom: 16px">
      补签会核销 1 次课程，并保留操作人、补签日期和原因。
    </a-alert>
    <a-form :model="makeupForm" layout="vertical">
      <a-form-item label="课程"><a-input :model-value="makeupTarget.title" disabled /></a-form-item>
      <a-row :gutter="12">
        <a-col :span="12"><a-form-item label="补签日期" required><a-input v-model="makeupForm.date" placeholder="YYYY-MM-DD" /></a-form-item></a-col>
        <a-col :span="12"><a-form-item label="课程时间"><a-input v-model="makeupForm.time" placeholder="如 14:00-15:30" /></a-form-item></a-col>
      </a-row>
      <a-form-item label="补签原因" required><a-textarea v-model="makeupForm.reason" :max-length="100" show-word-limit placeholder="例如：会员现场签到失败，经工作人员核实到场" /></a-form-item>
    </a-form>
    <template #footer><a-button @click="makeupTarget = null">取消</a-button><a-button type="primary" @click="submitMakeup">确认补签</a-button></template>
  </a-modal>

  <a-modal
    v-if="managerForm"
    :visible="true"
    class="admin-editor-modal"
    title="新增主理人"
    :width="620"
    @cancel="managerForm = null"
  >
    <a-form :model="managerForm" layout="vertical">
      <a-form-item label="关联会员账号">
        <a-select v-model="managerForm.userId" :options="managerCandidateOptions" allow-search allow-clear placeholder="可选，关联后该会员可进入主理人工作台" @change="fillManagerCustomer" />
      </a-form-item>
      <a-row :gutter="12">
        <a-col :span="12"><a-form-item label="主理人姓名" required><a-input v-model="managerForm.name" /></a-form-item></a-col>
        <a-col :span="12"><a-form-item label="手机号" required><a-input v-model="managerForm.phone" /></a-form-item></a-col>
      </a-row>
      <a-row :gutter="12">
        <a-col :span="12"><a-form-item label="微信号"><a-input v-model="managerForm.wechat" /></a-form-item></a-col>
        <a-col :span="12"><a-form-item label="邀请码"><a-input v-model="managerForm.inviteCode" placeholder="留空自动生成" /></a-form-item></a-col>
      </a-row>
      <a-row :gutter="12">
        <a-col :span="12"><a-form-item label="分佣比例（%）"><a-input-number v-model="managerForm.commissionRate" :min="0" :max="100" style="width: 100%" placeholder="留空使用全局比例" /></a-form-item></a-col>
        <a-col :span="12"><a-form-item label="初始状态"><a-select v-model="managerForm.status" :options="[{ label: '正常', value: 1 }, { label: '冻结', value: 2 }]" /></a-form-item></a-col>
      </a-row>
      <a-form-item label="联系地址"><a-input v-model="managerForm.address" /></a-form-item>
      <a-form-item label="个人简介"><a-textarea v-model="managerForm.intro" :auto-size="{ minRows: 3, maxRows: 6 }" /></a-form-item>
      <a-form-item label="后台备注"><a-textarea v-model="managerForm.remark" :auto-size="{ minRows: 2, maxRows: 4 }" /></a-form-item>
    </a-form>
    <template #footer><a-button @click="managerForm = null">取消</a-button><a-button type="primary" @click="saveManager">确认新增</a-button></template>
  </a-modal>

  <a-modal
    v-if="managerFinanceTarget"
    :visible="true"
    class="admin-editor-modal"
    :title="`${managerFinanceTarget.name} · 金额明细`"
    :width="1060"
    @cancel="managerFinanceTarget = null"
  >
    <a-spin :loading="managerFinanceLoading" style="width: 100%">
      <template v-if="managerFinanceDetail">
        <a-descriptions :column="3" bordered size="small" style="margin-bottom: 18px">
          <a-descriptions-item label="累计业绩">¥{{ fmtMoney(managerFinanceDetail.manager.totalPerformance) }}</a-descriptions-item>
          <a-descriptions-item label="累计佣金">¥{{ fmtMoney(managerFinanceDetail.manager.totalCommission) }}</a-descriptions-item>
          <a-descriptions-item label="待结算">¥{{ fmtMoney(managerFinanceDetail.manager.pending) }}</a-descriptions-item>
          <a-descriptions-item label="可结算">¥{{ fmtMoney(managerFinanceDetail.manager.available) }}</a-descriptions-item>
          <a-descriptions-item label="提现中">¥{{ fmtMoney(managerFinanceDetail.manager.withdrawing) }}</a-descriptions-item>
          <a-descriptions-item label="已打款">¥{{ fmtMoney(managerFinanceDetail.manager.settled) }}</a-descriptions-item>
        </a-descriptions>
        <a-alert type="info" style="margin-bottom: 16px">佣金金额 = 实际支付金额 × 分佣比例。优惠价和优惠券抵扣后的实付金额会分别留档。</a-alert>
        <a-card title="佣金明细" :bordered="false">
          <template #extra><a-select v-model="managerFinanceStatus" :options="managerFinanceStatusOptions" style="width: 150px" /></template>
          <a-table :columns="managerFinanceColumns" :data="managerFinanceCommissions" :pagination="false" row-key="id" size="small" :scroll="{ x: 1450 }">
            <template #originalAmount="{ record }"><span class="num">¥{{ fmtMoney(record.originalAmount) }}</span></template>
            <template #discountedAmount="{ record }"><span class="num">¥{{ fmtMoney(record.discountedAmount) }}</span></template>
            <template #actualPaidAmount="{ record }"><strong class="num">¥{{ fmtMoney(record.actualPaidAmount ?? record.payAmount) }}</strong></template>
            <template #rate="{ record }">{{ record.commissionRate }}%</template>
            <template #amount="{ record }"><span class="num">¥{{ fmtMoney(record.commissionAmount) }}</span></template>
            <template #status="{ record }"><a-tag :color="statusChip(record.status)">{{ record.status }}</a-tag></template>
          </a-table>
        </a-card>
        <a-card title="结算记录" :bordered="false" style="margin-top: 16px">
          <a-table :columns="settlementColumns" :data="managerFinanceDetail.settlements" :pagination="false" row-key="id" size="small">
            <template #amount="{ record }"><span class="num">¥{{ fmtMoney(record.amount) }}</span></template>
          </a-table>
        </a-card>
        <a-card title="提现与打款记录" :bordered="false" style="margin-top: 16px">
          <a-table :columns="managerFinanceWithdrawColumns" :data="managerFinanceDetail.withdraws" :pagination="false" row-key="id" size="small">
            <template #amount="{ record }"><span class="num">¥{{ fmtMoney(record.amount) }}</span></template>
            <template #tax="{ record }"><span class="num">¥{{ fmtMoney(record.tax) }}</span></template>
            <template #actual="{ record }"><span class="num">¥{{ fmtMoney(record.actualAmount) }}</span></template>
            <template #status="{ record }"><a-tag :color="statusChip(record.status)">{{ record.status }}</a-tag></template>
          </a-table>
        </a-card>
      </template>
    </a-spin>
    <template #footer><a-button type="primary" @click="managerFinanceTarget = null">关闭</a-button></template>
  </a-modal>

  <a-modal
    v-if="withdrawDetailTarget"
    :visible="true"
    class="admin-editor-modal"
    :title="`提现审核 · ${withdrawDetailTarget.id}`"
    :width="1080"
    @cancel="withdrawDetailTarget = null"
  >
    <a-spin :loading="withdrawDetailLoading" style="width: 100%">
      <template v-if="withdrawDetail && withdrawAuditForm">
        <a-descriptions :column="3" bordered size="small" style="margin-bottom: 18px">
          <a-descriptions-item label="主理人">{{ withdrawDetail.manager?.name || withdrawDetail.withdraw.managerName || '—' }}</a-descriptions-item>
          <a-descriptions-item label="手机号">{{ withdrawDetail.manager?.phone || '—' }}</a-descriptions-item>
          <a-descriptions-item label="状态"><a-tag :color="statusChip(withdrawDetail.withdraw.status)">{{ withdrawDetail.withdraw.status }}</a-tag></a-descriptions-item>
          <a-descriptions-item label="申请金额">¥{{ fmtMoney(withdrawDetail.withdraw.amount) }}</a-descriptions-item>
          <a-descriptions-item label="锁定佣金">{{ withdrawDetail.withdraw.commissionCount || withdrawDetail.commissions.length }} 笔</a-descriptions-item>
          <a-descriptions-item label="申请时间">{{ withdrawDetail.withdraw.applyTime || '—' }}</a-descriptions-item>
          <a-descriptions-item label="税费">¥{{ fmtMoney(withdrawDetail.withdraw.status === '待审核' ? withdrawAuditTax : withdrawDetail.withdraw.tax) }}</a-descriptions-item>
          <a-descriptions-item label="实际到账">¥{{ fmtMoney(withdrawDetail.withdraw.status === '待审核' ? withdrawAuditActual : withdrawDetail.withdraw.actualAmount) }}</a-descriptions-item>
          <a-descriptions-item label="退款扣减">¥{{ fmtMoney(withdrawDetail.withdraw.clawbackAmount) }}</a-descriptions-item>
          <a-descriptions-item label="打款方式">{{ withdrawDetail.withdraw.payMethod === 'wechat' ? '微信零钱商家转账' : (withdrawDetail.withdraw.payMethod === 'manual' ? '人工打款' : '未选择') }}</a-descriptions-item>
          <a-descriptions-item v-if="withdrawDetail.withdraw.transferState" label="微信转账状态"><a-tag :color="withdrawDetail.withdraw.transferState === 'FAIL' ? 'red' : (withdrawDetail.withdraw.transferState === 'SUCCESS' ? 'green' : 'arcoblue')">{{ transferStateText(withdrawDetail.withdraw.transferState) }}</a-tag></a-descriptions-item>
          <a-descriptions-item v-if="withdrawDetail.withdraw.payTime" label="打款时间">{{ withdrawDetail.withdraw.payTime }}</a-descriptions-item>
          <a-descriptions-item v-if="withdrawDetail.withdraw.transferBillNo" label="微信转账单号" :span="2">{{ withdrawDetail.withdraw.transferBillNo }}</a-descriptions-item>
          <a-descriptions-item v-if="withdrawDetail.withdraw.rejectReason" label="拒绝原因" :span="2">{{ withdrawDetail.withdraw.rejectReason }}</a-descriptions-item>
        </a-descriptions>

        <a-form v-if="withdrawDetail.withdraw.status === '待审核'" :model="withdrawAuditForm" layout="vertical">
          <a-row :gutter="12">
            <a-col :span="6"><a-form-item label="代扣税率（%）" required><a-input-number v-model="withdrawAuditForm.taxRate" :min="0" :max="100" :precision="2" style="width: 100%" /></a-form-item></a-col>
            <a-col :span="18">
              <a-form-item label="打款方式" required><a-tag color="green" size="large">微信零钱商家转账</a-tag></a-form-item>
            </a-col>
          </a-row>
          <a-form-item label="财务备注"><a-textarea v-model="withdrawAuditForm.financeRemark" :auto-size="{ minRows: 2, maxRows: 4 }" placeholder="可填写收款账户核对、打款批次等信息" /></a-form-item>
          <a-alert
            type="info"
            style="margin-bottom: 16px"
            :title="`将向主理人微信零钱转账 ¥${fmtMoney(withdrawAuditActual)}（代扣税 ¥${fmtMoney(withdrawAuditTax)}）`"
          >
            转账场景 {{ withdrawDetail.transfer?.sceneId || '1005' }}（佣金报酬）· 商户号 {{ withdrawDetail.transfer?.mchId || '—' }}。
            发起后主理人需在 24 小时内在小程序工作台「确认收款」，逾期微信自动关单并释放锁定佣金。
          </a-alert>
          <a-alert v-if="!withdrawDetail.transfer?.enabled" type="warning" style="margin-bottom: 16px">
            {{ withdrawDetail.transfer?.error || '服务端未启用微信商家转账（需设置 WECHAT_TRANSFER_ENABLED=true）' }}。配置完成前不能审核打款。
          </a-alert>
        </a-form>
        <template v-else>
          <a-descriptions :column="2" bordered size="small" style="margin-bottom: 18px">
            <a-descriptions-item label="支付渠道">{{ withdrawDetail.withdraw.payChannel || '—' }}</a-descriptions-item>
            <a-descriptions-item label="打款流水号">{{ withdrawDetail.withdraw.payOrderNo || '—' }}</a-descriptions-item>
            <a-descriptions-item label="微信商户单号">{{ withdrawDetail.withdraw.outBillNo || '—' }}</a-descriptions-item>
            <a-descriptions-item label="财务备注">{{ withdrawDetail.withdraw.financeRemark || '—' }}</a-descriptions-item>
          </a-descriptions>
          <a-alert v-if="withdrawDetail.withdraw.status === '打款中'" type="info" style="margin-bottom: 16px">
            转账已发起，等待主理人在小程序确认收款。服务端每分钟自动查单，也可点「查单」立即同步。
          </a-alert>
          <a-alert v-if="withdrawDetail.withdraw.status === '打款失败'" type="error" style="margin-bottom: 16px">
            转账失败：{{ withdrawDetail.withdraw.transferFailReasonText || withdrawDetail.withdraw.transferError || '未知原因' }}。锁定佣金已释放，主理人可重新申请提现。
          </a-alert>
          <a-alert v-if="withdrawDetail.withdraw.status === '已撤销'" type="warning" style="margin-bottom: 16px">
            微信转账已撤销，锁定佣金已释放。
          </a-alert>
          <a-alert v-if="withdrawDetail.withdraw.status === '打款中' && withdrawDetail.withdraw.transferState === 'UNKNOWN'" type="warning" style="margin-bottom: 16px">
            上次发起转账的结果不明确，服务端会持续按原商户单号查单。为防止重复付款，后台不能人工标记成功或失败，也不会释放锁定佣金。
          </a-alert>
        </template>

        <a-card title="本次提现佣金明细" :bordered="false">
          <a-table :columns="managerFinanceColumns" :data="withdrawDetail.commissions" :pagination="false" row-key="id" size="small" :scroll="{ x: 1450 }">
            <template #originalAmount="{ record }"><span class="num">¥{{ fmtMoney(record.originalAmount) }}</span></template>
            <template #discountedAmount="{ record }"><span class="num">¥{{ fmtMoney(record.discountedAmount) }}</span></template>
            <template #actualPaidAmount="{ record }"><strong class="num">¥{{ fmtMoney(record.actualPaidAmount ?? record.payAmount) }}</strong></template>
            <template #rate="{ record }">{{ record.commissionRate }}%</template>
            <template #amount="{ record }"><span class="num">¥{{ fmtMoney(record.commissionAmount) }}</span></template>
            <template #status="{ record }"><a-tag :color="statusChip(record.status)">{{ record.status }}</a-tag></template>
          </a-table>
        </a-card>
      </template>
    </a-spin>
    <template #footer>
      <a-button @click="withdrawDetailTarget = null">关闭</a-button>
      <template v-if="withdrawDetail?.withdraw?.status === '待审核'">
        <a-button status="danger" @click="rejectWithdraw(withdrawDetail.withdraw.id)">拒绝</a-button>
        <a-button type="primary" :disabled="!withdrawDetail.transfer?.enabled" @click="approveWithdraw">发起微信转账</a-button>
      </template>
      <template v-else-if="withdrawDetail?.withdraw?.status === '打款中'">
        <a-button @click="syncWithdrawTransfer(withdrawDetail.withdraw.id)">查单</a-button>
        <a-button v-if="withdrawDetail.withdraw.transferState === 'CANCELING'" disabled>撤销中</a-button>
        <a-button v-else-if="withdrawDetail.withdraw.transferState !== 'UNKNOWN'" status="danger" @click="cancelWithdrawTransfer(withdrawDetail.withdraw.id)">撤销转账</a-button>
      </template>
    </template>
  </a-modal>

  <a-modal
    v-if="managerReviewTarget && managerApprovalForm"
    :visible="true"
    class="admin-editor-modal"
    :title="managerReviewTarget.status === '待审核' ? '审核主理人申请' : '主理人申请详情'"
    :width="820"
    @cancel="closeManagerReview"
  >
    <a-alert v-if="managerReviewTarget.status === '已拒绝'" type="error" style="margin-bottom: 16px">拒绝原因：{{ managerReviewTarget.rejectReason }}</a-alert>
    <a-alert v-else-if="managerReviewTarget.status === '已通过'" type="success" style="margin-bottom: 16px">已于 {{ managerReviewTarget.auditedAt || '—' }} 审核通过</a-alert>
    <a-divider orientation="left">前端提交的原始内容</a-divider>
    <a-descriptions :column="2" bordered size="small" style="margin-bottom: 18px">
      <a-descriptions-item label="申请编号">{{ managerReviewTarget.id }}</a-descriptions-item>
      <a-descriptions-item label="提交时间">{{ managerReviewTarget.submittedAt || '—' }}</a-descriptions-item>
      <a-descriptions-item label="申请人姓名">{{ managerReviewTarget.name || '—' }}</a-descriptions-item>
      <a-descriptions-item label="联系电话">{{ managerReviewTarget.phone || '—' }}</a-descriptions-item>
      <a-descriptions-item label="微信群数量">{{ managerReviewTarget.groupCount ?? 0 }}</a-descriptions-item>
      <a-descriptions-item label="社群总人数">{{ managerReviewTarget.memberCount ?? 0 }}</a-descriptions-item>
      <a-descriptions-item label="擅长领域" :span="2">{{ (managerReviewTarget.fields || []).join('、') || '—' }}</a-descriptions-item>
      <a-descriptions-item label="个人简介" :span="2">{{ managerReviewTarget.intro || '—' }}</a-descriptions-item>
    </a-descriptions>

    <a-divider orientation="left">审核通过资料（可编辑）</a-divider>
    <a-form :model="managerApprovalForm" layout="vertical" :disabled="managerReviewTarget.status !== '待审核'">
      <a-row :gutter="12">
        <a-col :span="12"><a-form-item label="申请人姓名" required><a-input v-model="managerApprovalForm.name" /></a-form-item></a-col>
        <a-col :span="12"><a-form-item label="联系电话" required><a-input v-model="managerApprovalForm.phone" /></a-form-item></a-col>
      </a-row>
      <a-row :gutter="12">
        <a-col :span="8"><a-form-item label="微信群数量"><a-input-number v-model="managerApprovalForm.groupCount" :min="0" :max="50" :precision="0" style="width: 100%" /></a-form-item></a-col>
        <a-col :span="8"><a-form-item label="社群总人数"><a-input-number v-model="managerApprovalForm.memberCount" :min="0" :max="5000" :precision="0" style="width: 100%" /></a-form-item></a-col>
        <a-col :span="8"><a-form-item label="分佣比例（%）"><a-input-number v-model="managerApprovalForm.commissionRate" :min="0" :max="100" style="width: 100%" placeholder="使用全局比例" /></a-form-item></a-col>
      </a-row>
      <a-form-item label="擅长领域"><a-input v-model="managerApprovalForm.fieldsText" placeholder="多个领域用顿号或逗号分隔" /></a-form-item>
      <a-form-item label="个人简介"><a-textarea v-model="managerApprovalForm.intro" :auto-size="{ minRows: 3, maxRows: 6 }" /></a-form-item>

      <a-divider orientation="left">收费到账与财务核对</a-divider>
      <a-row :gutter="12">
        <a-col :span="8"><a-form-item label="应收费用（元）"><a-input-number v-model="managerApprovalForm.feeAmount" :min="0" :precision="2" style="width: 100%" disabled /></a-form-item></a-col>
        <a-col :span="8"><a-form-item label="实际到账（元）"><a-input-number v-model="managerApprovalForm.paidAmount" :min="0" :precision="2" style="width: 100%" disabled /></a-form-item></a-col>
        <a-col :span="8"><a-form-item label="到账状态"><a-select v-model="managerApprovalForm.paymentStatus" :options="managerPaymentStatusOptions" disabled /></a-form-item></a-col>
      </a-row>
      <a-row :gutter="12">
        <a-col :span="8"><a-form-item label="支付方式"><a-input v-model="managerApprovalForm.paymentMethod" placeholder="由微信支付结果写入" disabled /></a-form-item></a-col>
        <a-col :span="8"><a-form-item label="支付订单编号"><a-input v-model="managerApprovalForm.paymentOrderNo" placeholder="由微信支付结果写入" disabled /></a-form-item></a-col>
        <a-col :span="8"><a-form-item label="支付时间"><a-input v-model="managerApprovalForm.paidAt" placeholder="由微信支付结果写入" disabled /></a-form-item></a-col>
      </a-row>
      <a-form-item label="财务备注"><a-textarea v-model="managerApprovalForm.financeRemark" :auto-size="{ minRows: 2, maxRows: 4 }" placeholder="到账账户、核对人员或其他说明" /></a-form-item>
    </a-form>
    <div v-if="managerRejectMode && managerReviewTarget.status === '待审核'">
      <a-divider orientation="left">拒绝申请</a-divider>
      <a-alert type="warning" style="margin-bottom: 12px">拒绝原因会保存到申请记录，并展示给申请人。</a-alert>
      <a-form layout="vertical">
        <a-form-item label="拒绝原因" required>
          <a-textarea v-model="managerRejectReason" :auto-size="{ minRows: 3, maxRows: 6 }" placeholder="请填写明确的拒绝原因" />
        </a-form-item>
      </a-form>
    </div>
    <template #footer>
      <a-button @click="closeManagerReview">关闭</a-button>
      <template v-if="managerReviewTarget.status === '待审核'">
        <template v-if="managerRejectMode">
          <a-button @click="managerRejectMode = false">返回审核</a-button>
          <a-button type="primary" status="danger" @click="submitManagerReject">提交拒绝</a-button>
        </template>
        <template v-else>
          <a-button status="danger" @click="startManagerReject">拒绝申请</a-button>
          <a-button type="primary" @click="submitManagerApproval">确认通过</a-button>
        </template>
      </template>
    </template>
  </a-modal>

  <a-modal
    v-if="providerApproveTarget"
    :visible="true"
    class="admin-editor-modal"
    :title="providerApproveTarget.status === '待审核' ? '审核服务商申请' : '服务商申请详情'"
    :width="760"
    @cancel="providerApproveTarget = null"
  >
    <a-alert v-if="providerApproveTarget.status === '已拒绝'" type="error" style="margin-bottom: 16px">拒绝原因：{{ providerApproveTarget.rejectReason }}</a-alert>
    <a-alert v-else-if="providerApproveTarget.status === '已通过'" type="success" style="margin-bottom: 16px">已于 {{ providerApproveTarget.auditedAt || '—' }} 审核通过，商户账号：{{ providerApproveTarget.loginUsername }}</a-alert>
    <a-form :model="providerAccountForm" layout="vertical" :disabled="providerApproveTarget.status !== '待审核'">
      <a-divider orientation="left">用户提交内容</a-divider>
      <a-row :gutter="12">
        <a-col :span="8"><a-form-item label="主体类型"><a-select v-model="providerAccountForm.type" :options="providerTypeOptions" /></a-form-item></a-col>
        <a-col :span="8"><a-form-item label="名称/联系人" required><a-input v-model="providerAccountForm.name" /></a-form-item></a-col>
        <a-col :span="8"><a-form-item label="申请手机号" required><a-input v-model="providerAccountForm.phone" /></a-form-item></a-col>
      </a-row>
      <a-form-item label="联系地址" required><a-textarea v-model="providerAccountForm.address" :auto-size="{ minRows: 2, maxRows: 4 }" /></a-form-item>
      <a-form-item label="主营产品/服务" required><a-textarea v-model="providerAccountForm.intro" :auto-size="{ minRows: 3, maxRows: 6 }" /></a-form-item>
      <a-alert type="info" style="margin: 6px 0 16px">申请编号：{{ providerApproveTarget.id }} 提交时间：{{ providerApproveTarget.submittedAt || '—' }}</a-alert>

      <a-divider orientation="left">合作资料</a-divider>
      <a-row :gutter="12">
        <a-col :span="12"><a-form-item label="商户名称" required><a-input v-model="providerAccountForm.shopName" /></a-form-item></a-col>
        <a-col :span="12"><a-form-item label="合作方式" required><a-input v-model="providerAccountForm.cooperationMode" placeholder="例如：平台代运营、商家自营、佣金合作" /></a-form-item></a-col>
      </a-row>
      <a-row :gutter="12">
        <a-col :span="8"><a-form-item label="合作联系人" required><a-input v-model="providerAccountForm.contactName" /></a-form-item></a-col>
        <a-col :span="8"><a-form-item label="联系电话" required><a-input v-model="providerAccountForm.contactPhone" /></a-form-item></a-col>
        <a-col :span="8"><a-form-item label="联系微信"><a-input v-model="providerAccountForm.contactWechat" /></a-form-item></a-col>
      </a-row>
      <a-row :gutter="12">
        <a-col :span="12"><a-form-item label="合作开始日期"><a-input v-model="providerAccountForm.cooperationStartAt" placeholder="YYYY-MM-DD" /></a-form-item></a-col>
        <a-col :span="12"><a-form-item label="合作结束日期"><a-input v-model="providerAccountForm.cooperationEndAt" placeholder="YYYY-MM-DD或长期" /></a-form-item></a-col>
      </a-row>
      <a-form-item label="合作内容" required><a-textarea v-model="providerAccountForm.cooperationContent" :auto-size="{ minRows: 3, maxRows: 6 }" placeholder="记录合作商品、活动、课程、结算方式等内容" /></a-form-item>
      <a-form-item label="合作备注"><a-textarea v-model="providerAccountForm.cooperationRemark" :auto-size="{ minRows: 2, maxRows: 4 }" /></a-form-item>

      <a-divider orientation="left">商户后台账号</a-divider>
      <a-row :gutter="12">
        <a-col :span="12"><a-form-item label="登录账号" required><a-input v-model="providerAccountForm.username" placeholder="4-24位字母、数字或下划线" /></a-form-item></a-col>
        <a-col :span="12"><a-form-item label="临时密码" required><a-input v-model="providerAccountForm.password" /></a-form-item></a-col>
      </a-row>
      <a-alert v-if="providerApproveTarget.status === '待审核'" type="warning">通过后请将登录账号和临时密码告知申请人。服务端只保存加盐后的密码摘要。</a-alert>
    </a-form>
    <template #footer>
      <a-button @click="providerApproveTarget = null">关闭</a-button>
      <template v-if="providerApproveTarget.status === '待审核'">
        <a-button status="danger" @click="rejectProvider(providerApproveTarget.id)">拒绝</a-button>
        <a-button type="primary" @click="submitProviderApproval">确认通过并开通</a-button>
      </template>
    </template>
  </a-modal>

  <a-modal
    v-if="activityForm"
    :visible="true"
    :title="activityForm.id ? '编辑活动' : '新建活动'"
    :width="1120"
    class="admin-editor-modal listing-editor-modal"
    @cancel="activityForm = null"
  >
    <a-form :model="activityForm" layout="vertical">
      <div class="listing-editor-layout">
        <aside class="listing-editor-sidebar">
          <div class="editor-progress-card">
            <div class="editor-progress-head"><strong>信息完整度</strong><span>{{ editorProgress('activity') }}%</span></div>
            <a-progress :percent="editorProgress('activity') / 100" :show-text="false" size="small" />
            <div class="editor-progress-tip">信息越完整，用户越容易理解并报名</div>
          </div>
          <button v-for="(section, index) in activityEditorSections" :key="section.key" type="button" class="editor-step" @click="scrollEditorSection('activity', section.key)">
            <span class="editor-step-index" :class="{ done: editorSectionDone('activity', section.key) }">{{ editorSectionDone('activity', section.key) ? '✓' : index + 1 }}</span>
            <span><strong>{{ section.label }}</strong><small>{{ section.hint }}</small></span>
          </button>
          <div class="editor-help-card"><strong>发布建议</strong><span>先完成基础信息，再配置场次与履约方式，最后补充详情内容。</span></div>
        </aside>
        <main class="listing-editor-main">
          <section id="activity-editor-basic" class="listing-section">
            <div class="listing-section-head"><div><span class="listing-section-index">01</span><strong>基础信息</strong></div><p>设置用户第一眼看到的标题、图片和活动分类</p></div>
      <a-form-item label="发布归属">
        <a-radio-group v-model="activityForm.publisherType" type="button">
          <a-radio value="platform">岁悦里平台</a-radio>
          <a-radio value="merchant">商家</a-radio>
        </a-radio-group>
      </a-form-item>
      <a-form-item v-if="activityForm.publisherType === 'merchant'" label="所属商家">
        <a-select v-model="activityForm.managerId" :options="managerOptions" allow-search placeholder="请选择商家" />
      </a-form-item>
      <a-form-item label="标题" required><a-input v-model="activityForm.title" :max-length="60" show-word-limit placeholder="建议填写品类、核心卖点与适用人群" /></a-form-item>
      <a-form-item label="活动封面图片">
        <div class="activity-cover-upload">
          <img v-if="activityForm.coverImage" class="activity-cover-preview" :src="qrPreviewUrl(activityForm.coverImage)" alt="活动封面" />
          <div v-else class="activity-cover-empty">未上传时使用分类默认图</div>
          <input ref="activityCoverInput" type="file" accept="image/png,image/jpeg,image/webp" hidden @change="uploadActivityCover" />
          <a-space>
            <a-button type="primary" :loading="activityCoverUploading" @click="chooseActivityCover">上传图片</a-button>
            <a-button v-if="activityForm.coverImage" @click="activityForm.coverImage = ''">恢复默认图</a-button>
          </a-space>
          <div class="muted activity-cover-tip">支持 PNG、JPG、WebP，大小不超过 2MB，建议比例 16:9。</div>
        </div>
      </a-form-item>
      <a-row :gutter="12">
        <a-col :span="12"><a-form-item label="分类"><a-select v-model="activityForm.category" :options="categoryOptions" /></a-form-item></a-col>
        <a-col :span="12"><a-form-item label="适用地区（可多选）"><a-select v-model="activityForm.regionIds" :options="enabledRegionOptions" multiple allow-search allow-clear placeholder="不选表示线上/全国" /></a-form-item></a-col>
      </a-row>
      <a-form-item label="地址"><a-input v-model="activityForm.address" /></a-form-item>
          </section>

          <section id="activity-editor-sales" class="listing-section">
            <div class="listing-section-head"><div><span class="listing-section-index">02</span><strong>销售设置</strong></div><p>配置价格、成团规则、购买方式和发布状态</p></div>
      <a-row :gutter="12">
        <a-col :span="12"><a-form-item label="会员价"><a-input-number v-model="activityForm.memberPrice" :min="0.01" :step="0.01" :precision="2" style="width: 100%" /></a-form-item></a-col>
        <a-col :span="12"><a-form-item label="非会员价"><a-input-number v-model="activityForm.price" :min="0.01" :step="0.01" :precision="2" style="width: 100%" /></a-form-item></a-col>
      </a-row>
      <a-row :gutter="12">
        <a-col :span="12"><a-form-item label="最低成团人数"><a-input-number v-model="activityForm.minGroup" :min="0" style="width: 100%" /></a-form-item></a-col>
        <a-col :span="12"><a-form-item label="商品级分佣比例（%）"><a-input-number v-model="activityForm.managerCommissionRate" :min="0" :max="100" style="width: 100%" placeholder="留空用全局" /></a-form-item></a-col>
      </a-row>
      <a-row :gutter="12">
        <a-col :span="12">
          <a-form-item label="已购买人数来源">
            <a-radio-group v-model="activityForm.soldCountMode" type="button">
              <a-radio value="actual">按有效订单自动统计</a-radio>
              <a-radio value="manual">人工设置</a-radio>
            </a-radio-group>
          </a-form-item>
        </a-col>
        <a-col v-if="activityForm.soldCountMode === 'manual'" :span="12"><a-form-item label="人工已购买人数"><a-input-number v-model="activityForm.manualSoldCount" :min="0" style="width: 100%" /></a-form-item></a-col>
        <a-col v-else :span="12"><a-form-item label="当前有效订单人数"><a-input :model-value="String(activityForm.actualSoldCount || 0)" disabled /></a-form-item></a-col>
      </a-row>
      <a-row :gutter="12">
        <a-col :span="8"><a-form-item label="状态"><a-select v-model="activityForm.status" :options="publishOptions" /></a-form-item></a-col>
        <a-col :span="8"><a-form-item label="购买方式"><a-select v-model="activityForm.sellType" :options="sellTypeOptions" /></a-form-item></a-col>
        <a-col :span="8"><a-form-item label="规格称谓"><a-input v-model="activityForm.skuLabel" placeholder="如：场地 / 房型 / 规格" /></a-form-item></a-col>
      </a-row>
          </section>

          <section id="activity-editor-fulfillment" class="listing-section">
            <div class="listing-section-head"><div><span class="listing-section-index">03</span><strong>预约与履约</strong></div><p>活动订单将根据履约方式进入待签到、待核销或待使用</p></div>
      <a-row :gutter="12">
        <a-col :span="12"><a-form-item label="履约与核销方式"><a-select v-model="activityForm.serviceMode" :options="serviceModeOptions" /></a-form-item></a-col>
        <a-col :span="12"><a-form-item label="服务说明"><a-input v-model="activityForm.serviceDescription" placeholder="留空时使用所选方式的默认说明" /></a-form-item></a-col>
      </a-row>
      <a-form-item label="退改规则">
        <div class="refund-rule-editor">
          <a-select v-model="activityForm.refundRule.type" :options="refundRuleTypeOptions" />
          <a-row v-if="activityForm.refundRule.type === 'day'" :gutter="12">
            <a-col :span="8"><a-form-item label="全额退款 截止天数"><a-input-number v-model="activityForm.refundRule.fullDays" :min="0" style="width: 100%" /></a-form-item></a-col>
            <a-col :span="8"><a-form-item label="部分退款 截止天数"><a-input-number v-model="activityForm.refundRule.partialDays" :min="0" style="width: 100%" /></a-form-item></a-col>
            <a-col :span="8"><a-form-item label="部分退款比例（%）"><a-input-number v-model="activityForm.refundRule.partialRatePercent" :min="0" :max="100" style="width: 100%" /></a-form-item></a-col>
          </a-row>
          <template v-else-if="activityForm.refundRule.type === 'ladder'">
            <div v-for="(item, index) in activityRefundLadder" :key="index" class="refund-ladder-row">
              <span>活动开始前</span>
              <a-input-number v-model="item.days" :min="0" />
              <span>天，可退款</span>
              <a-input-number v-model="item.ratePercent" :min="0" :max="100" />
              <span>%</span>
              <a-button type="text" status="danger" @click="removeRefundLadderRow(index)">删除</a-button>
            </div>
            <a-button type="outline" long @click="addRefundLadderRow">新增阶梯</a-button>
          </template>
          <div v-else class="muted refund-rule-tip">
            {{ activityForm.refundRule.type === 'always' ? '订单在核销或完成前可申请全额退款。' : '小程序将明确展示该活动不支持退款。' }}
          </div>
        </div>
      </a-form-item>
      <a-form-item v-if="activityForm.sellType === 'date'" label="预约日期和时间">
        <div class="schedule-editor">
          <div v-if="!activitySchedules.length" class="schedule-empty">暂无场次，请点击下方按钮添加预约日期</div>
          <div v-for="(schedule, index) in activitySchedules" :key="schedule.id || index" class="schedule-row">
            <div class="schedule-field schedule-date-field">
              <span>日期</span>
              <a-date-picker v-model="schedule.full" value-format="YYYY-MM-DD" :disabled-date="disablePastActivityDate" placeholder="选择今天或未来日期" style="width: 100%" />
            </div>
            <div class="schedule-field">
              <span>开始时间</span>
              <a-time-picker v-model="schedule.startTime" format="HH:mm" placeholder="开始时间" style="width: 100%" />
            </div>
            <div class="schedule-field">
              <span>结束时间</span>
              <a-time-picker v-model="schedule.endTime" format="HH:mm" placeholder="结束时间" style="width: 100%" />
            </div>
            <div class="schedule-field schedule-quota-field">
              <span>名额</span>
              <a-input-number v-model="schedule.totalQuota" :min="0" style="width: 100%" />
            </div>
            <a-button status="danger" type="text" class="schedule-remove" @click="removeActivitySchedule(index)">删除</a-button>
            <div v-if="schedule.originalTime && !schedule.startTime && !schedule.endTime" class="schedule-original-time">
              原时间内容：{{ schedule.originalTime }}。如需修改，请手动选择开始和结束时间。
            </div>
            <div v-if="schedule.soldQuota" class="schedule-sold">已报名 {{ schedule.soldQuota }} 人</div>
          </div>
          <a-button type="outline" long @click="addActivitySchedule">新增预约场次</a-button>
        </div>
      </a-form-item>
      <a-form-item v-if="activityForm.sellType === 'sku'" :label="activityForm.skuLabel || '活动规格'">
        <div class="product-sku-editor">
          <div class="editor-table-head"><span>规格名称</span><span>会员价</span><span>非会员价</span><span>名额</span><span>标记</span><span>操作</span></div>
          <div v-if="!activitySkus.length" class="schedule-empty">暂无规格，请添加场地、房型或套餐选项。</div>
          <div v-for="(sku, index) in activitySkus" :key="sku.id || index" class="product-sku-row activity-sku-row">
            <a-input v-model="sku.name" placeholder="如：天河场 / 标间" />
            <a-input-number v-model="sku.memberPrice" :min="0.01" :step="0.01" :precision="2" placeholder="会员价" />
            <a-input-number v-model="sku.price" :min="0.01" :step="0.01" :precision="2" placeholder="非会员价" />
            <a-input-number v-model="sku.stock" :min="0" placeholder="名额" />
            <a-checkbox v-model="sku.hot">推荐</a-checkbox>
            <a-button type="text" status="danger" @click="removeActivitySku(index)">删除</a-button>
            <a-input v-model="sku.district" placeholder="区域（可选）" />
            <a-input v-model="sku.address" placeholder="活动场地详细地址" class="product-sku-address" />
          </div>
          <a-button type="outline" long @click="addActivitySku">新增活动规格</a-button>
        </div>
      </a-form-item>
          </section>

          <section id="activity-editor-detail" class="listing-section">
            <div class="listing-section-head"><div><span class="listing-section-index">04</span><strong>活动详情</strong></div><p>按展示顺序添加文字、图片和视频内容</p></div>
      <a-form-item label="活动详情编辑器">
        <div class="detail-block-editor">
          <div v-if="!activityDetailBlocks.length" class="schedule-empty">暂无详情内容，请添加文字、图片或视频。</div>
          <div v-for="(block, index) in activityDetailBlocks" :key="index" class="detail-block-row">
            <div class="detail-block-head">
              <a-tag :color="block.type === 'text' ? 'arcoblue' : block.type === 'image' ? 'green' : 'purple'">
                {{ block.type === 'text' ? '文字' : block.type === 'image' ? '图片' : '视频' }}
              </a-tag>
              <a-space :size="4">
                <a-button type="text" size="mini" :disabled="index === 0" @click="moveActivityDetailBlock(index, -1)">上移</a-button>
                <a-button type="text" size="mini" :disabled="index === activityDetailBlocks.length - 1" @click="moveActivityDetailBlock(index, 1)">下移</a-button>
                <a-button type="text" size="mini" status="danger" @click="removeActivityDetailBlock(index)">删除</a-button>
              </a-space>
            </div>
            <a-textarea v-if="block.type === 'text'" v-model="block.text" :auto-size="{ minRows: 3, maxRows: 10 }" placeholder="输入活动介绍文字" />
            <template v-else-if="block.type === 'image'">
              <img v-if="block.src" class="detail-block-image" :src="qrPreviewUrl(block.src)" alt="详情图片预览" />
              <a-input v-model="block.src" placeholder="图片地址，或使用下方按钮上传" />
              <a-input v-model="block.caption" placeholder="图片说明（可选）" />
              <label class="detail-upload-button">
                <input type="file" accept="image/png,image/jpeg,image/webp" hidden @change="uploadActivityDetailImage($event, index)" />
                <a-button type="outline" size="small" :loading="activityDetailUploading[index]" @click.prevent="$event.currentTarget.parentElement.querySelector('input').click()">上传图片</a-button>
              </label>
            </template>
            <template v-else>
              <video v-if="block.url" class="detail-block-video" :src="qrPreviewUrl(block.url)" controls preload="metadata"></video>
              <a-input v-model="block.url" placeholder="视频地址，或使用下方按钮上传本地视频" />
              <a-input v-model="block.caption" placeholder="视频说明（可选）" />
              <label class="detail-upload-button">
                <input type="file" accept="video/mp4,video/webm" hidden @change="uploadDetailVideo($event, 'activity', index)" />
                <a-button type="outline" size="small" :loading="activityDetailUploading[index]" @click.prevent="$event.currentTarget.parentElement.querySelector('input').click()">上传本地视频</a-button>
              </label>
            </template>
          </div>
          <a-space>
            <a-button type="outline" @click="addActivityDetailBlock('text')">添加文字</a-button>
            <a-button type="outline" @click="addActivityDetailBlock('image')">添加图片</a-button>
            <a-button type="outline" @click="addActivityDetailBlock('video')">添加视频</a-button>
          </a-space>
        </div>
      </a-form-item>
          </section>
        </main>
      </div>
    </a-form>
    <template #footer>
      <a-button @click="activityForm = null">取消</a-button>
      <a-button type="primary" @click="saveActivity">保存活动</a-button>
    </template>
  </a-modal>

  <a-modal
    v-if="productForm"
    :visible="true"
    :title="productForm.id ? '编辑商品' : '新建商品'"
    :width="1120"
    class="admin-editor-modal listing-editor-modal"
    @cancel="productForm = null"
  >
    <a-form :model="productForm" layout="vertical">
      <div class="listing-editor-layout">
        <aside class="listing-editor-sidebar">
          <div class="editor-progress-card">
            <div class="editor-progress-head"><strong>信息完整度</strong><span>{{ editorProgress('product') }}%</span></div>
            <a-progress :percent="editorProgress('product') / 100" :show-text="false" size="small" />
            <div class="editor-progress-tip">完整填写图片、价格和规格有助于用户快速决策</div>
          </div>
          <button v-for="(section, index) in productEditorSections" :key="section.key" type="button" class="editor-step" @click="scrollEditorSection('product', section.key)">
            <span class="editor-step-index" :class="{ done: editorSectionDone('product', section.key) }">{{ editorSectionDone('product', section.key) ? '✓' : index + 1 }}</span>
            <span><strong>{{ section.label }}</strong><small>{{ section.hint }}</small></span>
          </button>
          <div class="editor-help-card"><strong>商品发布建议</strong><span>建议上传清晰主图，并为每个规格单独填写价格和库存。</span></div>
        </aside>
        <main class="listing-editor-main">
          <section id="product-editor-basic" class="listing-section">
            <div class="listing-section-head"><div><span class="listing-section-index">01</span><strong>基础信息</strong></div><p>设置商品标题、主图、分类和销售区域</p></div>
      <a-form-item label="发布归属">
        <a-radio-group v-model="productForm.publisherType" type="button"><a-radio value="platform">岁悦里平台</a-radio><a-radio value="merchant">商家</a-radio></a-radio-group>
      </a-form-item>
      <a-form-item v-if="productForm.publisherType === 'merchant'" label="所属商家"><a-select v-model="productForm.managerId" :options="managerOptions" allow-search placeholder="请选择商家" /></a-form-item>
      <a-form-item label="标题" required><a-input v-model="productForm.title" :max-length="60" show-word-limit placeholder="建议填写品牌、品名、规格与核心卖点" /></a-form-item>
      <a-form-item label="商品展示图" required>
        <div class="product-gallery-uploader">
          <div class="product-gallery-grid">
            <div v-for="(image, index) in productImages" :key="image.id || image.src" class="product-gallery-item">
              <img :src="qrPreviewUrl(image.src)" :alt="`商品展示图${index + 1}`" />
              <span v-if="index === 0" class="product-gallery-main">主图</span>
              <div class="product-gallery-actions">
                <button type="button" :disabled="index === 0" title="向前移动" @click="moveProductImage(index, -1)">‹</button>
                <button type="button" :disabled="index === productImages.length - 1" title="向后移动" @click="moveProductImage(index, 1)">›</button>
                <button type="button" title="删除图片" @click="removeProductImage(index)">×</button>
              </div>
            </div>
            <button v-if="productImages.length < 9" type="button" class="product-gallery-add" :disabled="productImagesUploading" @click="chooseProductImages">
              <span>{{ productImagesUploading ? '上传中' : '+' }}</span>
              <small>{{ productImagesUploading ? '请稍候' : '添加图片' }}</small>
            </button>
          </div>
          <input ref="productGalleryInput" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden @change="uploadProductImages" />
          <div class="product-gallery-tip"><span>第一张作为商品主图，可使用箭头调整顺序</span><strong>{{ productImages.length }}/9</strong></div>
          <div class="muted activity-cover-tip">至少上传1张，最多9张；支持 PNG、JPG、WebP，每张不超过2MB。</div>
        </div>
      </a-form-item>
      <a-row :gutter="12">
        <a-col :span="12"><a-form-item label="分类"><a-select v-model="productForm.category" :options="productCategoryOptions" /></a-form-item></a-col>
        <a-col :span="12"><a-form-item label="库存"><a-input-number v-model="productForm.stock" :min="0" style="width: 100%" /></a-form-item></a-col>
      </a-row>
      <a-form-item label="适用地区（可多选）">
        <a-select v-model="productForm.regionIds" :options="enabledRegionOptions" multiple allow-search allow-clear placeholder="不选表示全国/不限制地区" />
      </a-form-item>
      <a-form-item label="商品亮点"><a-input v-model="productForm.highlight" placeholder="一句话说明商品最核心的卖点" /></a-form-item>
          </section>

          <section id="product-editor-sales" class="listing-section">
            <div class="listing-section-head"><div><span class="listing-section-index">02</span><strong>销售信息</strong></div><p>配置售价、库存、销量展示和上架状态</p></div>
      <a-row :gutter="12">
        <a-col :span="8"><a-form-item label="会员价"><a-input-number v-model="productForm.memberPrice" :min="0.01" :step="0.01" :precision="2" style="width: 100%" /></a-form-item></a-col>
        <a-col :span="8"><a-form-item label="非会员价"><a-input-number v-model="productForm.price" :min="0.01" :step="0.01" :precision="2" style="width: 100%" /></a-form-item></a-col>
        <a-col :span="8"><a-form-item label="原价"><a-input-number v-model="productForm.originalPrice" :min="0" style="width: 100%" /></a-form-item></a-col>
      </a-row>
      <a-row :gutter="12">
        <a-col :span="12"><a-form-item label="已购买人数来源"><a-radio-group v-model="productForm.soldCountMode" type="button"><a-radio value="actual">按有效订单自动统计</a-radio><a-radio value="manual">人工设置</a-radio></a-radio-group></a-form-item></a-col>
        <a-col v-if="productForm.soldCountMode === 'manual'" :span="12"><a-form-item label="人工已购买人数"><a-input-number v-model="productForm.manualSoldCount" :min="0" style="width:100%" /></a-form-item></a-col>
        <a-col v-else :span="12"><a-form-item label="当前有效订单人数"><a-input :model-value="String(productForm.actualSoldCount || 0)" disabled /></a-form-item></a-col>
      </a-row>
      <a-row :gutter="12">
        <a-col :span="12"><a-form-item label="封面 emoji"><a-input v-model="productForm.cover" /></a-form-item></a-col>
        <a-col :span="12"><a-form-item label="封面渐变"><a-input v-model="productForm.coverTone" /></a-form-item></a-col>
      </a-row>
      <a-form-item label="状态"><a-select v-model="productForm.status" :options="publishOptions" /></a-form-item>
          </section>

          <section id="product-editor-fulfillment" class="listing-section">
            <div class="listing-section-head"><div><span class="listing-section-index">03</span><strong>履约与售后</strong></div><p>选择物流配送、到店核销或其他服务方式</p></div>
      <a-row :gutter="12">
        <a-col :span="12"><a-form-item label="履约与核销方式"><a-select v-model="productForm.serviceMode" :options="serviceModeOptions" /></a-form-item></a-col>
        <a-col :span="12"><a-form-item label="服务说明"><a-input v-model="productForm.serviceDescription" placeholder="留空时使用默认说明" /></a-form-item></a-col>
      </a-row>
      <a-form-item label="退改规则">
        <div class="refund-rule-editor">
          <a-select v-model="productForm.refundRule.type" :options="refundRuleTypeOptions" />
          <a-row v-if="productForm.refundRule.type === 'day'" :gutter="12">
            <a-col :span="8"><a-form-item label="全额退款 截止天数"><a-input-number v-model="productForm.refundRule.fullDays" :min="0" style="width:100%" /></a-form-item></a-col>
            <a-col :span="8"><a-form-item label="部分退款 截止天数"><a-input-number v-model="productForm.refundRule.partialDays" :min="0" style="width:100%" /></a-form-item></a-col>
            <a-col :span="8"><a-form-item label="部分退款比例（%）"><a-input-number v-model="productForm.refundRule.partialRatePercent" :min="0" :max="100" style="width:100%" /></a-form-item></a-col>
          </a-row>
          <template v-else-if="productForm.refundRule.type === 'ladder'">
            <div v-for="(item, index) in productRefundLadder" :key="index" class="refund-ladder-row"><span>收货或服务前</span><a-input-number v-model="item.days" :min="0" /><span>天，可退款</span><a-input-number v-model="item.ratePercent" :min="0" :max="100" /><span>%</span><a-button type="text" status="danger" @click="removeProductRefundLadderRow(index)">删除</a-button></div>
            <a-button type="outline" long @click="addProductRefundLadderRow">新增阶梯</a-button>
          </template>
          <div v-else class="muted refund-rule-tip">{{ productForm.refundRule.type === 'always' ? '核销或完成前可申请全额退款。' : '小程序将明确展示该商品不支持退款。' }}</div>
        </div>
      </a-form-item>
          </section>

          <section id="product-editor-variants" class="listing-section">
            <div class="listing-section-head"><div><span class="listing-section-index">04</span><strong>商品规格</strong></div><p>像卖家中心一样逐行维护规格价格与库存</p></div>
      <a-form-item label="商品规格">
        <div class="product-sku-editor">
          <div class="editor-table-head"><span>规格名称</span><span>会员价</span><span>非会员价</span><span>库存</span><span>标记</span><span>操作</span></div>
          <div v-if="!productSkus.length" class="schedule-empty">暂无规格；没有规格时直接按商品价格和库存销售。</div>
          <div v-for="(sku, index) in productSkus" :key="sku.id || index" class="product-sku-row">
            <a-input v-model="sku.name" placeholder="规格名称，如 500ml 白色" />
            <a-input-number v-model="sku.memberPrice" :min="0.01" :step="0.01" :precision="2" placeholder="会员价" />
            <a-input-number v-model="sku.price" :min="0.01" :step="0.01" :precision="2" placeholder="非会员价" />
            <a-input-number v-model="sku.stock" :min="0" placeholder="库存" />
            <a-checkbox v-model="sku.hot">热销</a-checkbox>
            <a-button type="text" status="danger" @click="removeProductSku(index)">删除</a-button>
            <a-input v-model="sku.district" placeholder="区域（可选）" />
            <a-input v-model="sku.address" placeholder="场地或交付地址（可选）" class="product-sku-address" />
          </div>
          <a-button type="outline" long @click="addProductSku">新增规格</a-button>
        </div>
      </a-form-item>
          </section>

          <section id="product-editor-detail" class="listing-section">
            <div class="listing-section-head"><div><span class="listing-section-index">05</span><strong>商品详情</strong></div><p>按展示顺序组合文字、图片和视频内容</p></div>
      <a-form-item label="商品详情编辑器">
        <div class="detail-block-editor">
          <div v-if="!productDetailBlocks.length" class="schedule-empty">暂无详情内容，请添加文字、图片或视频。</div>
          <div v-for="(block, index) in productDetailBlocks" :key="index" class="detail-block-row">
            <div class="detail-block-head">
              <a-tag :color="block.type === 'text' ? 'arcoblue' : block.type === 'image' ? 'green' : 'purple'">{{ block.type === 'text' ? '文字' : block.type === 'image' ? '图片' : '视频' }}</a-tag>
              <a-space :size="4"><a-button type="text" size="mini" :disabled="index === 0" @click="moveProductDetailBlock(index, -1)">上移</a-button><a-button type="text" size="mini" :disabled="index === productDetailBlocks.length - 1" @click="moveProductDetailBlock(index, 1)">下移</a-button><a-button type="text" size="mini" status="danger" @click="removeProductDetailBlock(index)">删除</a-button></a-space>
            </div>
            <a-textarea v-if="block.type === 'text'" v-model="block.text" :auto-size="{ minRows: 3, maxRows: 10 }" placeholder="输入商品详情文字" />
            <template v-else-if="block.type === 'image'">
              <img v-if="block.src" class="detail-block-image" :src="qrPreviewUrl(block.src)" alt="详情图片预览" />
              <a-input v-model="block.src" placeholder="图片地址，或使用下方按钮上传" /><a-input v-model="block.caption" placeholder="图片说明（可选）" />
              <label class="detail-upload-button"><input type="file" accept="image/png,image/jpeg,image/webp" hidden @change="uploadProductDetailImage($event, index)" /><a-button type="outline" size="small" :loading="productDetailUploading[index]" @click.prevent="$event.currentTarget.parentElement.querySelector('input').click()">上传图片</a-button></label>
            </template>
            <template v-else>
              <video v-if="block.url" class="detail-block-video" :src="qrPreviewUrl(block.url)" controls preload="metadata"></video>
              <a-input v-model="block.url" placeholder="视频地址，或使用下方按钮上传本地视频" />
              <a-input v-model="block.caption" placeholder="视频说明（可选）" />
              <label class="detail-upload-button"><input type="file" accept="video/mp4,video/webm" hidden @change="uploadDetailVideo($event, 'product', index)" /><a-button type="outline" size="small" :loading="productDetailUploading[index]" @click.prevent="$event.currentTarget.parentElement.querySelector('input').click()">上传本地视频</a-button></label>
            </template>
          </div>
          <a-space><a-button type="outline" @click="addProductDetailBlock('text')">添加文字</a-button><a-button type="outline" @click="addProductDetailBlock('image')">添加图片</a-button><a-button type="outline" @click="addProductDetailBlock('video')">添加视频</a-button></a-space>
        </div>
      </a-form-item>
          </section>
        </main>
      </div>
    </a-form>
    <template #footer>
      <a-button @click="productForm = null">取消</a-button>
      <a-button type="primary" @click="saveProduct">保存商品</a-button>
    </template>
  </a-modal>

  <a-modal v-if="pointProductForm" :visible="true" :title="pointProductForm.id ? '编辑积分商品' : '新建积分商品'" :width="620" class="admin-editor-modal" @cancel="pointProductForm = null">
    <a-form :model="pointProductForm" layout="vertical">
      <a-form-item label="商品名称" required><a-input v-model="pointProductForm.title" placeholder="例如：岁悦里定制保温杯" /></a-form-item>
      <a-form-item label="商品封面">
        <div class="activity-cover-upload">
          <img v-if="pointProductForm.coverImage" class="activity-cover-preview" :src="qrPreviewUrl(pointProductForm.coverImage)" alt="积分商品封面" />
          <div v-else class="activity-cover-empty">请上传商品图片</div>
          <input ref="pointCoverInput" type="file" accept="image/png,image/jpeg,image/webp" hidden @change="uploadPointCover" />
          <a-space><a-button type="primary" :loading="pointCoverUploading" @click="choosePointCover">上传图片</a-button><a-button v-if="pointProductForm.coverImage" @click="pointProductForm.coverImage = ''">移除图片</a-button></a-space>
          <div class="muted activity-cover-tip">支持 PNG、JPG、WebP，不超过 2MB，建议使用正方形商品图。</div>
        </div>
      </a-form-item>
      <a-row :gutter="12">
        <a-col :span="8"><a-form-item label="兑换积分" required><a-input-number v-model="pointProductForm.pointsCost" :min="1" :precision="0" style="width:100%" /></a-form-item></a-col>
        <a-col :span="8"><a-form-item label="库存" required><a-input-number v-model="pointProductForm.stock" :min="0" :precision="0" style="width:100%" /></a-form-item></a-col>
        <a-col :span="8"><a-form-item label="每人限兑" required><a-input-number v-model="pointProductForm.limitPerUser" :min="1" :precision="0" style="width:100%" /></a-form-item></a-col>
      </a-row>
      <a-form-item label="商品说明"><a-textarea v-model="pointProductForm.description" :auto-size="{ minRows: 3, maxRows: 8 }" placeholder="规格、材质、配送范围等说明" /></a-form-item>
      <a-form-item label="状态"><a-select v-model="pointProductForm.status" :options="publishOptions" /></a-form-item>
    </a-form>
    <template #footer><a-button @click="pointProductForm = null">取消</a-button><a-button type="primary" @click="savePointProduct">保存</a-button></template>
  </a-modal>

  <a-modal v-if="liveForm" :visible="true" :title="liveForm.id ? '编辑学堂课程' : '新建学堂课程'" :width="860" class="admin-editor-modal" @cancel="liveForm = null">
    <a-form :model="liveForm" layout="vertical">
      <a-form-item label="所属商家"><a-input :model-value="selectedMerchant ? (selectedMerchant.shopName || selectedMerchant.name) : liveForm.managerId" disabled /></a-form-item>
      <a-form-item label="课程名称"><a-input v-model="liveForm.title" /></a-form-item>
      <a-row :gutter="12">
        <a-col :span="12"><a-form-item label="讲师"><a-input v-model="liveForm.hostName" /></a-form-item></a-col>
        <a-col :span="12"><a-form-item label="课程分类"><a-input v-model="liveForm.category" placeholder="如：健康生活" /></a-form-item></a-col>
      </a-row>
      <a-row :gutter="12">
        <a-col :span="8"><a-form-item label="会员价"><a-input-number v-model="liveForm.memberPrice" :min="0.01" :step="0.01" :precision="2" style="width:100%" /></a-form-item></a-col>
        <a-col :span="8"><a-form-item label="原价"><a-input-number v-model="liveForm.originalPrice" :min="0" style="width:100%" /></a-form-item></a-col>
        <a-col :span="8"><a-form-item label="课时数"><a-input-number v-model="liveForm.lessonCount" :min="1" style="width:100%" /></a-form-item></a-col>
      </a-row>
      <a-row :gutter="12">
        <a-col :span="12"><a-form-item label="状态"><a-select v-model="liveForm.status" :options="[{label:'未开课',value:'scheduled'},{label:'直播中',value:'live'},{label:'已结束',value:'ended'}]" /></a-form-item></a-col>
        <a-col :span="12"><a-form-item label="课程时长"><a-input v-model="liveForm.duration" placeholder="如：约160分钟" /></a-form-item></a-col>
      </a-row>
      <a-form-item label="课程封面">
        <div class="activity-cover-upload">
          <img v-if="liveForm.coverImage" class="activity-cover-preview" :src="qrPreviewUrl(liveForm.coverImage)" alt="课程封面预览" />
          <div v-else class="activity-cover-empty">暂无封面</div>
          <input ref="liveCoverInput" type="file" accept="image/png,image/jpeg,image/webp" hidden @change="uploadLiveCover" />
          <a-input v-model="liveForm.coverImage" placeholder="也可填写 HTTPS 图片地址" />
          <a-space>
            <a-button type="primary" :loading="liveCoverUploading" @click="chooseLiveCover">上传本地图片</a-button>
            <a-button v-if="liveForm.coverImage" @click="liveForm.coverImage = ''">移除封面</a-button>
          </a-space>
          <div class="muted">支持 PNG、JPG、WebP，最大 2MB；建议使用 4:3 横图</div>
        </div>
      </a-form-item>
      <a-form-item label="直播地址"><a-input v-model="liveForm.streamUrl" /></a-form-item>
      <a-form-item label="回放地址"><a-input v-model="liveForm.replayUrl" /></a-form-item>
      <a-form-item label="课程章节">
        <div class="detail-block-editor">
          <div v-if="!liveForm.lessons?.length" class="schedule-empty">暂无章节，可逐节填写外链或上传本地视频。</div>
          <div v-for="(lesson, index) in liveForm.lessons" :key="lesson.id || index" class="detail-block-row">
            <div class="detail-block-head">
              <strong>第 {{ index + 1 }} 节</strong>
              <a-space :size="4">
                <a-button type="text" size="mini" :disabled="index === 0" @click="moveLiveLesson(index, -1)">上移</a-button>
                <a-button type="text" size="mini" :disabled="index === liveForm.lessons.length - 1" @click="moveLiveLesson(index, 1)">下移</a-button>
                <a-button type="text" size="mini" status="danger" @click="removeLiveLesson(index)">删除</a-button>
              </a-space>
            </div>
            <a-row :gutter="12">
              <a-col :span="16"><a-input v-model="lesson.title" placeholder="课节标题" /></a-col>
              <a-col :span="8"><a-input v-model="lesson.duration" placeholder="时长，如 18:40" /></a-col>
            </a-row>
            <video v-if="lesson.videoUrl" class="detail-block-video" :src="qrPreviewUrl(lesson.videoUrl)" controls preload="metadata"></video>
            <a-input v-model="lesson.videoUrl" placeholder="HTTPS 视频、MP4、WebM、MOV、M4V 或 M3U8 地址" />
            <a-space wrap>
              <label class="detail-upload-button">
                <input type="file" accept="video/mp4,video/webm,video/quicktime,video/x-m4v,.mov,.m4v" hidden @change="uploadLiveLessonVideo($event, lesson, index)" />
                <a-button type="outline" size="small" :loading="liveVideoUploading[liveLessonUploadKey(lesson, index)]" @click.prevent="$event.currentTarget.parentElement.querySelector('input').click()">上传本地视频</a-button>
              </label>
              <a-button v-if="lesson.videoUrl" type="text" size="small" status="danger" @click="lesson.videoUrl = ''">移除视频</a-button>
              <span class="muted">支持 MP4、WebM、MOV、M4V，暂不限制文件大小</span>
            </a-space>
            <a-space>
              <a-checkbox v-model="lesson.isPreview">允许未购买用户试看</a-checkbox>
              <span>本节状态</span><a-switch v-model="lesson.status" :checked-value="1" :unchecked-value="0" checked-text="上架" unchecked-text="下架" />
            </a-space>
          </div>
          <a-button type="outline" long @click="addLiveLesson">新增课节</a-button>
        </div>
      </a-form-item>
      <a-form-item label="课程介绍"><a-textarea v-model="liveForm.description" :auto-size="{minRows:3,maxRows:8}" /></a-form-item>
    </a-form>
    <template #footer><a-button @click="liveForm = null">取消</a-button><a-button type="primary" @click="saveLive">保存</a-button></template>
  </a-modal>

  <a-modal
    v-if="regionForm"
    :visible="true"
    class="admin-editor-modal"
    :title="regionForm.id ? '编辑地区' : '新增地区'"
    :width="560"
    @cancel="regionForm = null"
  >
    <a-form :model="regionForm" layout="vertical">
      <a-form-item label="省/自治区/直辖市" required>
        <a-select :model-value="regionForm.provinceCode" :options="provinceOptions" allow-search placeholder="请选择省份" @change="onRegionProvinceChange" />
      </a-form-item>
      <a-form-item label="市/自治州" required>
        <a-select :model-value="regionForm.cityCode" :options="cityOptions" allow-search :disabled="!regionForm.provinceCode" placeholder="请选择城市" @change="onRegionCityChange" />
      </a-form-item>
      <a-form-item label="区/县" required>
        <a-select v-model="regionForm.districtCode" :options="districtOptions" allow-search :disabled="!regionForm.cityCode" placeholder="请选择区县" />
      </a-form-item>
      <a-form-item label="显示排序"><a-input-number v-model="regionForm.sort" :min="0" style="width: 100%" /></a-form-item>
      <a-form-item label="前台显示"><a-switch v-model="regionForm.enabled" /></a-form-item>
    </a-form>
    <template #footer>
      <a-button @click="regionForm = null">取消</a-button>
      <a-button type="primary" @click="saveRegion">保存</a-button>
    </template>
  </a-modal>

  <a-modal
    v-if="shipTarget"
    :visible="true"
    class="admin-editor-modal"
    :title="shipForm.update ? `更新物流：${shipTarget.id}` : `${shipTarget.shipmentScope === 'point' ? '兑换单' : '订单'}发货：${shipTarget.id}`"
    :width="520"
    @cancel="closeShip"
  >
    <a-descriptions :column="1" size="small" bordered style="margin-bottom: 16px">
      <a-descriptions-item label="商品">{{ shipTarget.title || shipTarget.productTitle }}{{ shipTarget.skuName ? ` · ${shipTarget.skuName}` : '' }}</a-descriptions-item>
      <a-descriptions-item label="收件人">
        <template v-if="shipTarget.address">{{ shipTarget.address.name }} {{ shipTarget.address.phone }}</template>
        <span v-else class="muted">无收货地址</span>
      </a-descriptions-item>
      <a-descriptions-item label="收货地址">{{ orderAddressText(shipTarget) || '—' }}</a-descriptions-item>
    </a-descriptions>
    <a-form :model="shipForm" layout="vertical">
      <a-form-item label="配送方式" required>
        <a-radio-group v-model="shipForm.deliveryType" type="button">
          <a-radio value="express">快递发货</a-radio>
          <a-radio value="self">无需物流（线下交付/自提）</a-radio>
        </a-radio-group>
      </a-form-item>
      <a-form-item v-if="shipForm.deliveryType === 'express'" label="快递单号" required>
        <a-input v-model="shipForm.trackingNo" placeholder="输入快递单号，快递鸟将自动识别快递公司" />
        <template #extra>提交后自动识别快递公司并订阅物流轨迹。</template>
      </a-form-item>
      <a-form-item :label="shipForm.deliveryType === 'self' ? '交付/自提信息' : '发货备注（选填）'" :required="shipForm.deliveryType === 'self'">
        <a-input v-model="shipForm.note" :placeholder="shipForm.deliveryType === 'self' ? '请填写交付地点、自提方式或联系说明' : '例如：已电话确认收货时间'" />
      </a-form-item>
    </a-form>
    <template #footer>
      <a-button @click="closeShip">取消</a-button>
      <a-button type="primary" @click="submitShip">{{ shipForm.update ? '保存物流' : '确认发货' }}</a-button>
    </template>
  </a-modal>

  <a-modal
    v-if="customerDetail"
    :visible="true"
    class="admin-editor-modal"
    :title="`会员档案：${customerDetail.customer.name}`"
    :width="1040"
    :footer="false"
    @cancel="closeCustomerDetail"
  >
    <a-alert v-if="customerDetailBinding" type="info" style="margin-bottom: 16px">
      当前查看归属记录：{{ managers.find((manager) => String(manager.id) === String(customerDetailBinding.managerId))?.name || '散客' }}，
      {{ customerDetailBinding.bindTime || '—' }} 至 {{ customerDetailBinding.unbindTime || '当前' }}；
      本归属周期消费 {{ customerDetailBinding.attributionConsumptionCount || 0 }} 次，金额 ¥{{ fmtMoney(customerDetailBinding.attributionConsumptionAmount) }}。
    </a-alert>
    <a-descriptions :column="3" bordered size="small">
      <a-descriptions-item label="会员码">{{ customerDetail.customer.memberId }}</a-descriptions-item>
      <a-descriptions-item label="会员类型">{{ customerDetail.customer.memberType }}</a-descriptions-item>
      <a-descriptions-item label="会员状态">{{ customerDetail.customer.member ? '有效会员' : '非会员' }}</a-descriptions-item>
      <a-descriptions-item label="姓名">{{ customerDetail.customer.name }}</a-descriptions-item>
      <a-descriptions-item label="手机号">{{ customerDetail.customer.phone || '—' }}</a-descriptions-item>
      <a-descriptions-item label="身份证号码">{{ customerDetail.customer.idCard || '—' }}</a-descriptions-item>
      <a-descriptions-item label="生日">{{ customerDetail.customer.birthday || '—' }}</a-descriptions-item>
      <a-descriptions-item label="入会时间">{{ customerDetail.customer.memberSince }}</a-descriptions-item>
      <a-descriptions-item label="有效期">{{ customerDetail.customer.memberExpireAt }}</a-descriptions-item>
      <a-descriptions-item label="累计消费次数">{{ customerDetail.customer.consumptionCount }} 次</a-descriptions-item>
      <a-descriptions-item label="累计消费金额"><span class="num">¥{{ fmtMoney(customerDetail.customer.consumptionAmount) }}</span></a-descriptions-item>
      <a-descriptions-item label="积分/余额">{{ customerDetail.customer.points || 0 }} 分 / ¥{{ fmtMoney(customerDetail.customer.balance) }}</a-descriptions-item>
    </a-descriptions>

    <a-divider orientation="left">订单详情（{{ customerDetail.orders.length }}）</a-divider>
    <a-table :columns="customerOrderColumns" :data="customerDetail.orders" :pagination="false" row-key="id" size="small" :scroll="{ x: 1000 }">
      <template #amount="{ record }"><span class="num">¥{{ fmtMoney(record.payAmount) }}</span></template>
      <template #status="{ record }"><a-tag :color="orderChip(record.status)">{{ record.status }}</a-tag></template>
      <template #manager="{ record }">{{ managers.find((manager) => String(manager.id) === String(record.managerId))?.name || '散客' }}</template>
    </a-table>

    <a-divider orientation="left">课程核销与签到（{{ customerDetail.cards.length }}）</a-divider>
    <a-empty v-if="customerDetail.cards.length === 0" description="暂无课程及签到记录" />
    <a-card v-for="card in customerDetail.cards" :key="card.id" size="small" class="customer-course-card">
      <template #title>{{ card.courseName || card.title }}</template>
      <template #extra>已核销 {{ card.checkedCount }} 次 · 剩余 {{ card.remain }}/{{ card.total }} 次 · 有效期 {{ card.validUntil }}</template>
      <a-table :columns="attendanceColumns" :data="card.attendanceRecords" :pagination="false" row-key="id" size="small">
        <template #type="{ record }">{{ record.checkinType === 'makeup' ? '后台补签' : (record.checkinType === 'self' ? '本人签到' : '历史记录') }}</template>
        <template #status="{ record }"><a-tag :color="record.status === 'checked' ? 'green' : (record.status === 'absent' ? 'red' : 'gray')">{{ record.status === 'checked' ? '已签到' : (record.status === 'absent' ? '缺席' : '待签到') }}</a-tag></template>
      </a-table>
    </a-card>
  </a-modal>

  <a-modal
    v-if="customerForm"
    :visible="true"
    class="admin-editor-modal"
    :title="`编辑用户：${customerForm.name}`"
    :width="720"
    @cancel="customerForm = null"
  >
    <a-form :model="customerForm" layout="vertical">
      <a-row :gutter="12">
        <a-col :span="12"><a-form-item label="姓名"><a-input v-model="customerForm.name" /></a-form-item></a-col>
        <a-col :span="12"><a-form-item label="手机号"><a-input v-model="customerForm.phone" /></a-form-item></a-col>
      </a-row>
      <a-row :gutter="12">
        <a-col :span="16"><a-form-item label="身份证号码"><a-input v-model="customerForm.idCard" :max-length="18" placeholder="15位或18位身份证号码" /></a-form-item></a-col>
        <a-col :span="8"><a-form-item label="生日"><a-input v-model="customerForm.birthday" placeholder="YYYY-MM-DD" /></a-form-item></a-col>
      </a-row>
      <a-row :gutter="12">
        <a-col :span="12"><a-form-item label="会员码编号"><a-input v-model="customerForm.memberId" /></a-form-item></a-col>
        <a-col :span="12"><a-form-item label="会员类型"><a-select v-model="customerForm.memberType" :options="memberTypeOptions" /></a-form-item></a-col>
      </a-row>
      <a-row :gutter="12">
        <a-col :span="12"><a-form-item label="入会时间"><a-input v-model="customerForm.memberSince" placeholder="例如 2026年10月" /></a-form-item></a-col>
        <a-col :span="12"><a-form-item label="有效期"><a-input v-model="customerForm.memberExpireAt" placeholder="例如 长期有效 或 2027-10-08" /></a-form-item></a-col>
      </a-row>
      <a-row :gutter="12">
        <a-col :span="8"><a-form-item label="会员状态"><a-radio-group v-model="customerForm.member" type="button"><a-radio :value="true">会员</a-radio><a-radio :value="false">非会员</a-radio></a-radio-group></a-form-item></a-col>
        <a-col :span="8"><a-form-item label="余额（只读）"><a-input-number v-model="customerForm.balance" disabled style="width: 100%" /></a-form-item></a-col>
        <a-col :span="8"><a-form-item label="积分（只读）"><a-input-number v-model="customerForm.points" disabled style="width: 100%" /></a-form-item></a-col>
      </a-row>
    </a-form>
    <template #footer>
      <a-button @click="customerForm = null">取消</a-button>
      <a-button type="primary" @click="saveCustomer">保存</a-button>
    </template>
  </a-modal>

  <a-modal
    v-if="reviewReplyTarget"
    :visible="true"
    class="admin-editor-modal"
    :title="reviewReplyTarget.reply ? '修改官方回复' : '回复评价'"
    :width="560"
    @cancel="reviewReplyTarget = null"
  >
    <a-descriptions :column="1" bordered size="small" style="margin-bottom: 16px">
      <a-descriptions-item label="评价用户">{{ reviewReplyTarget.name }}</a-descriptions-item>
      <a-descriptions-item label="评价内容">{{ reviewReplyTarget.content || '用户未填写文字评价' }}</a-descriptions-item>
    </a-descriptions>
    <a-textarea v-model="reviewReplyText" :max-length="500" show-word-limit :auto-size="{ minRows: 4, maxRows: 8 }" placeholder="请输入平台或商家回复内容" />
    <template #footer>
      <a-button v-if="reviewReplyTarget.reply" status="danger" @click="removeReviewReply">删除回复</a-button>
      <a-button @click="reviewReplyTarget = null">取消</a-button>
      <a-button type="primary" @click="saveReviewReply">保存回复</a-button>
    </template>
  </a-modal>

  <a-modal
    v-if="couponRecordsTarget"
    :visible="true"
    class="admin-editor-modal"
    :title="`领取记录：${couponRecordsTarget.title}`"
    :width="1050"
    :footer="false"
    @cancel="couponRecordsTarget = null"
  >
    <a-alert type="info" style="margin-bottom: 12px">每一行代表一张会员独立持有的优惠券，使用状态不会影响其他会员。</a-alert>
    <a-table
      :columns="couponRecordColumns"
      :data="couponRecords"
      :loading="couponRecordsLoading"
      :pagination="{ pageSize: 10 }"
      row-key="id"
      :scroll="{ x: 1000 }"
    />
  </a-modal>

  <a-modal
    v-if="couponForm"
    :visible="true"
    class="admin-editor-modal"
    :title="couponForm.id ? '编辑优惠券' : '发布优惠券'"
    :width="620"
    @cancel="couponForm = null"
  >
    <a-form :model="couponForm" layout="vertical">
      <a-form-item label="发布归属" required>
        <a-radio-group v-model="couponForm.publisherType" type="button">
          <a-radio value="platform">岁悦里平台</a-radio>
          <a-radio value="merchant">指定商家</a-radio>
        </a-radio-group>
      </a-form-item>
      <a-form-item v-if="couponForm.publisherType === 'merchant'" label="发布商家" required>
        <a-select v-model="couponForm.managerId" :options="managerOptions" allow-search placeholder="请选择商家" />
      </a-form-item>
      <a-form-item label="标题"><a-input v-model="couponForm.title" /></a-form-item>
      <a-form-item label="说明"><a-input v-model="couponForm.desc" placeholder="例如：全场通用，每位会员限用一次" /></a-form-item>
      <a-form-item label="类型"><a-select v-model="couponForm.type" :options="couponTypeOptions" /></a-form-item>
      <a-row :gutter="12">
        <a-col :span="12"><a-form-item label="面额"><a-input-number v-model="couponForm.value" :min="0" style="width: 100%" /></a-form-item></a-col>
        <a-col :span="12"><a-form-item label="使用门槛"><a-input-number v-model="couponForm.minAmount" :min="0" style="width: 100%" /></a-form-item></a-col>
      </a-row>
      <a-form-item label="适用分类（品类券）"><a-select v-model="couponForm.scopeCategory" :options="scopeCategoryOptions" /></a-form-item>
      <a-form-item label="适用商品 ID（指定商品券）"><a-input v-model="couponForm.scopeProductId" /></a-form-item>
      <a-form-item label="有效期至"><a-input v-model="couponForm.expireAt" /></a-form-item>
      <a-form-item label="发布状态">
        <a-radio-group v-model="couponForm.status" type="button">
          <a-radio :value="1">立即发布</a-radio>
          <a-radio :value="0">暂不上架</a-radio>
        </a-radio-group>
      </a-form-item>
    </a-form>
    <template #footer>
      <a-button @click="couponForm = null">取消</a-button>
      <a-button type="primary" @click="saveCoupon">{{ couponForm.id ? '保存' : '发布' }}</a-button>
    </template>
  </a-modal>

  <a-modal
    v-if="contentForm"
    :visible="true"
    class="admin-editor-modal"
    :title="contentForm.id ? '编辑资讯/视频' : '发布资讯/视频'"
    :width="780"
    @cancel="contentForm = null"
  >
    <a-form :model="contentForm" layout="vertical">
      <a-row :gutter="12">
        <a-col :span="12"><a-form-item label="内容类型"><a-select v-model="contentForm.type" :options="postTypeOptions" /></a-form-item></a-col>
        <a-col :span="12"><a-form-item label="发布日期"><a-input v-model="contentForm.publishedAt" placeholder="YYYY-MM-DD" /></a-form-item></a-col>
      </a-row>
      <a-form-item label="标题" required><a-input v-model="contentForm.title" /></a-form-item>
      <a-form-item label="摘要"><a-textarea v-model="contentForm.summary" :auto-size="{ minRows: 2, maxRows: 4 }" /></a-form-item>
      <a-row :gutter="12">
        <a-col :span="12"><a-form-item label="发布来源"><a-input v-model="contentForm.source" placeholder="例如：广州市人民政府" /></a-form-item></a-col>
        <a-col :span="12"><a-form-item label="原文链接"><a-input v-model="contentForm.originalUrl" placeholder="政府官网原文地址" /></a-form-item></a-col>
      </a-row>
      <a-form-item label="封面图片" required>
        <input ref="contentCoverInput" type="file" accept="image/png,image/jpeg,image/webp" hidden @change="uploadContentCover" />
        <img v-if="contentForm.coverImage" class="detail-block-image" :src="qrPreviewUrl(contentForm.coverImage)" alt="封面预览" />
        <a-input v-model="contentForm.coverImage" placeholder="图片地址，或点击上传图片" />
        <a-space>
          <a-button type="primary" :loading="contentCoverUploading" @click="chooseContentCover">上传封面图片</a-button>
          <a-button v-if="contentForm.coverImage" @click="contentForm.coverImage = ''">移除</a-button>
        </a-space>
        <div class="muted">支持 PNG、JPG、WebP，最大2MB。</div>
      </a-form-item>
      <a-form-item v-if="contentForm.type === 'video'" label="视频地址"><a-input v-model="contentForm.videoUrl" placeholder="HTTPS 视频或 m3u8 地址" /></a-form-item>
      <a-form-item label="图文内容编辑器">
        <div class="detail-block-editor">
          <div v-if="!contentBlocks.length" class="schedule-empty">暂无正文内容，请添加文字、图片、视频或链接。</div>
          <div v-for="(block, index) in contentBlocks" :key="index" class="detail-block-row">
            <div class="detail-block-head">
              <a-tag :color="block.type === 'text' ? 'arcoblue' : block.type === 'image' ? 'green' : block.type === 'video' ? 'purple' : 'orange'">
                {{ block.type === 'text' ? '文字' : block.type === 'image' ? '图片' : block.type === 'video' ? '视频' : '链接' }}
              </a-tag>
              <a-space :size="4">
                <a-button type="text" size="mini" :disabled="index === 0" @click="moveContentBlock(index, -1)">上移</a-button>
                <a-button type="text" size="mini" :disabled="index === contentBlocks.length - 1" @click="moveContentBlock(index, 1)">下移</a-button>
                <a-button type="text" size="mini" status="danger" @click="removeContentBlock(index)">删除</a-button>
              </a-space>
            </div>
            <a-textarea v-if="block.type === 'text'" v-model="block.text" :auto-size="{ minRows: 4, maxRows: 14 }" placeholder="输入文章正文，每个文字区块可作为一个段落" />
            <template v-else-if="block.type === 'image'">
              <img v-if="block.src" class="detail-block-image" :src="qrPreviewUrl(block.src)" alt="正文图片预览" />
              <a-input v-model="block.src" placeholder="图片地址，或点击上传图片" />
              <a-input v-model="block.caption" placeholder="图片说明（可选）" />
              <label class="detail-upload-button">
                <input type="file" accept="image/png,image/jpeg,image/webp" hidden @change="uploadContentBlockImage($event, index)" />
                <a-button type="outline" size="small" :loading="contentBlockUploading[index]" @click.prevent="$event.currentTarget.parentElement.querySelector('input').click()">上传图片</a-button>
              </label>
            </template>
            <template v-else-if="block.type === 'video'">
              <a-input v-model="block.url" placeholder="HTTPS 视频、m3u8 或已上传视频地址" />
              <a-input v-model="block.caption" placeholder="视频说明（可选）" />
            </template>
            <template v-else>
              <a-input v-model="block.title" placeholder="链接标题，例如：查看报名指南" />
              <a-input v-model="block.description" placeholder="链接说明（可选）" />
              <a-input v-model="block.url" placeholder="HTTPS 网址或 /pages/ 开头的小程序页面" />
            </template>
          </div>
          <a-space wrap>
            <a-button type="outline" @click="addContentBlock('text')">插入文字</a-button>
            <a-button type="outline" @click="addContentBlock('image')">插入图片</a-button>
            <a-button type="outline" @click="addContentBlock('video')">插入视频</a-button>
            <a-button type="outline" @click="addContentBlock('link')">插入链接</a-button>
          </a-space>
        </div>
      </a-form-item>
      <a-form-item label="适用地区（可多选）"><a-select v-model="contentForm.regionIds" :options="enabledRegionOptions" multiple allow-search allow-clear placeholder="不选表示全部地区" /></a-form-item>
      <a-row :gutter="12">
        <a-col :span="12"><a-form-item label="首页推荐"><a-switch v-model="contentForm.featured" /></a-form-item></a-col>
        <a-col :span="12"><a-form-item label="状态"><a-select v-model="contentForm.status" :options="publishOptions" /></a-form-item></a-col>
      </a-row>
    </a-form>
    <template #footer><a-button @click="contentForm = null">取消</a-button><a-button type="primary" @click="saveContent">保存</a-button></template>
  </a-modal>

  <a-modal
    v-if="bannerForm"
    :visible="true"
    class="admin-editor-modal"
    :title="bannerForm.id ? '编辑 Banner' : '发布 Banner'"
    :width="680"
    @cancel="bannerForm = null"
  >
    <a-form :model="bannerForm" layout="vertical">
      <a-form-item label="标题" required><a-input v-model="bannerForm.title" /></a-form-item>
      <a-form-item label="副标题"><a-input v-model="bannerForm.sub" /></a-form-item>
      <a-form-item label="媒体类型">
        <a-radio-group v-model="bannerForm.mediaType" type="button">
          <a-radio value="image">图片</a-radio>
          <a-radio value="video">视频</a-radio>
        </a-radio-group>
      </a-form-item>
      <a-form-item label="Banner 媒体" required>
        <input ref="bannerMediaInput" type="file" :accept="bannerForm.mediaType === 'video' ? 'video/mp4,video/webm' : 'image/png,image/jpeg,image/webp'" hidden @change="uploadBannerMedia" />
        <div v-if="bannerForm.mediaUrl" class="banner-media-preview">
          <video v-if="bannerForm.mediaType === 'video'" :src="qrPreviewUrl(bannerForm.mediaUrl)" controls muted />
          <img v-else :src="qrPreviewUrl(bannerForm.mediaUrl)" alt="Banner 预览" />
        </div>
        <a-space>
          <a-button type="primary" :loading="bannerMediaUploading" @click="chooseBannerMedia">上传{{ bannerForm.mediaType === 'video' ? '视频' : '图片' }}</a-button>
          <a-button v-if="bannerForm.mediaUrl" @click="bannerForm.mediaUrl = ''">移除媒体</a-button>
        </a-space>
        <div class="muted">图片支持 PNG/JPG/WebP，最大2MB；视频支持 MP4/WebM，最大15MB。</div>
      </a-form-item>
      <a-form-item label="跳转链接">
        <a-input v-model="bannerForm.linkUrl" placeholder="小程序路径 /pages/detail/detail?id=1 或 HTTPS 链接" />
      </a-form-item>
      <a-row :gutter="12">
        <a-col :span="12"><a-form-item label="排序"><a-input-number v-model="bannerForm.sort" :min="0" style="width: 100%" /></a-form-item></a-col>
        <a-col :span="12"><a-form-item label="发布状态"><a-select v-model="bannerForm.status" :options="publishOptions" /></a-form-item></a-col>
      </a-row>
    </a-form>
    <template #footer>
      <a-button @click="bannerForm = null">取消</a-button>
      <a-button type="primary" @click="saveBanner">{{ bannerForm.id ? '保存' : '发布' }}</a-button>
    </template>
  </a-modal>

  <a-modal
    v-if="rebindTarget"
    :visible="true"
    class="admin-editor-modal"
    :title="`修改归属：${rebindTarget.name}`"
    :width="440"
    @cancel="rebindTarget = null"
  >
    <a-form layout="vertical">
      <a-form-item label="新主理人"><a-select v-model="rebindManagerId" :options="managerOptions" /></a-form-item>
      <a-form-item label="变更原因" required><a-textarea v-model="rebindReason" :auto-size="{ minRows: 3, maxRows: 5 }" placeholder="例如：会员主动申请变更，经客服确认" /></a-form-item>
      <a-alert type="info">归属变更以支付时间为界：变更前已支付的订单及佣金保留在原主理人名下，变更后的新支付计入新主理人。</a-alert>
    </a-form>
    <template #footer>
      <a-button @click="rebindTarget = null">取消</a-button>
      <a-button type="primary" @click="confirmRebind">确认变更</a-button>
    </template>
  </a-modal>

  <a-modal
    v-if="adjustTarget"
    :visible="true"
    class="admin-editor-modal"
    :title="`调整佣金：${adjustTarget.id}`"
    :width="440"
    @cancel="adjustTarget = null"
  >
    <a-form layout="vertical">
      <a-form-item label="调整后金额"><a-input-number v-model="adjustAmount" :min="0" style="width: 100%" /></a-form-item>
      <a-form-item label="调整原因"><a-input v-model="adjustReason" placeholder="必填" /></a-form-item>
    </a-form>
    <template #footer>
      <a-button @click="adjustTarget = null">取消</a-button>
      <a-button type="primary" @click="confirmAdjust">确认调整</a-button>
    </template>
  </a-modal>

  <a-modal
    v-if="categoryForm"
    :visible="true"
    class="admin-editor-modal"
    :title="categoryForm.id ? '编辑分类' : '新建分类'"
    :width="480"
    @cancel="categoryForm = null"
  >
    <a-form :model="categoryForm" layout="vertical">
      <a-form-item label="分类名称"><a-input v-model="categoryForm.name" placeholder="例如：健康资讯" /></a-form-item>
      <a-form-item label="简称"><a-input v-model="categoryForm.short" placeholder="例如：资讯" /></a-form-item>
      <a-form-item label="图标（emoji）"><a-input v-model="categoryForm.emoji" placeholder="例如：📰" /></a-form-item>
      <a-form-item label="主题色"><a-input v-model="categoryForm.color" placeholder="例如：#3b6fa0" /></a-form-item>
      <a-form-item label="内容类型"><a-select v-model="categoryForm.type" :options="contentTypeOptions" /></a-form-item>
      <a-form-item label="首页显示数量">
        <a-input-number v-model="categoryForm.homeDisplayLimit" :min="0" :max="50" :precision="0" style="width: 100%" />
        <template #extra>控制该分类在用户端首页加载的内容数量；0 表示首页隐藏，超出内容可通过“查看全部”进入列表。</template>
      </a-form-item>
    </a-form>
    <template #footer>
      <a-button @click="categoryForm = null">取消</a-button>
      <a-button type="primary" @click="saveCategory">保存</a-button>
    </template>
  </a-modal>

  <a-modal
    :visible="reasonModal.visible"
    class="admin-editor-modal"
    :title="reasonModal.title"
    :width="440"
    :footer="false"
    @cancel="closeReason"
  >
    <a-input
      v-model="reasonValue"
      :placeholder="reasonModal.placeholder"
      @press-enter="submitReason"
    />
    <template #footer>
      <a-button @click="closeReason">取消</a-button>
      <a-button type="primary" @click="submitReason">{{ reasonModal.okText || '确定' }}</a-button>
    </template>
  </a-modal>
</template>

<style scoped>
.login-page {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(160deg, #f6efe6 0%, #ead7bd 100%);
}

.login-card {
  width: 360px;
  padding: 40px 36px 36px;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 18px 50px rgba(55, 44, 31, 0.16);
}

.login-logo {
  width: 60px;
  height: 60px;
  margin: 0 auto 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: linear-gradient(135deg, #c25e3d, #e19a6d);
  color: #fff;
  font-size: 30px;
  font-weight: 700;
}

.login-title {
  text-align: center;
  font-size: 22px;
  font-weight: 700;
  color: #26312f;
}

.login-sub {
  margin: 8px 0 24px;
  text-align: center;
  font-size: 13px;
  color: #7a817f;
}

.login-error {
  margin-bottom: 14px;
  padding: 9px 12px;
  border-radius: 8px;
  background: #ffece8;
  color: #f53f3f;
  font-size: 13px;
}

.layout {
  height: 100vh;
}

.sider {
  background: #fff;
  box-shadow: 1px 0 0 rgba(29, 27, 22, 0.06);
}

.logo {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text-1);
  white-space: nowrap;
  overflow: hidden;
}

.sider-trigger {
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-3);
  cursor: pointer;
  border-top: 1px solid var(--color-fill-3);
}

.topbar {
  height: 56px;
  padding: 0;
  background: #fff;
  border-bottom: 1px solid var(--color-fill-3);
  position: sticky;
  top: 0;
  z-index: 10;
}

.topbar-inner {
  height: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
}

.topbar-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-1);
}

.topbar-spacer {
  flex: 1;
}

.topbar-user {
  color: var(--color-text-2);
  font-size: 14px;
}

.avatar {
  background: var(--primary-6);
}

.notification-panel {
  width: 360px;
}

.notification-head,
.notification-item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.notification-head {
  padding: 2px 4px 12px;
  border-bottom: 1px solid var(--color-fill-3);
}

.notification-head strong {
  font-size: 15px;
}

.notification-head span {
  margin-left: 8px;
  color: var(--color-text-3);
  font-size: 12px;
}

.notification-list {
  max-height: 420px;
  overflow: auto;
}

.notification-item {
  width: 100%;
  padding: 14px 4px;
  border: 0;
  border-bottom: 1px solid var(--color-fill-3);
  background: transparent;
  color: var(--color-text-1);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.notification-item:hover {
  background: var(--color-fill-1);
}

.notification-item-head span {
  color: var(--color-text-3);
  font-size: 12px;
}

.notification-item > strong {
  display: block;
  margin-top: 9px;
  font-size: 14px;
}

.notification-item p {
  margin: 5px 0 0;
  color: var(--color-text-2);
  font-size: 13px;
  line-height: 1.5;
}

.notification-empty {
  padding: 42px 0;
  color: var(--color-text-3);
  text-align: center;
}

.content {
  padding: 16px;
  overflow: auto;
}

.spin {
  width: 100%;
  min-height: 240px;
}

.error {
  margin-bottom: 16px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 16px;
}

.muted {
  color: var(--color-text-3);
  font-size: 13px;
}

.actions-row {
  margin-top: 16px;
}

.activity-cover-upload {
  padding: 14px;
  border: 1px solid var(--color-border-2);
  border-radius: 10px;
  background: var(--color-fill-1);
}

.activity-cover-preview,
.activity-cover-empty {
  width: 280px;
  height: 158px;
  margin-bottom: 12px;
  border-radius: 8px;
  background: var(--color-fill-2);
}

.activity-cover-preview {
  display: block;
  object-fit: cover;
}

.activity-cover-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-3);
}

.activity-cover-tip {
  margin-top: 10px;
}

.product-gallery-uploader {
  width: 100%;
  padding: 14px;
  border: 1px solid var(--color-border-2);
  border-radius: 10px;
  background: var(--color-fill-1);
}

.product-gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
  gap: 12px;
}

.product-gallery-item,
.product-gallery-add {
  position: relative;
  min-height: 126px;
  overflow: hidden;
  border: 1px solid #dfe2e7;
  border-radius: 9px;
  background: #fff;
}

.product-gallery-item img {
  display: block;
  width: 100%;
  height: 126px;
  object-fit: cover;
}

.product-gallery-main {
  position: absolute;
  top: 7px;
  left: 7px;
  padding: 3px 8px;
  border-radius: 999px;
  background: #ee4d2d;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}

.product-gallery-actions {
  position: absolute;
  right: 6px;
  bottom: 6px;
  display: flex;
  gap: 4px;
}

.product-gallery-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 25px;
  height: 25px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: rgba(25, 29, 35, .78);
  color: #fff;
  cursor: pointer;
}

.product-gallery-actions button:disabled {
  opacity: .35;
  cursor: default;
}

.product-gallery-add {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border-style: dashed;
  color: #777f89;
  cursor: pointer;
}

.product-gallery-add span { color: #ee4d2d; font-size: 28px; line-height: 1; }
.product-gallery-add small { font-size: 12px; }

.product-gallery-tip {
  display: flex;
  justify-content: space-between;
  margin-top: 10px;
  color: #8a9099;
  font-size: 12px;
}

.product-gallery-tip strong { color: #ee4d2d; }

.schedule-editor {
  width: 100%;
  padding: 14px;
  border: 1px solid var(--color-border-2);
  border-radius: 10px;
  background: var(--color-fill-1);
}

.detail-block-editor {
  width: 100%;
  padding: 14px;
  border: 1px solid var(--color-border-2);
  border-radius: 10px;
  background: var(--color-fill-1);
}

.detail-block-row {
  display: grid;
  gap: 10px;
  padding: 12px;
  margin-bottom: 12px;
  border: 1px solid var(--color-border-2);
  border-radius: 8px;
  background: var(--color-bg-2);
}

.detail-block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.detail-block-image {
  display: block;
  width: 280px;
  max-height: 180px;
  border-radius: 8px;
  object-fit: cover;
}

.detail-block-video {
  display: block;
  width: min(100%, 480px);
  max-height: 280px;
  border-radius: 8px;
  background: #17191c;
}

.detail-upload-button {
  width: max-content;
}

.refund-rule-editor {
  display: grid;
  width: 100%;
  gap: 14px;
  padding: 14px;
  border: 1px solid var(--color-border-2);
  border-radius: 10px;
  background: var(--color-fill-1);
}

.refund-ladder-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.refund-rule-tip {
  padding: 4px 0;
}

.product-sku-editor {
  width: 100%;
  padding: 14px;
  border: 1px solid var(--color-border-2);
  border-radius: 10px;
  background: var(--color-fill-1);
}

.listing-editor-layout {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  align-items: start;
  gap: 20px;
  padding: 20px;
  background: #f5f6f8;
}

.listing-editor-sidebar {
  position: sticky;
  top: 0;
  display: grid;
  gap: 8px;
}

.editor-progress-card,
.editor-help-card {
  padding: 16px;
  border: 1px solid #e7e9ed;
  border-radius: 10px;
  background: #fff;
}

.editor-progress-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  color: #2d3339;
}

.editor-progress-head span {
  color: #ee4d2d;
  font-size: 13px;
  font-weight: 700;
}

.editor-progress-tip,
.editor-help-card span {
  display: block;
  margin-top: 8px;
  color: #8a9099;
  font-size: 12px;
  line-height: 1.55;
}

.editor-step {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  padding: 12px 14px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: #4e5560;
  text-align: left;
  cursor: pointer;
  transition: all .18s ease;
}

.editor-step:hover {
  border-color: #f0d6cf;
  background: #fff8f6;
  color: #d84326;
}

.editor-step-index {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid #d8dce2;
  border-radius: 50%;
  background: #fff;
  color: #8a9099;
  font-size: 12px;
  font-weight: 700;
}

.editor-step-index.done {
  border-color: #9cc9ad;
  background: #edf8f1;
  color: #328653;
}

.editor-step strong,
.editor-step small {
  display: block;
}

.editor-step strong { font-size: 14px; }
.editor-step small { margin-top: 2px; color: #9ba1aa; font-size: 11px; font-weight: 400; }

.listing-editor-main {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.listing-section {
  scroll-margin-top: 16px;
  padding: 22px 24px 8px;
  border: 1px solid #e7e9ed;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(30, 36, 43, .035);
}

.listing-section-head {
  margin: -2px 0 22px;
  padding-bottom: 15px;
  border-bottom: 1px solid #eef0f2;
}

.listing-section-head > div {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #252b31;
  font-size: 18px;
}

.listing-section-index {
  color: #ee4d2d;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 1px;
}

.listing-section-head p {
  margin: 5px 0 0 30px;
  color: #9298a1;
  font-size: 12px;
}

.editor-table-head {
  display: grid;
  grid-template-columns: minmax(150px, 1.4fr) repeat(3, minmax(90px, 1fr)) auto 48px;
  gap: 10px;
  padding: 0 12px 8px;
  color: #8d939c;
  font-size: 12px;
}

.activity-sku-row .product-sku-address {
  grid-column: span 5;
}

:deep(.listing-editor-modal .arco-modal-body) {
  max-height: 72vh;
  padding: 0;
  background: #f5f6f8;
}

:deep(.listing-editor-modal .arco-modal-footer) {
  padding: 14px 24px;
  border-top: 1px solid #e7e9ed;
  background: #fff;
}

@media (max-width: 900px) {
  .listing-editor-layout { grid-template-columns: 1fr; }
  .listing-editor-sidebar { position: static; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .editor-progress-card, .editor-help-card { grid-column: 1 / -1; }
}

.product-sku-row {
  display: grid;
  grid-template-columns: minmax(150px, 1.4fr) repeat(3, minmax(90px, 1fr)) auto auto;
  gap: 10px;
  align-items: center;
  padding: 12px;
  margin-bottom: 10px;
  border: 1px solid var(--color-border-2);
  border-radius: 8px;
  background: var(--color-bg-2);
}

.product-sku-address {
  grid-column: span 5;
}

.schedule-empty {
  padding: 20px 12px;
  color: var(--color-text-3);
  text-align: center;
}

.schedule-row {
  display: grid;
  grid-template-columns: minmax(150px, 1.35fr) minmax(105px, 1fr) minmax(105px, 1fr) 88px 52px;
  gap: 10px;
  align-items: end;
  padding: 12px;
  margin-bottom: 10px;
  border: 1px solid var(--color-border-2);
  border-radius: 8px;
  background: var(--color-bg-2);
}

.schedule-field {
  min-width: 0;
}

.schedule-field > span {
  display: block;
  margin-bottom: 6px;
  color: var(--color-text-2);
  font-size: 12px;
}

.schedule-remove {
  margin-bottom: 1px;
}

.schedule-original-time,
.schedule-sold {
  grid-column: 1 / -1;
  color: var(--color-text-3);
  font-size: 12px;
}

.schedule-original-time {
  color: rgb(var(--orange-6));
}

.unbind-card {
  margin-bottom: 16px;
}

.customer-course-card {
  margin-bottom: 12px;
}

.banner-media-preview {
  width: 100%;
  height: 260px;
  margin-bottom: 12px;
  overflow: hidden;
  border-radius: 10px;
  background: var(--color-fill-2);
}

.banner-media-preview img,
.banner-media-preview video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

:deep(.arco-modal-body) {
  max-height: 65vh;
  overflow: auto;
}

/* 后台所有新增、编辑与审核弹窗共用同一套视觉语言。 */
:global(.admin-editor-modal .arco-modal) {
  overflow: hidden;
  border: 1px solid #e7e9ed;
  border-radius: 16px;
  box-shadow: 0 22px 70px rgba(26, 32, 44, .18);
}

:global(.admin-editor-modal .arco-modal-header) {
  min-height: 68px;
  padding: 20px 24px;
  border-bottom: 1px solid #eceef1;
  background: linear-gradient(180deg, #ffffff 0%, #fbfbfc 100%);
}

:global(.admin-editor-modal .arco-modal-title) {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #252b31;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: .01em;
}

:global(.admin-editor-modal .arco-modal-title::before) {
  width: 4px;
  height: 18px;
  border-radius: 999px;
  background: #ee4d2d;
  content: '';
}

:global(.admin-editor-modal .arco-modal-close-btn) {
  top: 18px;
  right: 20px;
  border-radius: 8px;
  color: #7a818b;
}

:global(.admin-editor-modal .arco-modal-body) {
  max-height: 72vh;
  padding: 24px;
  overflow: auto;
  background: #fff;
}

:global(.admin-editor-modal .arco-modal-footer) {
  min-height: 66px;
  padding: 14px 24px;
  border-top: 1px solid #eceef1;
  background: #fff;
}

:global(.admin-editor-modal .arco-modal-footer .arco-btn) {
  min-width: 88px;
}

:global(.admin-editor-modal .arco-form-item) {
  margin-bottom: 20px;
}

:global(.admin-editor-modal .arco-form-item-label-col > label) {
  color: #424851;
  font-size: 13px;
  font-weight: 600;
}

:global(.admin-editor-modal .arco-input-wrapper),
:global(.admin-editor-modal .arco-textarea-wrapper),
:global(.admin-editor-modal .arco-select-view-single),
:global(.admin-editor-modal .arco-select-view-multiple),
:global(.admin-editor-modal .arco-picker),
:global(.admin-editor-modal .arco-input-number) {
  border-radius: 8px;
  background: #fafbfc;
  transition: border-color .18s ease, box-shadow .18s ease, background .18s ease;
}

:global(.admin-editor-modal .arco-input-wrapper),
:global(.admin-editor-modal .arco-select-view-single),
:global(.admin-editor-modal .arco-picker),
:global(.admin-editor-modal .arco-input-number) {
  min-height: 38px;
}

:global(.admin-editor-modal .arco-input-wrapper-focus),
:global(.admin-editor-modal .arco-textarea-wrapper-focus),
:global(.admin-editor-modal .arco-select-view-focus),
:global(.admin-editor-modal .arco-picker-focused),
:global(.admin-editor-modal .arco-input-number-focus) {
  background: #fff;
  box-shadow: 0 0 0 3px rgba(238, 77, 45, .09);
}

:global(.admin-editor-modal .arco-alert),
:global(.admin-editor-modal .arco-card),
:global(.admin-editor-modal .arco-descriptions) {
  border-radius: 10px;
}

:global(.admin-editor-modal .arco-btn) {
  border-radius: 8px;
}

:global(.admin-editor-modal .arco-btn-primary) {
  box-shadow: 0 4px 12px rgba(238, 77, 45, .16);
}

:global(.admin-editor-modal .arco-form-item:last-child) {
  margin-bottom: 0;
}

:global(.admin-editor-modal.listing-editor-modal .arco-modal-body) {
  padding: 0;
  background: #f5f6f8;
}

@media (max-width: 700px) {
  :global(.admin-editor-modal .arco-modal) {
    width: calc(100vw - 24px) !important;
  }

  :global(.admin-editor-modal .arco-modal-header),
  :global(.admin-editor-modal .arco-modal-body),
  :global(.admin-editor-modal .arco-modal-footer) {
    padding-right: 16px;
    padding-left: 16px;
  }
}
</style>
