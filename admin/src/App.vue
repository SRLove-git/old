<script setup>
import { ref, computed, onMounted } from 'vue'
import { Message, Modal } from '@arco-design/web-vue'
import {
  IconDashboard,
  IconCalendar,
  IconTags,
  IconFile,
  IconUserGroup,
  IconGift,
  IconArchive,
  IconMessage,
  IconImage,
  IconUserAdd,
  IconStamp,
  IconScan,
  IconIdcard,
  IconLink,
  IconSafe,
  IconSwap,
  IconHistory,
  IconSettings,
  IconMenuFold,
  IconMenuUnfold,
  IconPlus,
  IconLocation
} from '@arco-design/web-vue/es/icon'
import { api } from './api.js'

const view = ref('dashboard')
const loading = ref(false)
const error = ref('')
const collapsed = ref(false)

const nav = [
  { key: 'dashboard', name: '数据看板', icon: IconDashboard },
  { key: 'activities', name: '活动管理', icon: IconCalendar },
  { key: 'products', name: '商品管理', icon: IconArchive },
  { key: 'categories', name: '分类管理', icon: IconTags },
  { key: 'regions', name: '地区管理', icon: IconLocation },
  { key: 'orders', name: '订单/退款', icon: IconFile },
  { key: 'verify', name: '核销管理', icon: IconScan },
  { key: 'customers', name: '用户管理', icon: IconUserGroup },
  { key: 'coupons', name: '优惠券管理', icon: IconGift },
  { key: 'reviews', name: '评价管理', icon: IconMessage },
  { key: 'banners', name: 'Banner管理', icon: IconImage },
  { key: 'content', name: '资讯视频', icon: IconFile },
  { key: 'applications', name: '主理人审核', icon: IconUserAdd },
  { key: 'providers', name: '服务商审核', icon: IconStamp },
  { key: 'managers', name: '主理人管理', icon: IconIdcard },
  { key: 'bindings', name: '归属管理', icon: IconLink },
  { key: 'commissions', name: '佣金管理', icon: IconSafe },
  { key: 'withdraws', name: '提现审核', icon: IconSwap },
  { key: 'logs', name: '操作日志', icon: IconHistory },
  { key: 'config', name: '规则配置', icon: IconSettings }
]

const stats = ref(null)
const activities = ref([])
const orders = ref([])
const applications = ref([])
const providerApplications = ref([])
const unbindApplications = ref([])
const managers = ref([])
const customers = ref([])
const bindings = ref([])
const commissions = ref([])
const settlementRecords = ref([])
const commissionManagerId = ref('')
const withdraws = ref([])
const coupons = ref([])
const reviews = ref([])
const banners = ref([])
const products = ref([])
const regions = ref([])
const contentPosts = ref([])
const logs = ref([])
const config = ref({ couponRefundReturn: 'auto' })

const verifyCode = ref('')
const verifyOrder = ref(null)
const verifySearching = ref(false)

const cardCustomerId = ref('')
const cardProfile = ref(null)
const cardList = ref([])
const cardLoading = ref(false)

const kw = ref('')
const orderStatusFilter = ref('全部')
const orderStatuses = ['全部', '待付款', '待发货', '待收货', '待评价', '已完成', '已核销', '退款中', '已退款', '已取消']

const activityForm = ref(null)
const activitySchedulesJson = ref('')
const activitySkusJson = ref('')
const productForm = ref(null)
const regionForm = ref(null)
const contentForm = ref(null)
const productSkusJson = ref('')
const couponForm = ref(null)
const bannerForm = ref(null)
const customerForm = ref(null)
const rebindTarget = ref(null)
const rebindManagerId = ref('')
const adjustTarget = ref(null)
const adjustAmount = ref('')
const adjustReason = ref('')
const shipTarget = ref(null)
const shipForm = ref({ update: false, deliveryType: 'express', carrier: '顺丰速运', trackingNo: '', note: '' })

const categories = ref({})
const categoryForm = ref(null)
const categoryTypes = { activity: '活动', product: '商品', news: '资讯', video: '视频' }
const couponTypes = { 1: '无门槛', 2: '满减', 3: '品类券', 4: '指定商品券' }
const bindSource = { 1: '扫码', 2: '链接', 3: '邀请码', 4: '手动变更' }

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
  managers.value.map((m) => ({ label: m.name, value: String(m.id) }))
)
const customerOptions = computed(() =>
  customers.value.map((c) => ({
    label: `${c.name}（${c.phone || '无手机号'}）`,
    value: String(c.id)
  }))
)
const couponTypeOptions = Object.keys(couponTypes).map((k) => ({
  label: couponTypes[k],
  value: Number(k)
}))
const orderStatusOptions = orderStatuses.map((s) => ({ label: s, value: s }))
const contentTypeOptions = [
  { label: '活动', value: 'activity' },
  { label: '商品', value: 'product' },
  { label: '资讯', value: 'news' },
  { label: '视频', value: 'video' }
]
const postTypeOptions = [
  { label: '政策资讯', value: 'news' },
  { label: '视频', value: 'video' }
]
const publishOptions = [
  { label: '上架', value: 1 },
  { label: '下架', value: 0 }
]
const sellTypeOptions = [
  { label: '预约日期（选日期/场次）', value: 'date' },
  { label: 'SKU 选择（选规格/房型）', value: 'sku' }
]
const scopeCategoryOptions = computed(() => [
  { label: '无', value: null },
  ...categoryOptions.value
])

function catName(id) {
  const c = categories.value[String(id)] || categories.value[id]
  return c ? c.name : '未知'
}

function typeName(type) { return categoryTypes[type] || '活动' }

const pageTitle = computed(() => nav.find((n) => n.key === view.value)?.name || '')

function fuzzyMatch(text, kw) {
  const k = String(kw || '').trim().toLowerCase()
  if (!k) return true
  const terms = k.split(/\s+/).filter(Boolean)
  const hay = String(text || '').toLowerCase()
  return terms.every((t) => hay.includes(t))
}

function orderChip(status) {
  if (['已完成', '已核销'].includes(status)) return 'green'
  if (status === '退款中') return 'red'
  if (['已退款', '已取消'].includes(status)) return 'gray'
  return 'orange'
}

function managerChip(status) {
  if (status === 1) return 'green'
  if (status === 2) return 'orange'
  return 'gray'
}

function bindingChip(status) {
  if (status === 1) return 'green'
  return 'gray'
}

function statusChip(status) {
  if (['待审核', '待付款', '待发货', '待收货', '待评价'].includes(status)) return 'orange'
  if (['已通过', '已结算', '可结算', '已到账', '正常'].includes(status)) return 'green'
  if (['已拒绝', '已驳回', '已扣回'].includes(status)) return 'red'
  if (['提现中', '待结算'].includes(status)) return 'arcoblue'
  return 'gray'
}

function typeTagColor(type) {
  if (type === 'news') return 'arcoblue'
  if (type === 'video') return 'purple'
  return 'green'
}

const statItems = computed(() => {
  if (!stats.value) return []
  const s = stats.value
  return [
    { label: '活动数', value: s.activityCount },
    { label: '订单数', value: s.orderCount },
    { label: '客户数', value: s.customerCount },
    { label: '主理人数', value: s.managerCount },
    { label: '待审核申请', value: s.pendingApply },
    { label: '待审核提现', value: s.pendingWithdraw },
    { label: '待发货订单', value: s.pendingShipCount },
    { label: '待审退款', value: s.pendingRefundCount },
    { label: '待审核提现金额', value: s.pendingWithdrawAmount, prefix: '¥', precision: 2 },
    { label: '有效营收', value: s.totalRevenue, prefix: '¥', precision: 2 },
    { label: '累计佣金', value: s.totalCommission, prefix: '¥', precision: 2 },
    { label: '待结算佣金', value: s.pendingCommission, prefix: '¥', precision: 2 },
    { label: '可结算佣金', value: s.availableCommission, prefix: '¥', precision: 2 },
    { label: '已打款佣金', value: s.withdrawnCommission, prefix: '¥', precision: 2 }
  ]
})

const rankingColumns = [
  { title: '排名', slotName: 'rank', width: 80 },
  { title: '主理人', dataIndex: 'name' },
  { title: '累计佣金', slotName: 'commission', align: 'right', width: 160 },
  { title: '可结算', slotName: 'available', align: 'right', width: 140 },
  { title: '待结算', slotName: 'pending', align: 'right', width: 140 },
  { title: '客户数', dataIndex: 'totalCustomers', align: 'right', width: 120 }
]
const activityColumns = [
  { title: 'ID', dataIndex: 'id', width: 80 },
  { title: '标题', dataIndex: 'title', ellipsis: true, tooltip: true },
  { title: '分类', slotName: 'category', width: 110 },
  { title: '适用地区', slotName: 'regions', width: 180 },
  { title: '会员价', slotName: 'price', align: 'right', width: 110 },
  { title: '已报名', dataIndex: 'soldCount', align: 'right', width: 90 },
  { title: '状态', slotName: 'status', width: 90 },
  { title: '操作', slotName: 'actions', width: 140 }
]
const productColumns = [
  { title: 'ID', dataIndex: 'id', width: 80 },
  { title: '标题', dataIndex: 'title', ellipsis: true, tooltip: true },
  { title: '分类', slotName: 'category', width: 110 },
  { title: '适用地区', slotName: 'regions', width: 180 },
  { title: '会员价', slotName: 'price', align: 'right', width: 110 },
  { title: '销量', dataIndex: 'soldCount', align: 'right', width: 90 },
  { title: '库存', dataIndex: 'stock', align: 'right', width: 90 },
  { title: '状态', slotName: 'status', width: 90 },
  { title: '操作', slotName: 'actions', width: 140 }
]
const regionColumns = [
  { title: '地区名称', dataIndex: 'name' },
  { title: '排序', dataIndex: 'sort', width: 100 },
  { title: '前台状态', slotName: 'status', width: 120 },
  { title: '操作', slotName: 'actions', width: 180 }
]
const contentColumns = [
  { title: '类型', slotName: 'type', width: 100 },
  { title: '标题', dataIndex: 'title', ellipsis: true, tooltip: true },
  { title: '来源', dataIndex: 'source', width: 180 },
  { title: '发布日期', dataIndex: 'publishedAt', width: 120 },
  { title: '状态', slotName: 'status', width: 90 },
  { title: '操作', slotName: 'actions', width: 140 }
]
const cardColumns = [
  { title: '课程/计次卡', dataIndex: 'title', ellipsis: true, tooltip: true },
  { title: '剩余/总次数', slotName: 'remain', width: 140, align: 'right' },
  { title: '有效期', dataIndex: 'validUntil', width: 130 },
  { title: '操作', slotName: 'actions', width: 120 }
]
const orderColumns = [
  { title: '订单号', dataIndex: 'id', width: 100 },
  { title: '客户', dataIndex: 'participants', width: 110 },
  { title: '标题', dataIndex: 'title', ellipsis: true, tooltip: true },
  { title: '收货地址', slotName: 'address', width: 230 },
  { title: '物流', slotName: 'logistics', width: 170 },
  { title: '实付', slotName: 'payAmount', align: 'right', width: 110 },
  { title: '状态', slotName: 'status', width: 100 },
  { title: '退款/售后', slotName: 'refund', width: 190 },
  { title: '主理人', slotName: 'manager', width: 120 },
  { title: '操作', slotName: 'actions', width: 360 }
]
const customerColumns = [
  { title: 'ID', dataIndex: 'id', width: 80 },
  { title: '姓名', dataIndex: 'name', width: 110 },
  { title: '电话', dataIndex: 'phone', width: 140 },
  { title: '会员', slotName: 'member', width: 70 },
  { title: '余额', slotName: 'balance', align: 'right', width: 110 },
  { title: '积分', dataIndex: 'points', align: 'right', width: 90 },
  { title: '归属主理人', slotName: 'manager', width: 140 },
  { title: '操作', slotName: 'actions', width: 200 }
]
const couponColumns = [
  { title: 'ID', dataIndex: 'id', width: 80 },
  { title: '标题', dataIndex: 'title', ellipsis: true, tooltip: true },
  { title: '类型', slotName: 'type', width: 110 },
  { title: '面额', slotName: 'value', align: 'right', width: 90 },
  { title: '门槛', slotName: 'min', width: 90 },
  { title: '有效期', dataIndex: 'expireAt', width: 120 },
  { title: '状态', slotName: 'status', width: 90 },
  { title: '操作', slotName: 'actions', width: 140 }
]
const reviewColumns = [
  { title: 'ID', dataIndex: 'id', width: 80 },
  { title: '活动', slotName: 'activity', ellipsis: true, tooltip: true },
  { title: '用户', dataIndex: 'name', width: 110 },
  { title: '评分', slotName: 'rating', width: 80 },
  { title: '内容', dataIndex: 'content', ellipsis: true, tooltip: true },
  { title: '时间', dataIndex: 'time', width: 160 },
  { title: '操作', slotName: 'actions', width: 90 }
]
const bannerColumns = [
  { title: 'ID', dataIndex: 'id', width: 80 },
  { title: '标题', dataIndex: 'title', ellipsis: true, tooltip: true },
  { title: '副标题', dataIndex: 'sub', ellipsis: true, tooltip: true },
  { title: '图标', slotName: 'emoji', width: 70 },
  { title: '跳转分类', slotName: 'cat', width: 120 },
  { title: '操作', slotName: 'actions', width: 140 }
]
const applicationColumns = [
  { title: '姓名', dataIndex: 'name', width: 120 },
  { title: '电话', dataIndex: 'phone', width: 140 },
  { title: '社群规模', dataIndex: 'scale', width: 100 },
  { title: '擅长', slotName: 'fields', ellipsis: true, tooltip: true },
  { title: '缴费', slotName: 'paid', width: 90 },
  { title: '状态', slotName: 'status', width: 100 },
  { title: '操作', slotName: 'actions', width: 160 }
]
const providerColumns = [
  { title: 'ID', dataIndex: 'id', width: 80 },
  { title: '姓名', dataIndex: 'name', width: 120 },
  { title: '手机号', dataIndex: 'phone', width: 140 },
  { title: '服务类型', dataIndex: 'type', width: 120 },
  { title: '简介', dataIndex: 'intro', ellipsis: true, tooltip: true },
  { title: '状态', slotName: 'status', width: 100 },
  { title: '提交时间', dataIndex: 'submittedAt', width: 160 },
  { title: '操作', slotName: 'actions', width: 160 }
]
const unbindColumns = [
  { title: '申请ID', dataIndex: 'id', width: 90 },
  { title: '客户', dataIndex: 'customerName', width: 120 },
  { title: '原主理人', dataIndex: 'managerName', width: 120 },
  { title: '申请理由', dataIndex: 'reason', ellipsis: true, tooltip: true },
  { title: '状态', slotName: 'status', width: 100 },
  { title: '申请时间', dataIndex: 'submittedAt', width: 160 },
  { title: '操作', slotName: 'actions', width: 160 }
]
const managerColumns = [
  { title: 'ID', dataIndex: 'id', width: 80 },
  { title: '姓名', dataIndex: 'name', width: 120 },
  { title: '邀请码', dataIndex: 'inviteCode', width: 120 },
  { title: '累计业绩', slotName: 'performance', align: 'right', width: 120 },
  { title: '累计佣金', slotName: 'commission', align: 'right', width: 120 },
  { title: '可结算', slotName: 'available', align: 'right', width: 110 },
  { title: '待结算', slotName: 'pending', align: 'right', width: 110 },
  { title: '提现中', slotName: 'withdrawing', align: 'right', width: 110 },
  { title: '已打款', slotName: 'settled', align: 'right', width: 110 },
  { title: '状态', slotName: 'status', width: 100 },
  { title: '操作', slotName: 'actions', width: 180 }
]
const bindingColumns = [
  { title: '客户', dataIndex: 'customerName', width: 140 },
  { title: '归属主理人', slotName: 'manager', width: 140 },
  { title: '绑定来源', slotName: 'source', width: 110 },
  { title: '绑定时间', dataIndex: 'bindTime', width: 160 },
  { title: '状态', slotName: 'status', width: 100 },
  { title: '操作', slotName: 'actions', width: 160 }
]
const commissionColumns = [
  { title: '佣金单', dataIndex: 'id', width: 90 },
  { title: '主理人', slotName: 'manager', width: 110 },
  { title: '客户', dataIndex: 'customerName', width: 120 },
  { title: '商品', dataIndex: 'productName', ellipsis: true, tooltip: true },
  { title: '比例', slotName: 'rate', align: 'right', width: 80 },
  { title: '金额', slotName: 'amount', align: 'right', width: 110 },
  { title: '状态', slotName: 'status', width: 110 },
  { title: '创建时间', dataIndex: 'createTime', width: 150 },
  { title: '结算时间', dataIndex: 'settleTime', width: 150 },
  { title: '操作', slotName: 'actions', width: 160 }
]
const settlementColumns = [
  { title: '结算单', dataIndex: 'id', width: 150 },
  { title: '主理人', dataIndex: 'managerName', width: 120 },
  { title: '笔数', dataIndex: 'count', align: 'right', width: 80 },
  { title: '金额', slotName: 'amount', align: 'right', width: 120 },
  { title: '结算时间', dataIndex: 'settledAt', width: 160 }
]
const withdrawColumns = [
  { title: '提现单', dataIndex: 'id', width: 90 },
  { title: '主理人', slotName: 'manager', width: 120 },
  { title: '金额', slotName: 'amount', align: 'right', width: 100 },
  { title: '税费', slotName: 'tax', align: 'right', width: 90 },
  { title: '实际到账', slotName: 'actual', align: 'right', width: 110 },
  { title: '锁定佣金', dataIndex: 'commissionCount', align: 'right', width: 100 },
  { title: '退款扣减', slotName: 'clawback', align: 'right', width: 100 },
  { title: '状态', slotName: 'status', width: 100 },
  { title: '申请时间', dataIndex: 'applyTime', width: 160 },
  { title: '操作', slotName: 'actions', width: 160 }
]
const logColumns = [
  { title: '时间', dataIndex: 'time', width: 180 },
  { title: '操作', slotName: 'action', width: 140 },
  { title: '详情', dataIndex: 'detail' }
]
const categoryColumns = [
  { title: 'ID', dataIndex: 'id', width: 80 },
  { title: '图标', slotName: 'emoji', width: 70 },
  { title: '名称', dataIndex: 'name', width: 140 },
  { title: '简称', dataIndex: 'short', width: 100 },
  { title: '类型', slotName: 'type', width: 90 },
  { title: '主题色', slotName: 'color', width: 140 },
  { title: '操作', slotName: 'actions', width: 140 }
]

async function load() {
  loading.value = true
  error.value = ''
  try {
    categories.value = await api.get('/categories')
    regions.value = await api.get('/regions')
    if (view.value === 'dashboard') stats.value = await api.get('/stats/dashboard')
    if (view.value === 'activities') activities.value = await api.get('/activities')
    if (view.value === 'products') products.value = await api.get('/products')
    if (view.value === 'orders') orders.value = await api.get('/orders')
    if (view.value === 'verify') customers.value = await api.get('/customers')
    if (view.value === 'customers') {
      customers.value = await api.get('/customers')
      bindings.value = await api.get('/bindings')
    }
    if (view.value === 'coupons') coupons.value = await api.get('/coupons')
    if (view.value === 'reviews') reviews.value = await api.get('/reviews')
    if (view.value === 'banners') banners.value = await api.get('/banners')
    if (view.value === 'content') contentPosts.value = await api.get('/content-posts')
    if (view.value === 'applications') applications.value = await api.get('/manager-applications')
    if (view.value === 'providers') providerApplications.value = await api.get('/provider-applications')
    if (view.value === 'managers') managers.value = await api.get('/managers')
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
    if (view.value === 'withdraws') withdraws.value = await api.get('/withdraws')
    if (view.value === 'logs') logs.value = await api.get('/logs')
    if (view.value === 'config') {
      config.value = await api.get('/config')
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
        config.value.brand = { slogan: '和同龄人一起，玩得开心又省心' }
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

function switchView(key) {
  view.value = key
  kw.value = ''
  orderStatusFilter.value = '全部'
  load()
}

onMounted(load)

async function doAction(fn, successMsg) {
  error.value = ''
  try {
    await fn()
    await load()
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

function askReason(title, placeholder, onOk) {
  reasonValue.value = ''
  reasonOk = onOk
  reasonModal.value = { visible: true, title, placeholder }
}

function closeReason() {
  reasonModal.value.visible = false
  reasonOk = null
}

function submitReason() {
  const cb = reasonOk
  const val = reasonValue.value.trim()
  closeReason()
  if (cb) cb(val)
}

const filteredActivities = computed(() => {
  const k = kw.value.trim()
  return activities.value.filter((a) => {
    const text = [a.title, a.city, regionNames(a), a.address, a.highlight, a.detail, (a.points || []).join(' ')].filter(Boolean).join(' ')
    return fuzzyMatch(text, k)
  })
})
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
  快递公司: o.carrier || '',
  快递单号: o.trackingNo || '',
  发货时间: o.shipTime || '',
  下单时间: o.createdAt || '',
  主理人: o.managerId || ''
})))
const pendingShipOrders = computed(() => orders.value.filter((o) => o.status === '待发货').length)
const filteredCustomers = computed(() => {
  const k = kw.value.trim()
  return customers.value.filter((c) => fuzzyMatch(`${c.name} ${c.phone}`, k))
})
const filteredCommissions = computed(() => {
  const k = kw.value.trim()
  return commissions.value.filter((c) => {
    const okManager = !commissionManagerId.value || String(c.managerId) === String(commissionManagerId.value)
    return okManager && fuzzyMatch(`${c.id} ${c.customerName} ${c.productName} ${c.status} ${c.createTime || ''}`, k)
  })
})
const commissionManagerOptions = computed(() =>
  managers.value.map((m) => ({ label: `${m.name}（可结算 ¥${m.available ?? 0}）`, value: String(m.id) }))
)

function openActivity(a) {
  activityForm.value = a
    ? { ...a, regionIds: inferRegionIds(a), sellType: a.sellType || 'date' }
    : { title: '', category: 1, city: '线上/全国', regionIds: [], address: '', price: 0, memberPrice: 0, originalPrice: 0, minGroup: 0, maxGroup: 40, soldCount: 0, highlight: '', time: '', managerCommissionRate: null, status: 1, sellType: 'date', hasSku: false, skuLabel: '', schedules: [], skus: [], points: [], detail: '' }
  activitySchedulesJson.value = a && a.schedules ? JSON.stringify(a.schedules, null, 2) : '[]'
  activitySkusJson.value = a && a.skus ? JSON.stringify(a.skus, null, 2) : '[]'
}

function saveActivity() {
  const form = { ...activityForm.value }
  try {
    form.schedules = JSON.parse(activitySchedulesJson.value || '[]')
    form.skus = JSON.parse(activitySkusJson.value || '[]')
  } catch (e) {
    error.value = '排班或 SKU JSON 格式错误'
    Message.error('排班或 SKU JSON 格式错误')
    return
  }
  form.hasSku = form.sellType === 'sku' || (Array.isArray(form.skus) && form.skus.length > 0)
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
  productForm.value = p
    ? { ...p, regionIds: inferRegionIds(p) }
    : { title: '', category: 5, city: '全国', regionIds: [], price: 0, memberPrice: 0, originalPrice: 0, soldCount: 0, stock: 0, highlight: '', points: [], detail: '', cover: '🛍️', coverTone: 'linear-gradient(135deg,#7a5cae,#b39ddb)', sellType: 'sku', hasSku: false, skus: [], status: 1 }
  productSkusJson.value = p && p.skus ? JSON.stringify(p.skus, null, 2) : '[]'
}

function saveProduct() {
  const form = { ...productForm.value }
  try {
    form.skus = JSON.parse(productSkusJson.value || '[]')
  } catch (e) {
    error.value = 'SKU JSON 格式错误'
    Message.error('SKU JSON 格式错误')
    return
  }
  form.hasSku = Array.isArray(form.skus) && form.skus.length > 0
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
  regionForm.value = region ? { ...region } : { name: '', sort: (regions.value.length + 1) * 10, enabled: true }
}

function saveRegion() {
  const form = { ...regionForm.value }
  if (!String(form.name || '').trim()) {
    Message.error('请输入地区名称')
    return
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
}

function saveContent() {
  const form = { ...contentForm.value, regionIds: (contentForm.value.regionIds || []).map(String) }
  if (!String(form.title || '').trim()) {
    Message.error('请输入标题')
    return
  }
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

const carrierOptions = ['顺丰速运', '京东物流', '中通快递', '圆通速递', '韵达快递', '申通快递', '极兔速递', '邮政EMS', '德邦快递', '其他'].map((c) => ({ label: c, value: c }))

function orderAddressText(record) {
  const a = record && record.address
  if (!a) return ''
  return [a.province, a.city, a.district, a.detail].filter(Boolean).join('')
}

function openShip(record, update) {
  shipTarget.value = record
  shipForm.value = {
    update: Boolean(update),
    deliveryType: record.deliveryType === 'self' ? 'self' : 'express',
    carrier: record.carrier && record.carrier !== '无需物流' ? record.carrier : carrierOptions[0].value,
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
    if (!form.carrier) {
      Message.warning('请选择快递公司')
      return
    }
    if (!/^[A-Za-z0-9-]{6,32}$/.test(String(form.trackingNo).trim())) {
      Message.warning('请填写正确的快递单号（6-32位字母/数字）')
      return
    }
  }
  doAction(async () => {
    await api.post(`/orders/${target.id}/ship`, {
      update: form.update,
      deliveryType: form.deliveryType,
      carrier: form.deliveryType === 'self' ? '无需物流' : form.carrier,
      trackingNo: form.deliveryType === 'self' ? '' : String(form.trackingNo).trim(),
      note: String(form.note || '').trim()
    })
    closeShip()
  }, form.update ? '物流信息已更新' : '已发货')
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
  Modal.confirm({
    title: '确认核销',
    content: `确认核销订单「${verifyOrder.value.title}」（核销码 ${verifyOrder.value.code}）？`,
    okText: '确定',
    cancelText: '取消',
    onOk: () => doVerify()
  })
}

async function doVerify() {
  error.value = ''
  try {
    verifyOrder.value = await api.post(`/orders/${verifyOrder.value.id}/verify`)
    Message.success('核销成功')
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

function confirmCheckin(card) {
  const remain = Number(card.remain || 0)
  if (remain <= 0) {
    Message.warning('该计次卡已无剩余次数')
    return
  }
  Modal.confirm({
    title: '计次卡签到',
    content: `确认为「${card.title}」核销 1 次？（当前剩余 ${remain} 次）`,
    okText: '确认签到',
    cancelText: '取消',
    onOk: () => doCheckin(card)
  })
}

async function doCheckin(card) {
  error.value = ''
  try {
    const updated = await api.post(`/cards/${card.id}/checkin`, {})
    const idx = cardList.value.findIndex((c) => String(c.id) === String(card.id))
    if (idx >= 0) cardList.value[idx] = updated
    Message.success('签到成功')
  } catch (e) {
    error.value = e.message
    Message.error(e.message)
  }
}

function openCustomer(c) {
  customerForm.value = { ...c }
}

function saveCustomer() {
  const form = { ...customerForm.value }
  doAction(async () => {
    await api.put(`/customers/${form.id}`, form)
    customerForm.value = null
  }, '用户已保存')
}

function openCoupon(c) {
  couponForm.value = c || { title: '', type: 1, value: 10, minAmount: 0, scopeCategory: null, scopeProductId: null, expireAt: '2026-12-31' }
}

function saveCoupon() {
  const form = { ...couponForm.value }
  doAction(async () => {
    if (form.id) await api.put(`/coupons/${form.id}`, form)
    else await api.post('/coupons', form)
    couponForm.value = null
  }, '优惠券已保存')
}

function removeCoupon(id) {
  confirmDanger('确定删除该优惠券？', () =>
    doAction(() => api.del(`/coupons/${id}`), '优惠券已删除')
  )
}

function openCategory(c) {
  categoryForm.value = c
    ? { ...c }
    : { name: '', short: '', emoji: '📌', color: '#6f747b', type: 'activity' }
}

function saveCategory() {
  const form = { ...categoryForm.value }
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
  bannerForm.value = b || { title: '', sub: '', emoji: '🎁', tone: 'linear-gradient(135deg,#c25e3d,#e19a6d)', cat: 0 }
}

function saveBanner() {
  const form = { ...bannerForm.value }
  doAction(async () => {
    if (form.id) await api.put(`/banners/${form.id}`, form)
    else await api.post('/banners', form)
    bannerForm.value = null
  }, 'Banner 已保存')
}

function removeBanner(id) {
  confirmDanger('确定删除该 Banner？', () =>
    doAction(() => api.del(`/banners/${id}`), 'Banner 已删除')
  )
}

function approveApp(id) {
  doAction(() => api.post(`/manager-applications/${id}/approve`), '已通过')
}

function rejectApp(id) {
  askReason('拒绝主理人申请', '请输入拒绝原因', (reason) =>
    doAction(() => api.post(`/manager-applications/${id}/reject`, { reason }), '已拒绝')
  )
}

function approveProvider(id) {
  doAction(() => api.post(`/provider-applications/${id}/approve`), '已通过')
}

function rejectProvider(id) {
  askReason('拒绝服务商申请', '请输入拒绝原因', (reason) =>
    doAction(() => api.post(`/provider-applications/${id}/reject`, { reason }), '已拒绝')
  )
}

function setManagerStatus(id, status) {
  const action = () => doAction(() => api.post(`/managers/${id}/status`, { status }))
  if (status === 3) {
    confirmDanger('确定清退该主理人？清退后不可恢复。', action)
  } else {
    action()
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
  rebindManagerId.value = managers.value[0] ? String(managers.value[0].id) : ''
}

function confirmRebind() {
  doAction(async () => {
    await api.post('/bindings/rebind', {
      customerId: rebindTarget.value.id,
      managerId: Number(rebindManagerId.value),
      reason: '运营后台变更归属'
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

function approveWithdraw(id) {
  doAction(() => api.post(`/withdraws/${id}/approve`), '已打款')
}

function rejectWithdraw(id) {
  askReason('拒绝提现申请', '请输入拒绝原因', (reason) =>
    doAction(() => api.post(`/withdraws/${id}/reject`, { reason }), '已拒绝')
  )
}

function removeReview(id) {
  confirmDanger('确定删除该评价？', () =>
    doAction(() => api.del(`/reviews/${id}`), '评价已删除')
  )
}

function saveConfig() {
  doAction(() => api.put('/config', config.value), '配置已保存')
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
  <a-layout class="layout">
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
        <a-menu-item v-for="n in nav" :key="n.key">
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
          <a-space :size="10">
            <a-avatar :size="30" class="avatar">管</a-avatar>
            <span class="topbar-user">运营管理员</span>
          </a-space>
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
          <section v-if="view === 'dashboard' && stats">
            <a-row :gutter="[16, 16]">
              <a-col v-for="s in statItems" :key="s.label" :xs="12" :sm="8" :md="6" :xl="3">
                <a-card :bordered="false" class="stat-card">
                  <a-statistic
                    :title="s.label"
                    :value="Number(s.value ?? 0)"
                    :precision="s.precision"
                    :value-style="{ color: 'var(--color-text-1)', fontSize: '24px' }"
                  >
                    <template v-if="s.prefix" #prefix>
                      <span class="stat-prefix">{{ s.prefix }}</span>
                    </template>
                  </a-statistic>
                </a-card>
              </a-col>
            </a-row>

            <a-row :gutter="[16, 16]" class="mt">
              <a-col :xs="24" :lg="8">
                <a-card title="订单状态分布" :bordered="false">
                  <a-space wrap>
                    <a-tag v-for="(v, k) in stats.orderStatus" :key="k" color="gray">{{ k }}：{{ v }}</a-tag>
                  </a-space>
                </a-card>
              </a-col>
              <a-col :xs="24" :lg="8">
                <a-card title="商品分类分布" :bordered="false">
                  <a-space wrap>
                    <a-tag v-for="(v, k) in stats.byCategory" :key="k" color="arcoblue">{{ catName(Number(k)) }}：{{ v }}</a-tag>
                  </a-space>
                </a-card>
              </a-col>
              <a-col :xs="24" :lg="8">
                <a-card title="主理人排行榜（按累计佣金）" :bordered="false">
                  <a-table
                    :columns="rankingColumns"
                    :data="stats.managerRanking"
                    :pagination="false"
                    row-key="id"
                    size="small"
                  >
                    <template #rank="{ rowIndex }">{{ rowIndex + 1 }}</template>
                    <template #commission="{ record }"><span class="num">¥{{ record.totalCommission }}</span></template>
                    <template #available="{ record }"><span class="num">¥{{ record.available }}</span></template>
                    <template #pending="{ record }"><span class="num">¥{{ record.pending }}</span></template>
                  </a-table>
                </a-card>
              </a-col>
            </a-row>
          </section>

          <section v-if="view === 'activities'">
            <div class="toolbar">
              <a-input-search
                v-model="kw"
                placeholder="搜索标题/城市"
                allow-clear
                style="width: 280px"
              />
            </div>
            <a-card :bordered="false">
              <a-table
                :columns="activityColumns"
                :data="filteredActivities"
                :pagination="false"
                row-key="id"
                size="middle"
              >
                <template #category="{ record }"><a-tag color="arcoblue">{{ catName(record.category) }}</a-tag></template>
                <template #regions="{ record }">{{ regionNames(record) }}</template>
                <template #price="{ record }"><span class="num">¥{{ record.memberPrice }}</span></template>
                <template #status="{ record }">
                  <a-tag :color="record.status === 1 ? 'green' : 'gray'">{{ record.status === 1 ? '上架' : '下架' }}</a-tag>
                </template>
                <template #actions="{ record }">
                  <a-space :size="0">
                    <a-button type="text" size="small" @click="openActivity(record)">编辑</a-button>
                    <a-button type="text" status="danger" size="small" @click="removeActivity(record.id)">删除</a-button>
                  </a-space>
                </template>
              </a-table>
            </a-card>
            <a-button type="primary" shape="round" class="fab" @click="openActivity(null)">
              <template #icon><IconPlus /></template>
              新建活动
            </a-button>
          </section>

          <section v-if="view === 'products'">
            <a-card :bordered="false">
              <a-table
                :columns="productColumns"
                :data="products"
                :pagination="false"
                row-key="id"
                size="middle"
              >
                <template #category="{ record }"><a-tag color="arcoblue">{{ catName(record.category) }}</a-tag></template>
                <template #regions="{ record }">{{ regionNames(record) }}</template>
                <template #price="{ record }"><span class="num">¥{{ record.memberPrice }}</span></template>
                <template #status="{ record }">
                  <a-tag :color="record.status === 1 ? 'green' : 'gray'">{{ record.status === 1 ? '上架' : '下架' }}</a-tag>
                </template>
                <template #actions="{ record }">
                  <a-space :size="0">
                    <a-button type="text" size="small" @click="openProduct(record)">编辑</a-button>
                    <a-button type="text" status="danger" size="small" @click="removeProduct(record.id)">删除</a-button>
                  </a-space>
                </template>
              </a-table>
            </a-card>
            <a-button type="primary" shape="round" class="fab" @click="openProduct(null)">
              <template #icon><IconPlus /></template>
              新建商品
            </a-button>
          </section>

          <section v-if="view === 'regions'">
            <a-alert type="info" class="toolbar">
              停用地区后，前台不再显示该地区筛选，新发布内容也不能选择；历史活动、商品和订单关联会保留。
            </a-alert>
            <a-card :bordered="false">
              <a-table :columns="regionColumns" :data="regions" :pagination="false" row-key="id">
                <template #status="{ record }">
                  <a-tag :color="record.enabled !== false ? 'green' : 'gray'">{{ record.enabled !== false ? '已启用' : '已停用' }}</a-tag>
                </template>
                <template #actions="{ record }">
                  <a-space :size="0">
                    <a-button type="text" size="small" @click="openRegion(record)">编辑</a-button>
                    <a-button type="text" size="small" @click="toggleRegion(record)">{{ record.enabled !== false ? '停用' : '启用' }}</a-button>
                  </a-space>
                </template>
              </a-table>
            </a-card>
            <a-button type="primary" shape="round" class="fab" @click="openRegion(null)">
              <template #icon><IconPlus /></template>
              新增地区
            </a-button>
          </section>

          <section v-if="view === 'orders'">
            <div class="toolbar">
              <a-space wrap>
                <a-input-search v-model="kw" placeholder="搜索订单/标题/客户" allow-clear style="width: 260px" />
                <a-select v-model="orderStatusFilter" :options="orderStatusOptions" style="width: 140px" />
                <a-tag color="orange">待发货 {{ pendingShipOrders }}</a-tag>
                <a-button @click="exportCsv('orders.csv', orderExportRows)">导出 CSV（含收货地址与物流）</a-button>
              </a-space>
            </div>
            <a-card :bordered="false">
              <a-table
                :columns="orderColumns"
                :data="filteredOrders"
                :pagination="false"
                row-key="id"
                :scroll="{ x: 1500 }"
                size="middle"
              >
                <template #payAmount="{ record }"><span class="num">¥{{ record.payAmount }}</span></template>
                <template #address="{ record }">
                  <div v-if="record.address">
                    <div>{{ record.address.name }} {{ record.address.phone }}</div>
                    <div class="muted">{{ orderAddressText(record) }}</div>
                  </div>
                  <span v-else class="muted">—</span>
                </template>
                <template #logistics="{ record }">
                  <div v-if="record.trackingNo || record.carrier">
                    <div>{{ record.carrier }}</div>
                    <div class="muted">{{ record.trackingNo || '—' }}</div>
                  </div>
                  <span v-else class="muted">未发货</span>
                </template>
                <template #status="{ record }"><a-tag :color="orderChip(record.status)">{{ record.status }}</a-tag></template>
                <template #refund="{ record }">
                  <div v-if="record.status === '退款中' || record.refundReason">
                    <div>{{ record.refundReason || '—' }}</div>
                    <div class="muted">
                      ¥{{ record.refundAmount || 0 }}
                      <template v-if="record.status === '退款中'"> · 申请于 {{ record.refundApplyTime || '—' }}</template>
                      <template v-else-if="record.refundTime"> · {{ record.refundTime }}</template>
                    </div>
                    <div v-if="record.refundRejected" class="muted red">已拒绝：{{ record.refundRejected }}</div>
                  </div>
                  <span v-else class="muted">—</span>
                </template>
                <template #manager="{ record }">{{ record.managerId || '散客' }}</template>
                <template #actions="{ record }">
                  <a-space :size="0" wrap>
                    <a-button v-if="record.status === '待付款'" type="primary" size="small" @click="orderAction(record.id, 'pay')">支付</a-button>
                    <a-button v-if="record.status === '待付款'" size="small" @click="orderAction(record.id, 'cancel')">取消</a-button>
                    <a-button v-if="record.status === '待发货'" type="primary" size="small" @click="openShip(record, false)">发货</a-button>
                    <a-button v-if="record.status === '待收货' && (record.carrier || record.trackingNo)" size="small" @click="openShip(record, true)">改物流</a-button>
                    <a-button v-if="record.status === '退款中'" type="primary" status="danger" size="small" @click="approveRefund(record.id)">同意退款</a-button>
                    <a-button v-if="record.status === '退款中'" size="small" @click="rejectRefund(record)">拒绝退款</a-button>
                    <a-button v-if="record.status === '待发货' || record.status === '待收货'" size="small" @click="orderAction(record.id, 'advance')">推进</a-button>
                    <a-button v-if="record.status === '待发货' || record.status === '待收货'" type="primary" status="danger" size="small" @click="refundOrder(record.id)">退款</a-button>
                  </a-space>
                </template>
              </a-table>
            </a-card>
          </section>

          <section v-if="view === 'verify'">
            <a-card :bordered="false">
              <div class="toolbar">
                <a-input-search
                  v-model="verifyCode"
                  placeholder="输入或扫描核销码"
                  search-button
                  allow-clear
                  style="width: 320px"
                  :loading="verifySearching"
                  @search="searchVerify"
                >
                  <template #button-default>查询</template>
                </a-input-search>
              </div>
              <a-empty v-if="!verifyOrder" description="输入核销码查询订单信息" />
              <template v-else>
                <a-descriptions :column="2" bordered title="订单信息">
                  <a-descriptions-item label="订单号">{{ verifyOrder.id }}</a-descriptions-item>
                  <a-descriptions-item label="标题">{{ verifyOrder.title }}</a-descriptions-item>
                  <a-descriptions-item label="客户">{{ verifyOrder.participants }}</a-descriptions-item>
                  <a-descriptions-item label="人数">{{ verifyOrder.count }}</a-descriptions-item>
                  <a-descriptions-item label="实付"><span class="num">¥{{ verifyOrder.payAmount }}</span></a-descriptions-item>
                  <a-descriptions-item label="状态"><a-tag :color="orderChip(verifyOrder.status)">{{ verifyOrder.status }}</a-tag></a-descriptions-item>
                  <a-descriptions-item label="核销码">{{ verifyOrder.code }}</a-descriptions-item>
                  <a-descriptions-item label="场次时间">{{ verifyOrder.schedule ? `${verifyOrder.schedule.date || ''} ${verifyOrder.schedule.time || ''}`.trim() || '—' : '—' }}</a-descriptions-item>
                </a-descriptions>
                <div class="actions-row">
                  <a-button
                    type="primary"
                    :disabled="!['待发货', '待收货'].includes(verifyOrder.status)"
                    @click="confirmVerify"
                  >
                    确认核销
                  </a-button>
                </div>
              </template>
            </a-card>
            <a-card :bordered="false" title="计次卡核销" style="margin-top: 16px">
              <div class="toolbar">
                <a-select
                  v-model="cardCustomerId"
                  :options="customerOptions"
                  placeholder="选择会员"
                  allow-search
                  allow-clear
                  style="width: 340px"
                  @change="loadCardCustomer"
                />
              </div>
              <a-spin :loading="cardLoading" style="width: 100%">
                <a-empty v-if="!cardCustomerId" description="选择会员后查看其计次卡" />
                <a-empty v-else-if="cardList.length === 0" description="该会员暂无计次卡" />
                <a-table v-else :columns="cardColumns" :data="cardList" :pagination="false" row-key="id">
                  <template #remain="{ record }">{{ record.remain }} / {{ record.total }}</template>
                  <template #actions="{ record }">
                    <a-button size="small" type="primary" @click="confirmCheckin(record)">签到</a-button>
                  </template>
                </a-table>
              </a-spin>
            </a-card>
          </section>

          <section v-if="view === 'customers'">
            <div class="toolbar">
              <a-input-search v-model="kw" placeholder="搜索姓名/电话" allow-clear style="width: 280px" />
            </div>
            <a-card :bordered="false">
              <a-table
                :columns="customerColumns"
                :data="filteredCustomers"
                :pagination="false"
                row-key="id"
                size="middle"
              >
                <template #member="{ record }">{{ record.member ? '是' : '否' }}</template>
                <template #balance="{ record }"><span class="num">¥{{ record.balance }}</span></template>
                <template #manager="{ record }">{{ managers.find((m) => String(m.id) === String(record.managerId))?.name || '散客' }}</template>
                <template #actions="{ record }">
                  <a-space :size="0">
                    <a-button type="text" size="small" @click="openCustomer(record)">编辑</a-button>
                    <a-button type="text" size="small" @click="openRebind(record)">改归属</a-button>
                    <a-button type="text" status="danger" size="small" @click="unbindCustomer(record.id)">解绑</a-button>
                  </a-space>
                </template>
              </a-table>
            </a-card>
          </section>

          <section v-if="view === 'coupons'">
            <a-card :bordered="false">
              <a-table
                :columns="couponColumns"
                :data="coupons"
                :pagination="false"
                row-key="id"
                size="middle"
              >
                <template #type="{ record }">{{ couponTypes[record.type] }}</template>
                <template #value="{ record }"><span class="num">¥{{ record.value }}</span></template>
                <template #min="{ record }">满 {{ record.minAmount }}</template>
                <template #status="{ record }"><a-tag :color="record.used ? 'gray' : 'green'">{{ record.used ? '已使用' : '可用' }}</a-tag></template>
                <template #actions="{ record }">
                  <a-space :size="0">
                    <a-button type="text" size="small" @click="openCoupon(record)">编辑</a-button>
                    <a-button type="text" status="danger" size="small" @click="removeCoupon(record.id)">删除</a-button>
                  </a-space>
                </template>
              </a-table>
            </a-card>
            <a-button type="primary" shape="round" class="fab" @click="openCoupon(null)">
              <template #icon><IconPlus /></template>
              新建优惠券
            </a-button>
          </section>

          <section v-if="view === 'reviews'">
            <a-card :bordered="false">
              <a-table
                :columns="reviewColumns"
                :data="reviews"
                :pagination="false"
                row-key="id"
                size="middle"
              >
                <template #activity="{ record }">{{ activities.find((a) => String(a.id) === String(record.activityId))?.title || record.activityId }}</template>
                <template #rating="{ record }">{{ record.rating }}星</template>
                <template #actions="{ record }">
                  <a-button type="text" status="danger" size="small" @click="removeReview(record.id)">删除</a-button>
                </template>
              </a-table>
            </a-card>
          </section>

          <section v-if="view === 'banners'">
            <a-card :bordered="false">
              <a-table
                :columns="bannerColumns"
                :data="banners"
                :pagination="false"
                row-key="id"
                size="middle"
              >
                <template #emoji="{ record }">{{ record.emoji }}</template>
                <template #cat="{ record }">{{ record.cat ? catName(record.cat) : '个人中心' }}</template>
                <template #actions="{ record }">
                  <a-space :size="0">
                    <a-button type="text" size="small" @click="openBanner(record)">编辑</a-button>
                    <a-button type="text" status="danger" size="small" @click="removeBanner(record.id)">删除</a-button>
                  </a-space>
                </template>
              </a-table>
            </a-card>
            <a-button type="primary" shape="round" class="fab" @click="openBanner(null)">
              <template #icon><IconPlus /></template>
              新建 Banner
            </a-button>
          </section>

          <section v-if="view === 'content'">
            <a-alert type="info" class="toolbar">转载政府信息时请填写准确来源与原文链接，正文不要改动政策口径。</a-alert>
            <a-card :bordered="false">
              <a-table :columns="contentColumns" :data="contentPosts" :pagination="false" row-key="id">
                <template #type="{ record }"><a-tag :color="record.type === 'video' ? 'purple' : 'arcoblue'">{{ record.type === 'video' ? '视频' : '政策资讯' }}</a-tag></template>
                <template #status="{ record }"><a-tag :color="record.status === 1 ? 'green' : 'gray'">{{ record.status === 1 ? '上架' : '下架' }}</a-tag></template>
                <template #actions="{ record }">
                  <a-space :size="0">
                    <a-button type="text" size="small" @click="openContent(record)">编辑</a-button>
                    <a-button type="text" status="danger" size="small" @click="removeContent(record.id)">删除</a-button>
                  </a-space>
                </template>
              </a-table>
            </a-card>
            <a-button type="primary" shape="round" class="fab" @click="openContent(null)"><template #icon><IconPlus /></template>发布内容</a-button>
          </section>

          <section v-if="view === 'applications'">
            <a-card :bordered="false">
              <a-table
                :columns="applicationColumns"
                :data="applications"
                :pagination="false"
                row-key="id"
                size="middle"
              >
                <template #fields="{ record }">{{ (record.fields || []).join('、') }}</template>
                <template #paid="{ record }">
                  <span v-if="record.paidAmount > 0" class="muted">¥{{ record.paidAmount }}</span>
                  <span v-else class="muted">免费</span>
                </template>
                <template #status="{ record }"><a-tag :color="statusChip(record.status)">{{ record.status }}</a-tag></template>
                <template #actions="{ record }">
                  <template v-if="record.status === '待审核'">
                    <a-space :size="0">
                      <a-button type="primary" size="small" @click="approveApp(record.id)">通过</a-button>
                      <a-button size="small" @click="rejectApp(record.id)">拒绝</a-button>
                    </a-space>
                  </template>
                  <span v-else class="muted">{{ record.rejectReason || '已通过' }}</span>
                </template>
              </a-table>
            </a-card>
          </section>

          <section v-if="view === 'providers'">
            <a-card :bordered="false">
              <a-table
                :columns="providerColumns"
                :data="providerApplications"
                :pagination="false"
                row-key="id"
                size="middle"
              >
                <template #status="{ record }"><a-tag :color="statusChip(record.status)">{{ record.status }}</a-tag></template>
                <template #actions="{ record }">
                  <template v-if="record.status === '待审核'">
                    <a-space :size="0">
                      <a-button type="primary" size="small" @click="approveProvider(record.id)">通过</a-button>
                      <a-button size="small" @click="rejectProvider(record.id)">拒绝</a-button>
                    </a-space>
                  </template>
                  <span v-else class="muted">{{ record.rejectReason || '已通过' }}</span>
                </template>
              </a-table>
            </a-card>
          </section>

          <section v-if="view === 'managers'">
            <a-card :bordered="false">
              <a-table
                :columns="managerColumns"
                :data="managers"
                :pagination="false"
                row-key="id"
                size="middle"
              >
                <template #performance="{ record }"><span class="num">¥{{ record.totalPerformance }}</span></template>
                <template #commission="{ record }"><span class="num">¥{{ record.totalCommission }}</span></template>
                <template #available="{ record }"><span class="num">¥{{ record.available }}</span></template>
                <template #pending="{ record }"><span class="num">¥{{ record.pending }}</span></template>
                <template #withdrawing="{ record }"><span class="num">¥{{ record.withdrawing }}</span></template>
                <template #settled="{ record }"><span class="num">¥{{ record.settled }}</span></template>
                <template #status="{ record }"><a-tag :color="managerChip(record.status)">{{ record.status === 1 ? '正常' : record.status === 2 ? '已冻结' : '已清退' }}</a-tag></template>
                <template #actions="{ record }">
                  <a-space :size="0">
                    <a-button v-if="record.status !== 2" type="text" size="small" @click="setManagerStatus(record.id, 2)">冻结</a-button>
                    <a-button v-if="record.status === 2" type="text" size="small" @click="setManagerStatus(record.id, 1)">解冻</a-button>
                    <a-button type="text" status="danger" size="small" @click="setManagerStatus(record.id, 3)">清退</a-button>
                  </a-space>
                </template>
              </a-table>
            </a-card>
          </section>

          <section v-if="view === 'bindings'">
            <a-card title="解绑申请" :bordered="false" class="unbind-card">
              <a-table
                :columns="unbindColumns"
                :data="unbindApplications"
                :pagination="false"
                row-key="id"
                size="middle"
              >
                <template #status="{ record }"><a-tag :color="statusChip(record.status)">{{ record.status }}</a-tag></template>
                <template #actions="{ record }">
                  <template v-if="record.status === '待审核'">
                    <a-space :size="0">
                      <a-button type="primary" size="small" @click="approveUnbind(record.id)">通过</a-button>
                      <a-button size="small" @click="rejectUnbind(record.id)">拒绝</a-button>
                    </a-space>
                  </template>
                  <span v-else class="muted">{{ record.rejectReason || '已通过' }}</span>
                </template>
              </a-table>
            </a-card>
            <a-card :bordered="false">
              <a-table
                :columns="bindingColumns"
                :data="bindings"
                :pagination="false"
                row-key="id"
                size="middle"
              >
                <template #manager="{ record }">{{ managers.find((m) => String(m.id) === String(record.managerId))?.name || '散客' }}</template>
                <template #source="{ record }">{{ bindSource[record.bindSource] }}</template>
                <template #status="{ record }"><a-tag :color="bindingChip(record.status)">{{ record.status === 1 ? '有效' : record.status === 2 ? '已解除' : '已变更' }}</a-tag></template>
                <template #actions="{ record }">
                  <a-space :size="0">
                    <a-button type="text" size="small" @click="openRebind({ id: record.customerId, name: record.customerName })">改归属</a-button>
                    <a-button type="text" status="danger" size="small" @click="unbindCustomer(record.customerId)">解绑</a-button>
                  </a-space>
                </template>
              </a-table>
            </a-card>
          </section>

          <section v-if="view === 'commissions'">
            <div class="toolbar">
              <a-space wrap>
                <a-input-search v-model="kw" placeholder="搜索" allow-clear style="width: 240px" />
                <a-select
                  v-model="commissionManagerId"
                  :options="commissionManagerOptions"
                  placeholder="全部主理人"
                  allow-clear
                  style="width: 180px"
                />
                <a-button type="primary" @click="settleByManager">按主理人结算</a-button>
                <a-button @click="settleAll">全库一键转可结算</a-button>
                <a-button @click="exportCsv('commissions.csv', filteredCommissions)">导出佣金 CSV</a-button>
              </a-space>
            </div>
            <a-card :bordered="false">
              <a-table
                :columns="commissionColumns"
                :data="filteredCommissions"
                :pagination="false"
                row-key="id"
                :scroll="{ x: 1400 }"
                size="middle"
              >
                <template #manager="{ record }">{{ managers.find((m) => String(m.id) === String(record.managerId))?.name || record.managerId }}</template>
                <template #rate="{ record }">{{ record.commissionRate }}%</template>
                <template #amount="{ record }"><span class="num">¥{{ record.commissionAmount }}</span></template>
                <template #status="{ record }"><a-tag :color="statusChip(record.status)">{{ record.status }}</a-tag></template>
                <template #actions="{ record }">
                  <a-space :size="0">
                    <a-button v-if="record.status === '待结算'" type="text" size="small" @click="settleOne(record)">结算</a-button>
                    <a-button type="text" size="small" @click="openAdjust(record)">调整</a-button>
                  </a-space>
                </template>
              </a-table>
            </a-card>
            <a-card title="结算流水（按结算单留痕）" :bordered="false" style="margin-top: 16px">
              <a-table
                :columns="settlementColumns"
                :data="settlementRecords"
                :pagination="false"
                row-key="id"
                size="small"
              >
                <template #amount="{ record }"><span class="num">¥{{ record.amount }}</span></template>
              </a-table>
            </a-card>
          </section>

          <section v-if="view === 'withdraws'">
            <a-card :bordered="false">
              <a-table
                :columns="withdrawColumns"
                :data="withdraws"
                :pagination="false"
                row-key="id"
                size="middle"
              >
                <template #manager="{ record }">{{ managers.find((m) => String(m.id) === String(record.managerId))?.name || record.managerId }}</template>
                <template #amount="{ record }"><span class="num">¥{{ record.amount }}</span></template>
                <template #tax="{ record }"><span class="num">¥{{ record.tax ?? 0 }}</span></template>
                <template #actual="{ record }"><span class="num">¥{{ record.actualAmount ?? record.amount }}</span></template>
                <template #clawback="{ record }">{{ record.clawbackAmount ? `-¥${record.clawbackAmount}` : '—' }}</template>
                <template #status="{ record }"><a-tag :color="statusChip(record.status)">{{ record.status }}</a-tag></template>
                <template #actions="{ record }">
                  <template v-if="record.status === '待审核'">
                    <a-space :size="0">
                      <a-button type="primary" size="small" @click="approveWithdraw(record.id)">打款</a-button>
                      <a-button size="small" @click="rejectWithdraw(record.id)">拒绝</a-button>
                    </a-space>
                  </template>
                  <span v-else class="muted">{{ record.rejectReason || record.adjustNote || record.payTime || '' }}</span>
                </template>
              </a-table>
            </a-card>
          </section>

          <section v-if="view === 'logs'">
            <a-card :bordered="false">
              <a-table
                :columns="logColumns"
                :data="logs"
                :pagination="false"
                row-key="id"
                size="middle"
              >
                <template #action="{ record }"><a-tag color="arcoblue">{{ record.action }}</a-tag></template>
              </a-table>
            </a-card>
          </section>

          <section v-if="view === 'categories'">
            <a-card :bordered="false">
              <a-table
                :columns="categoryColumns"
                :data="categoryList"
                :pagination="false"
                row-key="id"
                size="middle"
              >
                <template #emoji="{ record }">{{ record.emoji }}</template>
                <template #type="{ record }"><a-tag :color="typeTagColor(record.type)">{{ typeName(record.type) }}</a-tag></template>
                <template #color="{ record }"><span class="color-dot" :style="{ background: record.color }"></span>{{ record.color }}</template>
                <template #actions="{ record }">
                  <a-space :size="0">
                    <a-button type="text" size="small" @click="openCategory(record)">编辑</a-button>
                    <a-button type="text" status="danger" size="small" @click="removeCategory(record.id)">删除</a-button>
                  </a-space>
                </template>
              </a-table>
            </a-card>
            <a-button type="primary" shape="round" class="fab" @click="openCategory(null)">
              <template #icon><IconPlus /></template>
              新建分类
            </a-button>
          </section>

          <section v-if="view === 'config' && config">
            <a-card title="规则配置" :bordered="false" class="config-card">
              <a-form :model="config" layout="vertical">
                <a-form-item label="全局默认分佣比例（%）">
                  <a-input-number v-model="config.globalCommissionRate" :min="0" :max="100" style="width: 100%" />
                </a-form-item>
                <a-form-item label="最低提现金额（元）">
                  <a-input-number v-model="config.minWithdraw" :min="0" style="width: 100%" />
                </a-form-item>
                <a-form-item label="每月提现次数上限">
                  <a-input-number v-model="config.withdrawMonthlyLimit" :min="0" style="width: 100%" />
                </a-form-item>
                <a-form-item label="提现代扣税费比例（%）">
                  <a-input-number v-model="config.withdrawTaxRate" :min="0" :max="100" style="width: 100%" />
                </a-form-item>
                <a-form-item label="主理人申请费用（元）">
                  <a-input-number v-model="config.managerApplyFee" :min="0" style="width: 100%" />
                </a-form-item>
                <a-form-item label="退款后优惠券退回">
                  <a-radio-group v-model="config.couponRefundReturn" type="button">
                    <a-radio value="auto">未出行退款退回（已核销不退）</a-radio>
                    <a-radio value="always">一律退回</a-radio>
                    <a-radio value="never">不退回</a-radio>
                  </a-radio-group>
                </a-form-item>
                <a-form-item label="用户申请退款是否需要审核">
                  <a-switch v-model="config.refundNeedAudit" />
                  <span class="muted" style="margin-left: 12px">
                    {{ config.refundNeedAudit !== false ? '开启：申请先进入「退款中」，由运营在订单页同意或拒绝' : '关闭：用户申请后即时退款' }}
                  </span>
                </a-form-item>
              </a-form>
            </a-card>

            <a-card title="品牌信息" :bordered="false" class="config-card">
              <a-form :model="config" layout="vertical">
                <a-form-item label="首页口号">
                  <a-input v-model="config.brand.slogan" placeholder="例如：和同龄人一起，玩得开心又省心" />
                </a-form-item>
              </a-form>
            </a-card>

            <a-card title="助理人信息" :bordered="false" class="config-card">
              <a-form :model="config" layout="vertical">
                <a-form-item label="助理人昵称"><a-input v-model="config.assistant.name" placeholder="例如：小助理" /></a-form-item>
                <a-form-item label="微信号"><a-input v-model="config.assistant.wechat" placeholder="例如：suiyueli6070" /></a-form-item>
                <a-form-item label="客服电话"><a-input v-model="config.assistant.phone" placeholder="例如：400-800-6070" /></a-form-item>
                <a-form-item label="头像（emoji）"><a-input v-model="config.assistant.avatar" placeholder="例如：🧑‍💼" /></a-form-item>
                <a-form-item label="一句话介绍"><a-input v-model="config.assistant.intro" placeholder="例如：报名咨询、活动群、售后都可以找我" /></a-form-item>
              </a-form>
            </a-card>

            <a-card title="备案信息" :bordered="false" class="config-card">
              <a-form :model="config" layout="vertical">
                <a-form-item label="公司名称"><a-input v-model="config.filing.companyName" placeholder="例如：北京岁悦里科技有限公司" /></a-form-item>
                <a-form-item label="ICP备案号"><a-input v-model="config.filing.icp" placeholder="例如：京ICP备2025001234号-1" /></a-form-item>
                <a-form-item label="公安备案号（可选）"><a-input v-model="config.filing.police" placeholder="例如：京公网安备11010102001234号" /></a-form-item>
              </a-form>
            </a-card>

            <div class="actions-row">
              <a-button type="primary" @click="saveConfig">保存全部配置</a-button>
            </div>
          </section>
        </a-spin>
      </a-layout-content>
    </a-layout>
  </a-layout>

  <a-modal
    v-if="activityForm"
    :visible="true"
    :title="activityForm.id ? '编辑活动' : '新建活动'"
    :width="640"
    @cancel="activityForm = null"
  >
    <a-form :model="activityForm" layout="vertical">
      <a-form-item label="标题"><a-input v-model="activityForm.title" /></a-form-item>
      <a-row :gutter="12">
        <a-col :span="12"><a-form-item label="分类"><a-select v-model="activityForm.category" :options="categoryOptions" /></a-form-item></a-col>
        <a-col :span="12"><a-form-item label="适用地区（可多选）"><a-select v-model="activityForm.regionIds" :options="enabledRegionOptions" multiple allow-search allow-clear placeholder="不选表示线上/全国" /></a-form-item></a-col>
      </a-row>
      <a-form-item label="地址"><a-input v-model="activityForm.address" /></a-form-item>
      <a-row :gutter="12">
        <a-col :span="12"><a-form-item label="会员价"><a-input-number v-model="activityForm.memberPrice" :min="0" style="width: 100%" /></a-form-item></a-col>
        <a-col :span="12"><a-form-item label="非会员价"><a-input-number v-model="activityForm.price" :min="0" style="width: 100%" /></a-form-item></a-col>
      </a-row>
      <a-row :gutter="12">
        <a-col :span="12"><a-form-item label="最低成团人数"><a-input-number v-model="activityForm.minGroup" :min="0" style="width: 100%" /></a-form-item></a-col>
        <a-col :span="12"><a-form-item label="商品级分佣比例（%）"><a-input-number v-model="activityForm.managerCommissionRate" :min="0" :max="100" style="width: 100%" placeholder="留空用全局" /></a-form-item></a-col>
      </a-row>
      <a-row :gutter="12">
        <a-col :span="8"><a-form-item label="状态"><a-select v-model="activityForm.status" :options="publishOptions" /></a-form-item></a-col>
        <a-col :span="8"><a-form-item label="购买方式"><a-select v-model="activityForm.sellType" :options="sellTypeOptions" /></a-form-item></a-col>
        <a-col :span="8"><a-form-item label="规格称谓"><a-input v-model="activityForm.skuLabel" placeholder="如：场地 / 房型 / 规格" /></a-form-item></a-col>
      </a-row>
      <a-form-item label="排班 JSON（预约日期用，高级）"><a-textarea v-model="activitySchedulesJson" :auto-size="{ minRows: 3, maxRows: 8 }" /></a-form-item>
      <a-form-item label="SKU JSON（每个 SKU 可加 address 场地地址、district 区域名）"><a-textarea v-model="activitySkusJson" :auto-size="{ minRows: 3, maxRows: 8 }" /></a-form-item>
    </a-form>
    <template #footer>
      <a-button @click="activityForm = null">取消</a-button>
      <a-button type="primary" @click="saveActivity">保存</a-button>
    </template>
  </a-modal>

  <a-modal
    v-if="productForm"
    :visible="true"
    :title="productForm.id ? '编辑商品' : '新建商品'"
    :width="560"
    @cancel="productForm = null"
  >
    <a-form :model="productForm" layout="vertical">
      <a-form-item label="标题"><a-input v-model="productForm.title" /></a-form-item>
      <a-row :gutter="12">
        <a-col :span="12"><a-form-item label="分类"><a-select v-model="productForm.category" :options="productCategoryOptions" /></a-form-item></a-col>
        <a-col :span="12"><a-form-item label="库存"><a-input-number v-model="productForm.stock" :min="0" style="width: 100%" /></a-form-item></a-col>
      </a-row>
      <a-form-item label="适用地区（可多选）">
        <a-select v-model="productForm.regionIds" :options="enabledRegionOptions" multiple allow-search allow-clear placeholder="不选表示全国/不限制地区" />
      </a-form-item>
      <a-row :gutter="12">
        <a-col :span="8"><a-form-item label="会员价"><a-input-number v-model="productForm.memberPrice" :min="0" style="width: 100%" /></a-form-item></a-col>
        <a-col :span="8"><a-form-item label="非会员价"><a-input-number v-model="productForm.price" :min="0" style="width: 100%" /></a-form-item></a-col>
        <a-col :span="8"><a-form-item label="原价"><a-input-number v-model="productForm.originalPrice" :min="0" style="width: 100%" /></a-form-item></a-col>
      </a-row>
      <a-row :gutter="12">
        <a-col :span="12"><a-form-item label="封面 emoji"><a-input v-model="productForm.cover" /></a-form-item></a-col>
        <a-col :span="12"><a-form-item label="封面渐变"><a-input v-model="productForm.coverTone" /></a-form-item></a-col>
      </a-row>
      <a-form-item label="亮点"><a-input v-model="productForm.highlight" /></a-form-item>
      <a-form-item label="状态"><a-select v-model="productForm.status" :options="publishOptions" /></a-form-item>
      <a-form-item label="SKU JSON（可选，高级）"><a-textarea v-model="productSkusJson" :auto-size="{ minRows: 3, maxRows: 8 }" /></a-form-item>
      <a-form-item label="详情"><a-textarea v-model="productForm.detail" :auto-size="{ minRows: 2, maxRows: 6 }" /></a-form-item>
    </a-form>
    <template #footer>
      <a-button @click="productForm = null">取消</a-button>
      <a-button type="primary" @click="saveProduct">保存</a-button>
    </template>
  </a-modal>

  <a-modal
    v-if="regionForm"
    :visible="true"
    :title="regionForm.id ? '编辑地区' : '新增地区'"
    :width="440"
    @cancel="regionForm = null"
  >
    <a-form :model="regionForm" layout="vertical">
      <a-form-item label="地区名称" required><a-input v-model="regionForm.name" placeholder="例如：佛山禅城" /></a-form-item>
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
    :title="shipForm.update ? `更新物流：${shipTarget.id}` : `订单发货：${shipTarget.id}`"
    :width="520"
    @cancel="closeShip"
  >
    <a-descriptions :column="1" size="small" bordered style="margin-bottom: 16px">
      <a-descriptions-item label="商品">{{ shipTarget.title }}{{ shipTarget.skuName ? ` · ${shipTarget.skuName}` : '' }}</a-descriptions-item>
      <a-descriptions-item label="收件人">
        <template v-if="shipTarget.address">{{ shipTarget.address.name }} {{ shipTarget.address.phone }}</template>
        <span v-else class="muted">无收货地址</span>
      </a-descriptions-item>
      <a-descriptions-item label="收货地址">{{ orderAddressText(shipTarget) || '—' }}</a-descriptions-item>
    </a-descriptions>
    <a-form :model="shipForm" layout="vertical">
      <a-form-item label="配送方式">
        <a-radio-group v-model="shipForm.deliveryType" type="button">
          <a-radio value="express">快递发货</a-radio>
          <a-radio value="self">无需物流（线下交付/自提）</a-radio>
        </a-radio-group>
      </a-form-item>
      <a-row v-if="shipForm.deliveryType === 'express'" :gutter="12">
        <a-col :span="10"><a-form-item label="快递公司"><a-select v-model="shipForm.carrier" :options="carrierOptions" /></a-form-item></a-col>
        <a-col :span="14"><a-form-item label="快递单号"><a-input v-model="shipForm.trackingNo" placeholder="例如 SF1234567890" /></a-form-item></a-col>
      </a-row>
      <a-form-item label="备注（选填）"><a-input v-model="shipForm.note" placeholder="例如：已电话确认收货时间" /></a-form-item>
    </a-form>
    <template #footer>
      <a-button @click="closeShip">取消</a-button>
      <a-button type="primary" @click="submitShip">{{ shipForm.update ? '保存物流' : '确认发货' }}</a-button>
    </template>
  </a-modal>

  <a-modal
    v-if="customerForm"
    :visible="true"
    :title="`编辑用户：${customerForm.name}`"
    :width="480"
    @cancel="customerForm = null"
  >
    <a-form :model="customerForm" layout="vertical">
      <a-form-item label="会员">
        <a-radio-group v-model="customerForm.member" type="button">
          <a-radio :value="true">是</a-radio>
          <a-radio :value="false">否</a-radio>
        </a-radio-group>
      </a-form-item>
      <a-form-item label="余额"><a-input-number v-model="customerForm.balance" :min="0" style="width: 100%" /></a-form-item>
      <a-form-item label="积分"><a-input-number v-model="customerForm.points" :min="0" style="width: 100%" /></a-form-item>
      <a-form-item label="手机号"><a-input v-model="customerForm.phone" /></a-form-item>
    </a-form>
    <template #footer>
      <a-button @click="customerForm = null">取消</a-button>
      <a-button type="primary" @click="saveCustomer">保存</a-button>
    </template>
  </a-modal>

  <a-modal
    v-if="couponForm"
    :visible="true"
    :title="couponForm.id ? '编辑优惠券' : '新建优惠券'"
    :width="480"
    @cancel="couponForm = null"
  >
    <a-form :model="couponForm" layout="vertical">
      <a-form-item label="标题"><a-input v-model="couponForm.title" /></a-form-item>
      <a-form-item label="类型"><a-select v-model="couponForm.type" :options="couponTypeOptions" /></a-form-item>
      <a-row :gutter="12">
        <a-col :span="12"><a-form-item label="面额"><a-input-number v-model="couponForm.value" :min="0" style="width: 100%" /></a-form-item></a-col>
        <a-col :span="12"><a-form-item label="使用门槛"><a-input-number v-model="couponForm.minAmount" :min="0" style="width: 100%" /></a-form-item></a-col>
      </a-row>
      <a-form-item label="适用分类（品类券）"><a-select v-model="couponForm.scopeCategory" :options="scopeCategoryOptions" /></a-form-item>
      <a-form-item label="适用商品 ID（指定商品券）"><a-input v-model="couponForm.scopeProductId" /></a-form-item>
      <a-form-item label="有效期至"><a-input v-model="couponForm.expireAt" /></a-form-item>
    </a-form>
    <template #footer>
      <a-button @click="couponForm = null">取消</a-button>
      <a-button type="primary" @click="saveCoupon">保存</a-button>
    </template>
  </a-modal>

  <a-modal
    v-if="contentForm"
    :visible="true"
    :title="contentForm.id ? '编辑资讯/视频' : '发布资讯/视频'"
    :width="680"
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
      <a-form-item label="封面图片地址"><a-input v-model="contentForm.coverImage" placeholder="例如：/assets/event-local.jpg" /></a-form-item>
      <a-form-item v-if="contentForm.type === 'video'" label="视频地址"><a-input v-model="contentForm.videoUrl" placeholder="HTTPS 视频或 m3u8 地址" /></a-form-item>
      <a-form-item label="正文/视频说明"><a-textarea v-model="contentForm.content" :auto-size="{ minRows: 5, maxRows: 12 }" /></a-form-item>
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
    :title="bannerForm.id ? '编辑 Banner' : '新建 Banner'"
    :width="480"
    @cancel="bannerForm = null"
  >
    <a-form :model="bannerForm" layout="vertical">
      <a-form-item label="标题"><a-input v-model="bannerForm.title" /></a-form-item>
      <a-form-item label="副标题"><a-input v-model="bannerForm.sub" /></a-form-item>
      <a-form-item label="图标（emoji）"><a-input v-model="bannerForm.emoji" /></a-form-item>
      <a-form-item label="渐变背景"><a-input v-model="bannerForm.tone" /></a-form-item>
      <a-form-item label="跳转分类（0=个人中心）"><a-input-number v-model="bannerForm.cat" :min="0" style="width: 100%" /></a-form-item>
    </a-form>
    <template #footer>
      <a-button @click="bannerForm = null">取消</a-button>
      <a-button type="primary" @click="saveBanner">保存</a-button>
    </template>
  </a-modal>

  <a-modal
    v-if="rebindTarget"
    :visible="true"
    :title="`修改归属：${rebindTarget.name}`"
    :width="440"
    @cancel="rebindTarget = null"
  >
    <a-form layout="vertical">
      <a-form-item label="新主理人"><a-select v-model="rebindManagerId" :options="managerOptions" /></a-form-item>
    </a-form>
    <template #footer>
      <a-button @click="rebindTarget = null">取消</a-button>
      <a-button type="primary" @click="confirmRebind">确认变更</a-button>
    </template>
  </a-modal>

  <a-modal
    v-if="adjustTarget"
    :visible="true"
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
    </a-form>
    <template #footer>
      <a-button @click="categoryForm = null">取消</a-button>
      <a-button type="primary" @click="saveCategory">保存</a-button>
    </template>
  </a-modal>

  <a-modal
    :visible="reasonModal.visible"
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
      <a-button type="primary" @click="submitReason">确定</a-button>
    </template>
  </a-modal>
</template>

<style scoped>
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

.stat-card {
  height: 100%;
}

.stat-prefix {
  font-size: 14px;
  color: var(--color-text-2);
}

.mt {
  margin-top: 16px;
}

.muted {
  color: var(--color-text-3);
  font-size: 13px;
}

.actions-row {
  margin-top: 16px;
}

.config-card {
  max-width: 520px;
  margin-bottom: 16px;
}

.unbind-card {
  margin-bottom: 16px;
}

.color-dot {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  margin-right: 8px;
  vertical-align: -2px;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
}

.fab {
  position: fixed;
  right: 32px;
  bottom: 32px;
  z-index: 20;
  box-shadow: 0 6px 20px rgba(29, 27, 22, 0.16);
}

:deep(.arco-modal-body) {
  max-height: 65vh;
  overflow: auto;
}
</style>
