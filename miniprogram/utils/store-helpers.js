const STATUS_CLASS = {
  待付款: 'pending', 待发货: 'out', 待收货: 'shipping', 待签到: 'shipping', 待核销: 'shipping',
  待使用: 'shipping', 待评价: 'review', 已完成: 'done', 已核销: 'verified', 退款中: 'refunding',
  已退款: 'refunded', 已取消: 'cancelled'
}
const BIND_SOURCE_LABEL = { 1: '扫码', 2: '链接', 3: '邀请码', 4: '手动变更' }

const statusClass = (status) => STATUS_CLASS[status] || 'default'
const bindSourceLabel = (source) => BIND_SOURCE_LABEL[source] || '未知'
const money = (value) => Number(value || 0).toFixed(2)

function normalizePhone(value) {
  let digits = String(value == null ? '' : value).replace(/\D/g, '')
  if (digits.length === 13 && digits.startsWith('86')) digits = digits.slice(2)
  return digits
}
function maskPhone(value) {
  const phone = normalizePhone(value)
  return phone.length === 11 ? `${phone.slice(0, 3)}****${phone.slice(7)}` : ''
}
function formatPhoneDisplay(value) {
  const compact = String(value == null ? '' : value).trim().replace(/\s/g, '')
  if (/^1\d{2}\*{4}\d{4}$/.test(compact)) return `${compact.slice(0, 3)} **** ${compact.slice(-4)}`
  const phone = normalizePhone(compact)
  return phone.length === 11 ? `${phone.slice(0, 3)} **** ${phone.slice(7)}` : compact
}

function isActivityExpired(activity) {
  if (!activity) return false
  if (activity.expired === true) return true
  const d = new Date()
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const schedules = Array.isArray(activity.schedules) ? activity.schedules : []
  if (schedules.some((schedule) => !String(schedule?.full || '').trim())) return false
  const dates = schedules.map((schedule) => String(schedule.full || '')).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
  if (dates.length) return dates.every((date) => date < today)
  const endDate = String(activity.endDate || activity.endAt || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(endDate) && endDate < today
}

function refundRuleText(rule) {
  if (!rule?.type) return ''
  if (rule.type === 'always') return '随时可退，全额退款'
  if (rule.type === 'never') return '该活动不支持退款'
  if (rule.type === 'day') {
    const fullDays = Number(rule.fullDays || 0)
    const partialDays = Number(rule.partialDays || 0)
    const partialRate = Number(rule.partialRate || 0)
    if (fullDays <= 0) return '不可退款'
    return partialDays > 0 && partialRate > 0
      ? `活动开始前${fullDays}天（含）可全额退款，前${partialDays}天退${Math.round(partialRate * 100)}%，之后不可退`
      : `活动开始前${fullDays}天（含）可全额退款，之后不可退`
  }
  if (rule.type === 'ladder') {
    const ladder = (rule.ladder || []).slice().sort((left, right) => right.days - left.days)
    if (!ladder.length) return '不可退款'
    const parts = ladder.map((rung) => rung.rate >= 1 ? `提前${rung.days}天全退` : `提前${rung.days}天退${Math.round(rung.rate * 100)}%`)
    const last = ladder[ladder.length - 1]
    if (Number(last && last.rate || 0) <= 0) parts.push('之后不可退')
    return parts.join('；')
  }
  return ''
}

function displayStatus(order) {
  if (order.status === '待收货' && order.serviceMode && order.serviceMode !== 'delivery') {
    if (order.serviceMode === 'online') return '待使用'
    return order.serviceMode === 'verify_code' ? '待核销' : '待签到'
  }
  return order.status === '已核销' ? '已签到' : order.status
}
const isDeliveryOrder = (order) => order.serviceMode ? order.serviceMode === 'delivery' : Number(order.category) === 5
const ORDER_FILTERS = [
  { label: '全部', match: () => true }, { label: '待付款', match: (o) => o.status === '待付款' },
  { label: '待签到', match: (o) => ['待签到', '待核销'].includes(o.status) || (o.status === '待收货' && !isDeliveryOrder(o) && o.serviceMode !== 'online') },
  { label: '待使用', match: (o) => o.status === '待使用' || (o.status === '待收货' && o.serviceMode === 'online') },
  { label: '待发货', match: (o) => o.status === '待发货' }, { label: '待收货', match: (o) => o.status === '待收货' && isDeliveryOrder(o) },
  { label: '待完成', match: (o) => o.status === '已核销' }, { label: '待评价', match: (o) => o.status === '待评价' },
  { label: '已完成', match: (o) => o.status === '已完成' }, { label: '退款/售后', match: (o) => ['退款中', '已退款'].includes(o.status) },
  { label: '已取消', match: (o) => o.status === '已取消' }
]
const orderFilterLabels = () => ORDER_FILTERS.map((item) => item.label)
function resolveOrderFilter(status) {
  const map = { 待付款: '待付款', 待出行: '待签到', 待签到: '待签到', 待核销: '待签到', 待使用: '待使用', 待收货: '待收货', 待发货: '待发货', 待完成: '待完成', 待评价: '待评价', 已完成: '已完成', 已取消: '已取消', 退款售后: '退款/售后', '退款/售后': '退款/售后', 退款中: '退款/售后', 已退款: '退款/售后', 已核销: '待完成' }
  return map[String(status == null ? '' : status).trim()] || ''
}
function matchOrderFilter(order, label) {
  return (ORDER_FILTERS.find((item) => item.label === label) || ORDER_FILTERS[0]).match(order)
}

module.exports = { bindSourceLabel, displayStatus, formatPhoneDisplay, isActivityExpired, maskPhone, matchOrderFilter, money, normalizePhone, orderFilterLabels, refundRuleText, resolveOrderFilter, statusClass }
