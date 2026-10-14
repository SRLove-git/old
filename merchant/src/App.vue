<script setup>
import { computed, onMounted, ref } from 'vue'
import Message from '@arco-design/web-vue/es/message'
import Modal from '@arco-design/web-vue/es/modal'
import { IconArchive, IconCalendar, IconFile, IconMenuFold, IconMenuUnfold, IconPlus } from '@arco-design/web-vue/es/icon'
import { api, setToken, token } from './api.js'

const auth = ref({ username: '', password: '' })
const merchant = ref(null)
const view = ref('activities')
const rows = ref([])
const loading = ref(false)
const error = ref('')
const form = ref(null)
const uploading = ref(false)
const collapsed = ref(false)
const keyword = ref('')
const coverInput = ref(null)
const categories = ref({})
const regions = ref([])
const activitySchedules = ref([])
const activitySkus = ref([])
const activityDetailBlocks = ref([])
const activityRefundLadder = ref([])
const activityDetailUploading = ref({})
const courseVideoUploading = ref({})
const isPaidPrice = (value) => Number.isFinite(Number(value)) && Number(value) >= 0.01

const sections = [
  { key: 'activities', label: '活动发布', singular: '活动', icon: IconCalendar },
  { key: 'products', label: '商品发布', singular: '商品', icon: IconArchive },
  { key: 'courses', label: '课程发布', singular: '课程', icon: IconFile }
]
const current = computed(() => sections.find((item) => item.key === view.value))
const listingEditorSections = computed(() => view.value === 'products'
  ? [
      { key: 'basic', label: '基础信息', hint: '标题、图片与分类' },
      { key: 'sales', label: '销售信息', hint: '价格、库存与状态' },
      { key: 'fulfillment', label: '履约与售后', hint: '配送、核销与退改' },
      { key: 'detail', label: '商品详情', hint: '完整介绍与购买说明' }
    ]
  : [
      { key: 'basic', label: '基础信息', hint: '标题、图片与分类' },
      { key: 'sales', label: '销售设置', hint: '价格与上架状态' },
      { key: 'fulfillment', label: '预约与履约', hint: '场次、规格与退改' },
      { key: 'detail', label: '活动详情', hint: '完整介绍与报名说明' }
    ])
const listingProgress = computed(() => {
  if (!form.value || view.value === 'courses') return 0
  const done = listingEditorSections.value.filter((item) => listingSectionDone(item.key)).length
  return Math.round(done / listingEditorSections.value.length * 100)
})
const categoryOptions = computed(() => Object.entries(categories.value || {}).map(([value, item]) => ({ label: item.name, value: Number(value) })))
const enabledRegionOptions = computed(() => (regions.value || []).filter((item) => item.enabled !== false).map((item) => ({ label: item.fullName || item.name, value: String(item.id) })))
const refundRuleOptions = computed(() => [
  { label: '随时可退', value: 'always' },
  { label: '按活动开始前天数退款', value: 'day' },
  ...(view.value === 'activities' ? [{ label: '阶梯退款', value: 'ladder' }] : []),
  { label: '不支持退款', value: 'never' }
])
const filteredRows = computed(() => {
  const key = keyword.value.trim().toLowerCase()
  if (!key) return rows.value
  return rows.value.filter((item) => [item.title, item.hostName, item.city, item.address].filter(Boolean).join(' ').toLowerCase().includes(key))
})
const columns = computed(() => [
  { title: '封面', slotName: 'cover', width: 104 },
  { title: current.value.singular + '名称', slotName: 'title', ellipsis: true, tooltip: true },
  ...(view.value === 'courses'
    ? [{ title: '讲师', dataIndex: 'hostName', width: 130 }, { title: '课时', slotName: 'lessons', width: 90 }]
    : [{ title: '会员价', slotName: 'price', width: 120 }, { title: '履约方式', slotName: 'serviceMode', width: 130 }]),
  { title: '状态', slotName: 'status', width: 100 },
  { title: '操作', slotName: 'actions', width: 140, fixed: 'right' }
])

async function authenticate() {
  if (!auth.value.username.trim() || !auth.value.password) return (error.value = '请输入账号和密码')
  error.value = ''
  loading.value = true
  try {
    const result = await api.post('/merchant/login', auth.value)
    setToken(result.token)
    merchant.value = result.merchant
    auth.value.password = ''
    await loadReferenceData()
    await loadRows()
  } catch (e) { error.value = e.message } finally { loading.value = false }
}

async function restore() {
  if (!token()) return
  try { merchant.value = await api.get('/merchant/me'); await loadReferenceData(); await loadRows() } catch { setToken('') }
}

async function loadReferenceData() {
  const [categoryData, regionData] = await Promise.all([api.get('/categories'), api.get('/regions?enabled=1')])
  categories.value = categoryData || {}
  regions.value = regionData || []
}

async function loadRows() {
  loading.value = true
  error.value = ''
  try { rows.value = await api.get(`/merchant/${view.value}`) } catch (e) { error.value = e.message } finally { loading.value = false }
}

async function changeView(key) {
  view.value = key
  form.value = null
  keyword.value = ''
  await loadRows()
}

function emptyForm() {
  if (view.value === 'activities') return { title: '', coverImage: '', category: 1, city: '线上/全国', address: '', memberPrice: 0.01, price: 0.01, originalPrice: 0, status: 1, serviceMode: 'checkin', detail: '', schedules: [], skus: [], regionIds: [], soldCountMode: 'actual', refundRule: { type: 'day', fullDays: 2, partialDays: 0, partialRate: 0 } }
  if (view.value === 'products') return { title: '', coverImage: '', category: 5, city: '全国', memberPrice: 0.01, price: 0.01, originalPrice: 0, stock: 0, status: 1, serviceMode: 'delivery', detail: '', skus: [], regionIds: [], soldCountMode: 'actual', refundRule: { type: 'day', fullDays: 7, partialDays: 0, partialRate: 0 } }
  return { title: '', coverImage: '', hostName: '', category: '兴趣课程', status: 'scheduled', startAt: '', endAt: '', streamUrl: '', replayUrl: '', memberPrice: 0.01, originalPrice: 0, lessonCount: 1, lessons: [], duration: '', description: '' }
}

function openEditor(item = null) {
  form.value = item ? JSON.parse(JSON.stringify(item)) : emptyForm()
  courseVideoUploading.value = {}
  if (view.value === 'courses' && !Array.isArray(form.value.lessons)) form.value.lessons = []
  if (view.value !== 'courses') {
    form.value.refundRule ||= { type: 'day', fullDays: view.value === 'products' ? 7 : 2, partialDays: 0, partialRate: 0 }
    form.value.refundRule.partialRatePercent = Math.round(Number(form.value.refundRule.partialRate || 0) * 100)
    form.value.serviceDescription ||= ''
  }
  if (view.value === 'activities') {
    form.value.sellType ||= 'date'
    form.value.skuLabel ||= ''
    form.value.regionIds = Array.isArray(form.value.regionIds) ? form.value.regionIds.map(String) : []
    form.value.soldCountMode ||= 'actual'
    form.value.manualSoldCount ||= 0
    form.value.minGroup ||= 0
    activitySchedules.value = (form.value.schedules || []).map(scheduleEditorRow)
    activitySkus.value = (form.value.skus || []).map((sku) => ({ ...sku }))
    activityDetailBlocks.value = Array.isArray(form.value.detailBlocks) && form.value.detailBlocks.length
      ? form.value.detailBlocks.map((block) => ({ ...block }))
      : [{ type: 'text', text: form.value.detail || '' }]
    const rule = form.value.refundRule || { type: 'day', fullDays: 2, partialDays: 0, partialRate: 0 }
    form.value.refundRule = { ...rule, partialRatePercent: Math.round(Number(rule.partialRate || 0) * 100) }
    activityRefundLadder.value = (rule.ladder || []).map((item) => ({ days: Number(item.days || 0), ratePercent: Math.round(Number(item.rate || 0) * 100) }))
  }
}

function listingSectionDone(key) {
  const value = form.value || {}
  if (key === 'basic') return Boolean(String(value.title || '').trim() && value.coverImage && value.category)
  if (key === 'sales') return isPaidPrice(value.memberPrice) && isPaidPrice(value.price) && value.status !== undefined && (view.value !== 'products' || Number(value.stock) >= 0)
  if (key === 'fulfillment') return Boolean(value.serviceMode && (view.value !== 'activities' || (value.sellType === 'date' ? activitySchedules.value.length : activitySkus.value.length)))
  if (key === 'detail') return view.value === 'activities'
    ? activityDetailBlocks.value.some((block) => block.type === 'text' ? String(block.text || '').trim() : block.type === 'image' ? block.src : block.url)
    : Boolean(String(value.detail || '').trim())
  return false
}

function scrollListingSection(key) {
  document.getElementById(`merchant-editor-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function addLesson() { form.value.lessons.push({ id: `lesson-${Date.now()}`, title: '', duration: '', videoUrl: '', isPreview: false, status: 1 }) }
function removeLesson(index) { form.value.lessons.splice(index, 1) }
function moveLesson(index, direction) {
  const target = index + direction
  if (target < 0 || target >= form.value.lessons.length) return
  const lessons = [...form.value.lessons]
  ;[lessons[index], lessons[target]] = [lessons[target], lessons[index]]
  form.value.lessons = lessons
}

function lessonUploadKey(lesson, index) {
  return lesson.id || `lesson-${index}`
}

async function uploadCourseVideo(event, lesson, index) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  const extension = String(file.name || '').split('.').pop().toLowerCase()
  const validType = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v'].includes(file.type)
  if (!validType && !['mp4', 'webm', 'mov', 'm4v'].includes(extension)) return Message.warning('课程视频仅支持 MP4、WebM、MOV 或 M4V 格式')
  const key = lessonUploadKey(lesson, index)
  courseVideoUploading.value = { ...courseVideoUploading.value, [key]: true }
  try {
    const result = await api.post('/merchant/uploads/course-video', { dataUrl: await fileDataUrl(file), fileName: file.name })
    lesson.videoUrl = result.url
    Message.success(`第 ${index + 1} 节视频上传成功`)
  } catch (e) {
    Message.error(e.message || '视频上传失败')
  } finally {
    courseVideoUploading.value = { ...courseVideoUploading.value, [key]: false }
  }
}

function parseScheduleTime(value) {
  const text = String(value || '').trim()
  const matched = text.match(/^(\d{1,2}:\d{2})\s*[-—~至]\s*(\d{1,2}:\d{2})$/)
  return matched ? { startTime: matched[1], endTime: matched[2], originalTime: '' } : { startTime: '', endTime: '', originalTime: text }
}

function scheduleEditorRow(schedule = {}) {
  const parsed = parseScheduleTime(schedule.time)
  return { ...schedule, full: String(schedule.full || ''), startTime: parsed.startTime, endTime: parsed.endTime, originalTime: parsed.originalTime, totalQuota: Number(schedule.totalQuota ?? form.value?.maxGroup ?? 0), soldQuota: Number(schedule.soldQuota || 0) }
}

function addActivitySchedule() { activitySchedules.value.push(scheduleEditorRow({ totalQuota: form.value?.maxGroup || 0 })) }
function removeActivitySchedule(index) { activitySchedules.value.splice(index, 1) }
function scheduleDateText(full) {
  const matched = String(full || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return matched ? `${Number(matched[2])}月${Number(matched[3])}日` : ''
}
function scheduleWeekday(full) {
  const date = new Date(`${full}T00:00:00`)
  return Number.isNaN(date.getTime()) ? '' : `周${['日', '一', '二', '三', '四', '五', '六'][date.getDay()]}`
}
function serializeActivitySchedules() {
  return activitySchedules.value.map((schedule, index) => {
    const full = String(schedule.full || '').trim()
    const startTime = String(schedule.startTime || '').trim()
    const endTime = String(schedule.endTime || '').trim()
    const time = startTime && endTime ? `${startTime}-${endTime}` : String(schedule.originalTime || '').trim()
    if (!full || !time || (!!startTime !== !!endTime)) throw new Error(`请完整填写第 ${index + 1} 个场次的日期和时间`)
    const totalQuota = Math.max(0, Number(schedule.totalQuota || 0))
    const soldQuota = Math.max(0, Number(schedule.soldQuota || 0))
    return { ...schedule, id: schedule.id || `schedule-${Date.now()}-${index + 1}`, full, date: scheduleDateText(full), weekday: scheduleWeekday(full), time, totalQuota, soldQuota, remaining: Math.max(0, totalQuota - soldQuota), startTime: undefined, endTime: undefined, originalTime: undefined }
  })
}

function addActivitySku() { activitySkus.value.push({ id: `sku-${Date.now()}`, name: '', price: 0.01, memberPrice: 0.01, stock: 0, address: '', district: '', hot: false }) }
function removeActivitySku(index) { activitySkus.value.splice(index, 1) }
function addRefundLadderRow() { activityRefundLadder.value.push({ days: 0, ratePercent: 0 }) }
function removeRefundLadderRow(index) { activityRefundLadder.value.splice(index, 1) }
function addActivityDetailBlock(type) {
  activityDetailBlocks.value.push(type === 'text' ? { type, text: '' } : type === 'image' ? { type, src: '', caption: '' } : { type, url: '', caption: '' })
}
function removeActivityDetailBlock(index) { activityDetailBlocks.value.splice(index, 1) }
function moveActivityDetailBlock(index, direction) {
  const target = index + direction
  if (target < 0 || target >= activityDetailBlocks.value.length) return
  const blocks = [...activityDetailBlocks.value]
  ;[blocks[index], blocks[target]] = [blocks[target], blocks[index]]
  activityDetailBlocks.value = blocks
}

async function uploadActivityDetailAsset(event, index, type) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  const isVideo = type === 'video'
  const valid = isVideo ? ['video/mp4', 'video/webm'].includes(file.type) : ['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
  if (!valid) return Message.warning(isVideo ? '视频仅支持 MP4 或 WebM' : '图片仅支持 PNG、JPG 或 WebP')
  if (file.size > (isVideo ? 15 : 2) * 1024 * 1024) return Message.warning(isVideo ? '视频不能超过15MB' : '图片不能超过2MB')
  activityDetailUploading.value = { ...activityDetailUploading.value, [index]: true }
  try {
    const result = await api.post(`/merchant/uploads/${isVideo ? 'video' : 'image'}`, { dataUrl: await fileDataUrl(file), fileName: file.name })
    if (isVideo) activityDetailBlocks.value[index].url = result.url
    else activityDetailBlocks.value[index].src = result.url
    Message.success(`${isVideo ? '视频' : '图片'}上传成功`)
  } catch (e) { Message.error(e.message || '上传失败') } finally {
    activityDetailUploading.value = { ...activityDetailUploading.value, [index]: false }
  }
}

function prepareActivityPayload() {
  const payload = JSON.parse(JSON.stringify(form.value))
  if (payload.sellType === 'date' && !activitySchedules.value.length) throw new Error('请至少添加一个预约场次')
  if (payload.sellType === 'sku' && !activitySkus.value.length) throw new Error('请至少添加一个活动规格')
  if (activitySkus.value.some((sku) => !String(sku.name || '').trim())) throw new Error('请补全活动规格名称，或删除空白规格')
  payload.schedules = serializeActivitySchedules()
  payload.skus = activitySkus.value.map((sku, index) => ({ ...sku, id: sku.id || `sku-${Date.now()}-${index + 1}`, name: String(sku.name || '').trim() })).filter((sku) => sku.name)
  payload.hasSku = payload.sellType === 'sku' || payload.skus.length > 0
  payload.detailBlocks = activityDetailBlocks.value.map((block) => ({ ...block })).filter((block) => block.type === 'text' ? String(block.text || '').trim() : block.type === 'image' ? block.src : block.url)
  payload.detail = payload.detailBlocks.filter((block) => block.type === 'text').map((block) => block.text).join('\n\n')
  const refundType = payload.refundRule?.type || 'never'
  payload.refundRule = refundType === 'day'
    ? { type: 'day', fullDays: Number(payload.refundRule.fullDays || 0), partialDays: Number(payload.refundRule.partialDays || 0), partialRate: Number(payload.refundRule.partialRatePercent || 0) / 100 }
    : refundType === 'ladder'
      ? { type: 'ladder', ladder: activityRefundLadder.value.map((item) => ({ days: Number(item.days || 0), rate: Number(item.ratePercent || 0) / 100 })).sort((a, b) => b.days - a.days) }
      : { type: refundType }
  payload.regionIds = (payload.regionIds || []).map(String)
  return payload
}

async function save() {
  if (!String(form.value.title || '').trim()) return Message.warning(`请填写${current.value.singular}名称`)
  if (!isPaidPrice(form.value.memberPrice)) return Message.warning(`${current.value.singular}会员价最低为0.01元，不能为0元`)
  if (view.value !== 'courses' && !isPaidPrice(form.value.price)) return Message.warning(`${current.value.singular}非会员价最低为0.01元，不能为0元`)
  if (view.value === 'courses') {
    if (!form.value.startAt) return Message.warning('请选择课程开始时间')
    if (!form.value.endAt) return Message.warning('请选择课程结束时间')
    const startTime = new Date(String(form.value.startAt).replace(' ', 'T')).getTime()
    const endTime = new Date(String(form.value.endAt).replace(' ', 'T')).getTime()
    if (Number.isFinite(startTime) && Number.isFinite(endTime) && endTime <= startTime) return Message.warning('结束时间必须晚于开始时间')
    const invalid = form.value.lessons.findIndex((lesson) => !String(lesson.title || '').trim())
    if (invalid >= 0) return Message.warning(`请填写第 ${invalid + 1} 节标题`)
    form.value.lessonCount = form.value.lessons.length || Number(form.value.lessonCount || 1)
  }
  let payload = form.value
  if (view.value === 'activities') {
    try { payload = prepareActivityPayload() } catch (e) { return Message.warning(e.message) }
    if (payload.skus.some((sku) => !isPaidPrice(sku.memberPrice) || !isPaidPrice(sku.price))) return Message.warning('每个活动规格的会员价和非会员价最低为0.01元')
  } else if (view.value === 'products') {
    payload = JSON.parse(JSON.stringify(form.value))
    if (payload.refundRule?.type === 'day') payload.refundRule.partialRate = Number(payload.refundRule.partialRatePercent || 0) / 100
  }
  loading.value = true
  error.value = ''
  try {
    if (form.value.id) await api.put(`/merchant/${view.value}/${form.value.id}`, payload)
    else await api.post(`/merchant/${view.value}`, payload)
    form.value = null
    await loadRows()
    Message.success('已保存')
  } catch (e) { error.value = e.message; Message.error(e.message) } finally { loading.value = false }
}

function remove(item) {
  Modal.confirm({
    title: '二次确认', content: `确定删除“${item.title}”吗？`, okText: '删除', cancelText: '取消', okButtonProps: { status: 'danger' },
    onOk: async () => {
      try { await api.del(`/merchant/${view.value}/${item.id}`); await loadRows(); Message.success('已删除') }
      catch (e) { error.value = e.message; Message.error(e.message) }
    }
  })
}

function logout() { setToken(''); merchant.value = null; rows.value = []; form.value = null }
function fileDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file) }) }
async function uploadCover(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) return Message.warning('仅支持不超过2MB的 PNG、JPG、WebP 图片')
  uploading.value = true
  try { const dataUrl = await fileDataUrl(file); const result = await api.post('/merchant/uploads/image', { dataUrl, fileName: file.name }); form.value.coverImage = result.url }
  catch (e) { error.value = e.message; Message.error(e.message) } finally { uploading.value = false }
}

function coverUrl(value) { if (!value || /^(https?:|data:)/.test(value)) return value; return `${import.meta.env.BASE_URL.replace(/\/$/, '')}${value}` }
function statusText(item) {
  if (item.status === 0) return '已下架'
  if (item.status === 'ended') return '已结束'
  if (item.status === 'live') return '直播中'
  if (item.status === 'scheduled') return '已排期'
  return '已发布'
}
function statusColor(item) { return item.status === 0 || item.status === 'ended' ? 'gray' : item.status === 'live' ? 'red' : item.status === 'scheduled' ? 'orange' : 'green' }
function serviceModeText(value) { return ({ checkin: '线下签到', verify_code: '核销码', online: '线上服务', delivery: '物流配送' })[value] || '—' }

onMounted(restore)
</script>

<template>
  <div v-if="!merchant" class="login-page">
    <div class="login-card">
      <div class="login-logo">岁</div>
      <div class="login-title">岁悦里 · 商户端</div>
      <div class="login-sub">发布和管理商品、活动与课程</div>
      <a-form :model="auth" layout="vertical">
        <a-form-item label="登录账号"><a-input v-model="auth.username" size="large" placeholder="请输入商户账号" allow-clear @press-enter="authenticate" /></a-form-item>
        <a-form-item label="密码"><a-input-password v-model="auth.password" size="large" placeholder="请输入密码" @press-enter="authenticate" /></a-form-item>
        <a-alert type="info" class="login-tip">商户账号由运营后台审核并开通。</a-alert>
        <div v-if="error" class="login-error">{{ error }}</div>
        <a-button type="primary" size="large" long :loading="loading" @click="authenticate">登录商户端</a-button>
      </a-form>
    </div>
  </div>

  <a-layout v-else class="layout">
    <a-layout-sider collapsible :collapsed="collapsed" :width="240" :collapsed-width="64" breakpoint="lg" class="sider">
      <div class="logo">{{ collapsed ? '岁' : '岁悦里 · 商户端' }}</div>
      <a-menu :selected-keys="[view]" :collapsed="collapsed" @menu-item-click="changeView">
        <a-menu-item v-for="item in sections" :key="item.key"><template #icon><component :is="item.icon" /></template>{{ item.label }}</a-menu-item>
      </a-menu>
      <template #trigger><div class="sider-trigger"><component :is="collapsed ? IconMenuUnfold : IconMenuFold" /></div></template>
    </a-layout-sider>

    <a-layout>
      <a-layout-header class="topbar">
        <div class="topbar-inner">
          <a-button type="text" aria-label="切换导航" @click="collapsed = !collapsed"><template #icon><component :is="collapsed ? IconMenuUnfold : IconMenuFold" /></template></a-button>
          <span class="topbar-title">{{ current.label }}</span><div class="topbar-spacer"></div>
          <a-space :size="10"><a-avatar :size="30" class="avatar">商</a-avatar><div class="merchant-identity"><strong>{{ merchant.shopName }}</strong><span>{{ merchant.contactName }}</span></div></a-space>
          <a-button type="text" size="small" @click="logout">退出登录</a-button>
        </div>
      </a-layout-header>

      <a-layout-content class="content">
        <a-alert v-if="error" type="error" closable class="error" @close="error = ''">{{ error }}</a-alert>
        <a-spin :loading="loading" tip="加载中…" class="spin">
          <div class="page-intro"><div><h1>{{ current.label }}</h1><p>管理{{ merchant.shopName }}的{{ current.singular }}内容与上架状态</p></div><a-button type="primary" @click="openEditor()"><template #icon><IconPlus /></template>新建{{ current.singular }}</a-button></div>
          <div class="toolbar"><a-input-search v-model="keyword" :placeholder="`搜索${current.singular}名称`" allow-clear style="width: 300px" /><span class="muted">共 {{ filteredRows.length }} 条</span></div>
          <a-card :bordered="false">
            <a-table :columns="columns" :data="filteredRows" :pagination="{ pageSize: 10, showTotal: true }" row-key="id" :scroll="{ x: 900 }">
              <template #cover="{ record }"><img v-if="record.coverImage" class="table-cover" :src="coverUrl(record.coverImage)" :alt="record.title" /><div v-else class="table-cover table-cover-empty">{{ current.singular.slice(0, 1) }}</div></template>
              <template #title="{ record }"><strong>{{ record.title }}</strong><div class="muted">ID：{{ record.id }}</div></template>
              <template #price="{ record }"><span class="num">¥{{ Number(record.memberPrice || 0).toFixed(2) }}</span></template>
              <template #lessons="{ record }">{{ (record.lessons || []).length || record.lessonCount || 0 }} 节</template>
              <template #serviceMode="{ record }">{{ serviceModeText(record.serviceMode) }}</template>
              <template #status="{ record }"><a-tag :color="statusColor(record)">{{ statusText(record) }}</a-tag></template>
              <template #actions="{ record }"><a-space :size="0"><a-button type="text" size="small" @click="openEditor(record)">编辑</a-button><a-button type="text" size="small" status="danger" @click="remove(record)">删除</a-button></a-space></template>
            </a-table>
          </a-card>
        </a-spin>
      </a-layout-content>
    </a-layout>

    <a-modal v-if="form" :visible="true" :title="`${form.id ? '编辑' : '新建'}${current.singular}`" :width="view === 'courses' ? 820 : 1120" :mask-closable="false" :class="{ 'listing-editor-modal': view !== 'courses' }" @cancel="form = null">
      <a-form :model="form" layout="vertical">
        <div v-if="view !== 'courses'" class="listing-editor-layout">
          <aside class="listing-editor-sidebar">
            <div class="editor-progress-card">
              <div class="editor-progress-head"><strong>信息完整度</strong><span>{{ listingProgress }}%</span></div>
              <a-progress :percent="listingProgress / 100" :show-text="false" size="small" />
              <div class="editor-progress-tip">完整的信息能帮助用户更快了解并下单</div>
            </div>
            <button v-for="(section, index) in listingEditorSections" :key="section.key" type="button" class="editor-step" @click="scrollListingSection(section.key)">
              <span class="editor-step-index" :class="{ done: listingSectionDone(section.key) }">{{ listingSectionDone(section.key) ? '✓' : index + 1 }}</span>
              <span><strong>{{ section.label }}</strong><small>{{ section.hint }}</small></span>
            </button>
            <div class="editor-help-card"><strong>发布建议</strong><span>{{ view === 'products' ? '建议使用清晰的商品主图，并完整填写价格、库存和配送说明。' : '建议先填写活动基础信息，再确认履约方式和退改规则。' }}</span></div>
          </aside>

          <main class="listing-editor-main">
            <section id="merchant-editor-basic" class="listing-section">
              <div class="listing-section-head"><div><span class="listing-section-index">01</span><strong>基础信息</strong></div><p>设置用户第一眼看到的标题、封面与分类</p></div>
              <a-form-item :label="`${current.singular}名称`" required><a-input v-model="form.title" :max-length="60" show-word-limit :placeholder="view === 'products' ? '建议填写品牌、品名、规格与核心卖点' : '建议填写活动主题、亮点与适用人群'" /></a-form-item>
              <a-form-item label="封面图片" required><div class="cover-uploader"><img v-if="form.coverImage" class="cover-preview" :src="coverUrl(form.coverImage)" alt="封面预览" /><div v-else class="cover-preview cover-empty">暂无封面</div><input ref="coverInput" type="file" accept="image/png,image/jpeg,image/webp" hidden @change="uploadCover" /><a-space><a-button type="primary" :loading="uploading" @click="coverInput?.click()">上传封面</a-button><a-button v-if="form.coverImage" @click="form.coverImage = ''">移除</a-button></a-space><div class="muted">支持 PNG、JPG、WebP，最大 2MB；建议使用 4:3 横图</div></div></a-form-item>
              <a-row :gutter="12">
                <a-col :span="12"><a-form-item label="分类"><a-select v-model="form.category" :options="categoryOptions" /></a-form-item></a-col>
                <a-col v-if="view === 'activities'" :span="12"><a-form-item label="适用地区（可多选）"><a-select v-model="form.regionIds" :options="enabledRegionOptions" multiple allow-search allow-clear placeholder="不选表示线上/全国" /></a-form-item></a-col>
              </a-row>
              <a-form-item v-if="view === 'activities'" label="地址"><a-input v-model="form.address" /></a-form-item>
            </section>

            <section id="merchant-editor-sales" class="listing-section">
              <div class="listing-section-head"><div><span class="listing-section-index">02</span><strong>{{ view === 'products' ? '销售信息' : '销售设置' }}</strong></div><p>设置价格、库存和用户端上架状态</p></div>
              <a-row :gutter="12"><a-col :span="view === 'products' ? 8 : 12"><a-form-item label="会员价"><a-input-number v-model="form.memberPrice" :min="0.01" :step="0.01" :precision="2" style="width:100%" /></a-form-item></a-col><a-col :span="view === 'products' ? 8 : 12"><a-form-item label="非会员价"><a-input-number v-model="form.price" :min="0.01" :step="0.01" :precision="2" style="width:100%" /></a-form-item></a-col><a-col v-if="view === 'products'" :span="8"><a-form-item label="原价"><a-input-number v-model="form.originalPrice" :min="0" :precision="2" style="width:100%" /></a-form-item></a-col></a-row>
              <a-row :gutter="12"><a-col v-if="view === 'products'" :span="12"><a-form-item label="库存"><a-input-number v-model="form.stock" :min="0" style="width:100%" /></a-form-item></a-col><a-col :span="view === 'products' ? 12 : 24"><a-form-item label="状态"><a-radio-group v-model="form.status" type="button"><a-radio :value="1">上架销售</a-radio><a-radio :value="0">暂不展示</a-radio></a-radio-group></a-form-item></a-col></a-row>
              <template v-if="view === 'activities'">
                <a-row :gutter="12"><a-col :span="12"><a-form-item label="最低成团人数"><a-input-number v-model="form.minGroup" :min="0" style="width:100%" /></a-form-item></a-col><a-col :span="12"><a-form-item label="已购买人数来源"><a-radio-group v-model="form.soldCountMode" type="button"><a-radio value="actual">自动统计</a-radio><a-radio value="manual">人工设置</a-radio></a-radio-group></a-form-item></a-col></a-row>
                <a-form-item v-if="form.soldCountMode === 'manual'" label="人工已购买人数"><a-input-number v-model="form.manualSoldCount" :min="0" style="width:100%" /></a-form-item>
                <a-row :gutter="12"><a-col :span="12"><a-form-item label="购买方式"><a-select v-model="form.sellType" :options="[{ label: '预约日期（选日期/场次）', value: 'date' }, { label: 'SKU选择（选规格/房型）', value: 'sku' }]" /></a-form-item></a-col><a-col :span="12"><a-form-item label="规格称谓"><a-input v-model="form.skuLabel" placeholder="如：场地 / 房型 / 规格" /></a-form-item></a-col></a-row>
              </template>
            </section>

            <section id="merchant-editor-fulfillment" class="listing-section">
              <div class="listing-section-head"><div><span class="listing-section-index">03</span><strong>{{ view === 'products' ? '履约与售后' : '活动履约' }}</strong></div><p>明确用户购买后的交付、核销和退款方式</p></div>
              <a-row :gutter="12"><a-col :span="12"><a-form-item label="履约方式"><a-select v-model="form.serviceMode" :options="[{ label: '线下签到核销', value: 'checkin' }, { label: '核销码核销', value: 'verify_code' }, { label: '线上服务', value: 'online' }, { label: '物流配送', value: 'delivery' }]" /></a-form-item></a-col><a-col :span="12"><a-form-item label="服务说明"><a-input v-model="form.serviceDescription" placeholder="例如：下单后2个工作日内发货" /></a-form-item></a-col></a-row>
              <a-form-item label="退款规则"><a-select v-model="form.refundRule.type" :options="refundRuleOptions" /></a-form-item>
              <a-row v-if="form.refundRule.type === 'day'" :gutter="12"><a-col :span="8"><a-form-item label="全额退款截止天数"><a-input-number v-model="form.refundRule.fullDays" :min="0" style="width:100%" /></a-form-item></a-col><a-col :span="8"><a-form-item label="部分退款截止天数"><a-input-number v-model="form.refundRule.partialDays" :min="0" style="width:100%" /></a-form-item></a-col><a-col :span="8"><a-form-item label="部分退款比例（%）"><a-input-number v-model="form.refundRule.partialRatePercent" :min="0" :max="100" style="width:100%" /></a-form-item></a-col></a-row>
              <template v-else-if="view === 'activities' && form.refundRule.type === 'ladder'">
                <div v-for="(item, index) in activityRefundLadder" :key="index" class="refund-ladder-row"><span>活动开始前</span><a-input-number v-model="item.days" :min="0" /><span>天，可退款</span><a-input-number v-model="item.ratePercent" :min="0" :max="100" /><span>%</span><a-button type="text" status="danger" @click="removeRefundLadderRow(index)">删除</a-button></div>
                <a-button type="outline" long @click="addRefundLadderRow">新增阶梯</a-button>
              </template>
              <template v-if="view === 'activities'">
                <a-form-item v-if="form.sellType === 'date'" label="预约日期和时间"><div class="schedule-editor"><div v-if="!activitySchedules.length" class="schedule-empty">暂无场次，请点击下方按钮添加预约日期</div><div v-for="(schedule, index) in activitySchedules" :key="schedule.id || index" class="schedule-row"><div class="schedule-field schedule-date-field"><span>日期</span><a-date-picker v-model="schedule.full" value-format="YYYY-MM-DD" placeholder="选择日期" style="width:100%" /></div><div class="schedule-field"><span>开始时间</span><a-time-picker v-model="schedule.startTime" format="HH:mm" placeholder="开始时间" style="width:100%" /></div><div class="schedule-field"><span>结束时间</span><a-time-picker v-model="schedule.endTime" format="HH:mm" placeholder="结束时间" style="width:100%" /></div><div class="schedule-field schedule-quota-field"><span>名额</span><a-input-number v-model="schedule.totalQuota" :min="0" style="width:100%" /></div><a-button status="danger" type="text" class="schedule-remove" @click="removeActivitySchedule(index)">删除</a-button><div v-if="schedule.soldQuota" class="schedule-sold">已报名 {{ schedule.soldQuota }} 人</div></div><a-button type="outline" long @click="addActivitySchedule">新增预约场次</a-button></div></a-form-item>
                <a-form-item v-if="form.sellType === 'sku'" :label="form.skuLabel || '活动规格'"><div class="product-sku-editor"><div class="editor-table-head"><span>规格名称</span><span>会员价</span><span>非会员价</span><span>名额</span><span>标记</span><span>操作</span></div><div v-if="!activitySkus.length" class="schedule-empty">暂无规格，请添加场地、房型或套餐选项。</div><div v-for="(sku, index) in activitySkus" :key="sku.id || index" class="product-sku-row activity-sku-row"><a-input v-model="sku.name" placeholder="如：天河场 / 标间" /><a-input-number v-model="sku.memberPrice" :min="0.01" :step="0.01" :precision="2" placeholder="会员价" /><a-input-number v-model="sku.price" :min="0.01" :step="0.01" :precision="2" placeholder="非会员价" /><a-input-number v-model="sku.stock" :min="0" placeholder="名额" /><a-checkbox v-model="sku.hot">推荐</a-checkbox><a-button type="text" status="danger" @click="removeActivitySku(index)">删除</a-button><a-input v-model="sku.district" placeholder="区域（可选）" /><a-input v-model="sku.address" placeholder="活动场地详细地址" class="product-sku-address" /></div><a-button type="outline" long @click="addActivitySku">新增活动规格</a-button></div></a-form-item>
              </template>
            </section>

            <section id="merchant-editor-detail" class="listing-section">
              <div class="listing-section-head"><div><span class="listing-section-index">04</span><strong>{{ current.singular }}详情</strong></div><p>补充亮点、适用人群、使用方法和注意事项</p></div>
              <a-form-item v-if="view === 'activities'" label="活动详情编辑器"><div class="detail-block-editor"><div v-if="!activityDetailBlocks.length" class="schedule-empty">暂无详情内容，请添加文字、图片或视频。</div><div v-for="(block, index) in activityDetailBlocks" :key="index" class="detail-block-row"><div class="detail-block-head"><a-tag :color="block.type === 'text' ? 'arcoblue' : block.type === 'image' ? 'green' : 'purple'">{{ block.type === 'text' ? '文字' : block.type === 'image' ? '图片' : '视频' }}</a-tag><a-space :size="4"><a-button type="text" size="mini" :disabled="index === 0" @click="moveActivityDetailBlock(index, -1)">上移</a-button><a-button type="text" size="mini" :disabled="index === activityDetailBlocks.length - 1" @click="moveActivityDetailBlock(index, 1)">下移</a-button><a-button type="text" size="mini" status="danger" @click="removeActivityDetailBlock(index)">删除</a-button></a-space></div><a-textarea v-if="block.type === 'text'" v-model="block.text" :auto-size="{ minRows: 3, maxRows: 10 }" placeholder="输入活动介绍文字" /><template v-else-if="block.type === 'image'"><img v-if="block.src" class="detail-block-image" :src="coverUrl(block.src)" alt="详情图片预览" /><a-input v-model="block.src" placeholder="图片地址，或使用下方按钮上传" /><a-input v-model="block.caption" placeholder="图片说明（可选）" /><label class="detail-upload-button"><input type="file" accept="image/png,image/jpeg,image/webp" hidden @change="uploadActivityDetailAsset($event, index, 'image')" /><a-button type="outline" size="small" :loading="activityDetailUploading[index]" @click.prevent="$event.currentTarget.parentElement.querySelector('input').click()">上传图片</a-button></label></template><template v-else><video v-if="block.url" class="detail-block-video" :src="coverUrl(block.url)" controls preload="metadata"></video><a-input v-model="block.url" placeholder="视频地址，或上传本地视频" /><a-input v-model="block.caption" placeholder="视频说明（可选）" /><label class="detail-upload-button"><input type="file" accept="video/mp4,video/webm" hidden @change="uploadActivityDetailAsset($event, index, 'video')" /><a-button type="outline" size="small" :loading="activityDetailUploading[index]" @click.prevent="$event.currentTarget.parentElement.querySelector('input').click()">上传本地视频</a-button></label></template></div><a-space><a-button type="outline" @click="addActivityDetailBlock('text')">添加文字</a-button><a-button type="outline" @click="addActivityDetailBlock('image')">添加图片</a-button><a-button type="outline" @click="addActivityDetailBlock('video')">添加视频</a-button></a-space></div></a-form-item>
              <a-form-item v-else label="详情内容"><a-textarea v-model="form.detail" :auto-size="{ minRows: 8, maxRows: 16 }" placeholder="请完整介绍内容亮点、规格、使用方式和注意事项" /></a-form-item>
            </section>
          </main>
        </div>

        <template v-if="view === 'courses'">
          <a-form-item :label="`${current.singular}名称`" required><a-input v-model="form.title" /></a-form-item>
          <a-form-item label="封面图片"><div class="cover-uploader"><img v-if="form.coverImage" class="cover-preview" :src="coverUrl(form.coverImage)" alt="封面预览" /><div v-else class="cover-preview cover-empty">暂无封面</div><input ref="coverInput" type="file" accept="image/png,image/jpeg,image/webp" hidden @change="uploadCover" /><a-space><a-button :loading="uploading" @click="coverInput?.click()">上传封面</a-button><a-button v-if="form.coverImage" type="text" @click="form.coverImage = ''">移除</a-button></a-space><div class="muted">支持 PNG、JPG、WebP，最大 2MB</div></div></a-form-item>
          <a-row :gutter="12"><a-col :span="12"><a-form-item label="讲师"><a-input v-model="form.hostName" /></a-form-item></a-col><a-col :span="12"><a-form-item label="课程分类"><a-input v-model="form.category" /></a-form-item></a-col></a-row>
          <a-row :gutter="12"><a-col :span="8"><a-form-item label="会员价"><a-input-number v-model="form.memberPrice" :min="0.01" :step="0.01" :precision="2" style="width: 100%" /></a-form-item></a-col><a-col :span="8"><a-form-item label="开始时间" required><a-date-picker v-model="form.startAt" show-time format="YYYY-MM-DD HH:mm" value-format="YYYY-MM-DD HH:mm" placeholder="选择开始日期和时间" style="width:100%" /></a-form-item></a-col><a-col :span="8"><a-form-item label="结束时间" required><a-date-picker v-model="form.endAt" show-time format="YYYY-MM-DD HH:mm" value-format="YYYY-MM-DD HH:mm" placeholder="选择结束日期和时间" style="width:100%" /></a-form-item></a-col></a-row>
          <a-form-item label="直播地址"><a-input v-model="form.streamUrl" placeholder="https://" /></a-form-item><a-form-item label="回放地址"><a-input v-model="form.replayUrl" placeholder="https://" /></a-form-item>
          <a-form-item label="课程章节"><div class="lesson-editor"><div class="lesson-editor-head"><span class="muted">按顺序编排每一节课，可填写外链或上传本地视频</span><a-button type="outline" size="small" @click="addLesson"><template #icon><IconPlus /></template>新增课节</a-button></div><a-empty v-if="!form.lessons.length" description="暂无章节" /><div v-for="(lesson, index) in form.lessons" :key="lesson.id || index" class="lesson-row"><div class="lesson-row-head"><strong>第 {{ index + 1 }} 节</strong><a-space :size="0"><a-button type="text" size="mini" :disabled="index === 0" @click="moveLesson(index, -1)">上移</a-button><a-button type="text" size="mini" :disabled="index === form.lessons.length - 1" @click="moveLesson(index, 1)">下移</a-button><a-button type="text" size="mini" status="danger" @click="removeLesson(index)">删除</a-button></a-space></div><a-row :gutter="10"><a-col :span="16"><a-input v-model="lesson.title" placeholder="课节标题" /></a-col><a-col :span="8"><a-input v-model="lesson.duration" placeholder="时长，如 18:40" /></a-col></a-row><video v-if="lesson.videoUrl" class="detail-block-video" :src="coverUrl(lesson.videoUrl)" controls preload="metadata"></video><a-input v-model="lesson.videoUrl" placeholder="HTTPS 视频、MP4、WebM、MOV、M4V 或 M3U8 地址" /><div class="lesson-video-actions"><label class="detail-upload-button"><input type="file" accept="video/mp4,video/webm,video/quicktime,video/x-m4v,.mov,.m4v" hidden @change="uploadCourseVideo($event, lesson, index)" /><a-button type="outline" size="small" :loading="courseVideoUploading[lessonUploadKey(lesson, index)]" @click.prevent="$event.currentTarget.parentElement.querySelector('input').click()">上传本地视频</a-button></label><a-button v-if="lesson.videoUrl" type="text" size="small" status="danger" @click="lesson.videoUrl = ''">移除视频</a-button><span class="muted">支持 MP4、WebM、MOV、M4V，暂不限制文件大小</span></div><div class="lesson-options"><a-checkbox v-model="lesson.isPreview">允许试看</a-checkbox><a-switch v-model="lesson.status" :checked-value="1" :unchecked-value="0" checked-text="上架" unchecked-text="下架" /></div></div></div></a-form-item>
          <a-form-item label="课程介绍"><a-textarea v-model="form.description" :auto-size="{ minRows: 5, maxRows: 10 }" /></a-form-item>
        </template>
      </a-form>
      <template #footer><a-button @click="form = null">取消</a-button><a-button type="primary" :loading="loading" @click="save">保存并发布</a-button></template>
    </a-modal>
  </a-layout>
</template>
