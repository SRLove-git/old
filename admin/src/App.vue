<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from './api.js'

const view = ref('dashboard')
const loading = ref(false)
const error = ref('')
const sideOpen = ref(false)

const nav = [
  { key: 'dashboard', name: '数据看板', icon: '📊' },
  { key: 'activities', name: '活动管理', icon: '🗓' },
  { key: 'orders', name: '订单/退款', icon: '🧾' },
  { key: 'customers', name: '用户管理', icon: '👥' },
  { key: 'coupons', name: '优惠券管理', icon: '🎟' },
  { key: 'reviews', name: '评价管理', icon: '💬' },
  { key: 'banners', name: 'Banner管理', icon: '🖼' },
  { key: 'applications', name: '主理人审核', icon: '📋' },
  { key: 'managers', name: '主理人管理', icon: '🧑‍💼' },
  { key: 'bindings', name: '归属管理', icon: '🔗' },
  { key: 'commissions', name: '佣金管理', icon: '💰' },
  { key: 'withdraws', name: '提现审核', icon: '🏦' },
  { key: 'logs', name: '操作日志', icon: '📝' },
  { key: 'config', name: '规则配置', icon: '⚙️' }
]

const stats = ref(null)
const activities = ref([])
const orders = ref([])
const applications = ref([])
const managers = ref([])
const customers = ref([])
const bindings = ref([])
const commissions = ref([])
const withdraws = ref([])
const coupons = ref([])
const reviews = ref([])
const banners = ref([])
const logs = ref([])
const config = ref({})

const kw = ref('')
const orderStatusFilter = ref('全部')
const orderStatuses = ['全部', '待付款', '待发货', '待收货', '待评价', '已完成', '已核销', '退款中', '已退款', '已取消']

const activityForm = ref(null)
const activitySchedulesJson = ref('')
const activitySkusJson = ref('')
const couponForm = ref(null)
const bannerForm = ref(null)
const customerForm = ref(null)
const rebindTarget = ref(null)
const rebindManagerId = ref('')
const adjustTarget = ref(null)
const adjustAmount = ref('')
const adjustReason = ref('')

const categories = { 1: '同城活动', 2: '研学旅行', 3: '岁悦学堂', 4: '商家福利', 5: '商品文创' }
const couponTypes = { 1: '无门槛', 2: '满减', 3: '品类券', 4: '指定商品券' }
const bindSource = { 1: '扫码', 2: '链接', 3: '邀请码', 4: '手动变更' }

function catName(id) { return categories[id] || '未知' }

const pageTitle = computed(() => nav.find((n) => n.key === view.value)?.name || '')

function fuzzyMatch(text, kw) {
  const k = String(kw || '').trim().toLowerCase()
  if (!k) return true
  const terms = k.split(/\s+/).filter(Boolean)
  const hay = String(text || '').toLowerCase()
  return terms.every((t) => hay.includes(t))
}

function toggleSide() { sideOpen.value = !sideOpen.value }

function orderChip(status) {
  if (['已完成', '已核销'].includes(status)) return 'chip-success'
  if (status === '退款中') return 'chip-danger'
  if (['已退款', '已取消'].includes(status)) return 'chip-neutral'
  return 'chip-warning'
}

function managerChip(status) {
  if (status === 1) return 'chip-success'
  if (status === 2) return 'chip-warning'
  return 'chip-neutral'
}

function bindingChip(status) {
  if (status === 1) return 'chip-success'
  return 'chip-neutral'
}

function statusChip(status) {
  if (['待审核', '待付款', '待发货', '待收货', '待评价'].includes(status)) return 'chip-warning'
  if (['已通过', '已结算', '可结算', '正常'].includes(status)) return 'chip-success'
  if (['已拒绝', '已驳回'].includes(status)) return 'chip-danger'
  return 'chip-neutral'
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    if (view.value === 'dashboard') stats.value = await api.get('/stats/dashboard')
    if (view.value === 'activities') activities.value = await api.get('/activities')
    if (view.value === 'orders') orders.value = await api.get('/orders')
    if (view.value === 'customers') { customers.value = await api.get('/customers'); bindings.value = await api.get('/bindings') }
    if (view.value === 'coupons') coupons.value = await api.get('/coupons')
    if (view.value === 'reviews') reviews.value = await api.get('/reviews')
    if (view.value === 'banners') banners.value = await api.get('/banners')
    if (view.value === 'applications') applications.value = await api.get('/manager-applications')
    if (view.value === 'managers') managers.value = await api.get('/managers')
    if (view.value === 'bindings') { customers.value = await api.get('/customers'); bindings.value = await api.get('/bindings') }
    if (view.value === 'commissions') commissions.value = await api.get('/commissions')
    if (view.value === 'withdraws') withdraws.value = await api.get('/withdraws')
    if (view.value === 'logs') logs.value = await api.get('/logs')
    if (view.value === 'config') config.value = await api.get('/config')
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

async function doAction(fn) {
  error.value = ''
  try {
    await fn()
    await load()
  } catch (e) {
    error.value = e.message
  }
}

const filteredActivities = computed(() => {
  const k = kw.value.trim()
  return activities.value.filter((a) => {
    const text = [a.title, a.city, a.address, a.highlight, a.detail, (a.points || []).join(' ')].filter(Boolean).join(' ')
    return fuzzyMatch(text, k)
  })
})
const filteredOrders = computed(() => {
  const k = kw.value.trim()
  return orders.value.filter((o) => {
    const okStatus = orderStatusFilter.value === '全部' || o.status === orderStatusFilter.value
    const okKey = fuzzyMatch(`${o.id} ${o.title} ${o.participants}`, k)
    return okStatus && okKey
  })
})
const filteredCustomers = computed(() => {
  const k = kw.value.trim()
  return customers.value.filter((c) => fuzzyMatch(`${c.name} ${c.phone}`, k))
})
const filteredCommissions = computed(() => {
  const k = kw.value.trim()
  return commissions.value.filter((c) => fuzzyMatch(`${c.id} ${c.customerName} ${c.productName} ${c.status}`, k))
})

function openActivity(a) {
  activityForm.value = a
    ? { ...a }
    : { title: '', category: 1, city: '北京', address: '', price: 0, memberPrice: 0, originalPrice: 0, minGroup: 0, maxGroup: 40, soldCount: 0, highlight: '', time: '', managerCommissionRate: null, status: 1, hasSku: false, schedules: [], skus: [], points: [], detail: '' }
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
    return
  }
  doAction(async () => {
    if (form.id) await api.put(`/activities/${form.id}`, form)
    else await api.post('/activities', form)
    activityForm.value = null
  })
}

function removeActivity(id) {
  if (!confirm('确定删除该活动？')) return
  doAction(() => api.del(`/activities/${id}`))
}

function orderAction(id, action, body) {
  doAction(() => api.post(`/orders/${id}/${action}`, body || {}))
}

function openCustomer(c) {
  customerForm.value = { ...c }
}

function saveCustomer() {
  const form = { ...customerForm.value }
  doAction(async () => {
    await api.put(`/customers/${form.id}`, form)
    customerForm.value = null
  })
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
  })
}

function removeCoupon(id) {
  if (!confirm('删除优惠券？')) return
  doAction(() => api.del(`/coupons/${id}`))
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
  })
}

function removeBanner(id) {
  if (!confirm('删除 Banner？')) return
  doAction(() => api.del(`/banners/${id}`))
}

function approveApp(id) { doAction(() => api.post(`/manager-applications/${id}/approve`)) }
function rejectApp(id) {
  const reason = prompt('请输入拒绝原因')
  if (reason === null) return
  doAction(() => api.post(`/manager-applications/${id}/reject`, { reason }))
}
function setManagerStatus(id, status) { doAction(() => api.post(`/managers/${id}/status`, { status })) }
function unbindCustomer(id) {
  const reason = prompt('请输入解绑原因')
  if (reason === null) return
  doAction(() => api.post('/bindings/unbind', { customerId: id, reason }))
}
function openRebind(c) {
  rebindTarget.value = c
  rebindManagerId.value = managers.value[0] ? String(managers.value[0].id) : ''
}
function confirmRebind() {
  doAction(async () => {
    await api.post('/bindings/rebind', { customerId: rebindTarget.value.id, managerId: Number(rebindManagerId.value), reason: '运营后台变更归属' })
    rebindTarget.value = null
  })
}
function openAdjust(c) {
  adjustTarget.value = c
  adjustAmount.value = String(c.commissionAmount)
  adjustReason.value = ''
}
function confirmAdjust() {
  doAction(async () => {
    await api.post(`/commissions/${adjustTarget.value.id}/adjust`, { amount: Number(adjustAmount.value), reason: adjustReason.value || '手动调整' })
    adjustTarget.value = null
  })
}
function settleAll() {
  if (!confirm('确认把所有待结算佣金转为可结算？')) return
  doAction(() => api.post('/commissions/settle'))
}
function approveWithdraw(id) { doAction(() => api.post(`/withdraws/${id}/approve`)) }
function rejectWithdraw(id) {
  const reason = prompt('请输入拒绝原因')
  if (reason === null) return
  doAction(() => api.post(`/withdraws/${id}/reject`, { reason }))
}
function removeReview(id) {
  if (!confirm('删除该评价？')) return
  doAction(() => api.del(`/reviews/${id}`))
}
function saveConfig() { doAction(() => api.put('/config', config.value)) }

function exportCsv(filename, rows) {
  if (!rows.length) { alert('没有可导出的数据'); return }
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
  <div class="layout">
    <aside class="side" :class="{ open: sideOpen }">
      <div class="logo">岁悦里 · 运营后台</div>
      <button
        v-for="n in nav"
        :key="n.key"
        class="nav-item"
        :class="{ on: view === n.key }"
        @click="switchView(n.key); sideOpen = false"
      >
        <span class="nav-icon">{{ n.icon }}</span>
        <span>{{ n.name }}</span>
      </button>
    </aside>

    <main class="main">
      <header class="topbar">
        <button class="btn btn-text menu-btn" @click="toggleSide" aria-label="菜单">☰</button>
        <span class="topbar-title">{{ pageTitle }}</span>
        <span class="topbar-spacer"></span>
        <span class="topbar-user"><span class="avatar">管</span>运营管理员</span>
      </header>

      <div v-if="error" class="error">⚠️ {{ error }}</div>
      <div v-if="loading" class="loading">加载中…</div>

      <section v-if="view === 'dashboard' && stats">
        <div class="grid">
          <div class="stat card"><b>{{ stats.activityCount }}</b><span>活动数</span></div>
          <div class="stat card"><b>{{ stats.orderCount }}</b><span>订单数</span></div>
          <div class="stat card"><b>{{ stats.customerCount }}</b><span>客户数</span></div>
          <div class="stat card"><b>{{ stats.managerCount }}</b><span>主理人数</span></div>
          <div class="stat card"><b>{{ stats.pendingApply }}</b><span>待审核申请</span></div>
          <div class="stat card"><b>{{ stats.pendingWithdraw }}</b><span>待审核提现</span></div>
          <div class="stat card"><b>¥{{ stats.totalRevenue }}</b><span>有效营收</span></div>
          <div class="stat card"><b>¥{{ stats.totalCommission.toFixed(2) }}</b><span>累计佣金</span></div>
        </div>
        <div class="stack">
        <div class="card">
          <div class="section-title">订单状态分布</div>
          <div class="tags">
            <span v-for="(v, k) in stats.orderStatus" :key="k" class="chip chip-neutral">{{ k }}：{{ v }}</span>
          </div>
        </div>
        <div class="card">
          <div class="section-title">商品分类分布</div>
          <div class="tags">
            <span v-for="(v, k) in stats.byCategory" :key="k" class="chip chip-info">{{ catName(Number(k)) }}：{{ v }}</span>
          </div>
        </div>
        <div class="card">
          <div class="section-title">主理人排行榜（按累计佣金）</div>
          <table>
            <thead><tr><th>排名</th><th>主理人</th><th>累计佣金</th><th>客户数</th></tr></thead>
            <tbody>
              <tr v-for="(m, i) in stats.managerRanking" :key="m.id">
                <td>{{ i + 1 }}</td><td>{{ m.name }}</td><td>¥{{ m.totalCommission }}</td><td>{{ m.totalCustomers }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        </div>
      </section>

      <section v-if="view === 'activities'">
        <div class="head">
          <div class="head-actions">
            <input v-model="kw" class="input inline" placeholder="搜索标题/城市" />
          </div>
        </div>
        <div class="card">
          <table>
            <thead><tr><th>ID</th><th>标题</th><th>分类</th><th>城市</th><th>会员价</th><th>已报名</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="a in filteredActivities" :key="a.id">
                <td>{{ a.id }}</td><td>{{ a.title }}</td><td><span class="chip chip-info">{{ catName(a.category) }}</span></td><td>{{ a.city }}</td><td>¥{{ a.memberPrice }}</td><td>{{ a.soldCount }}</td>
                <td><span class="chip" :class="a.status === 1 ? 'chip-success' : 'chip-neutral'">{{ a.status === 1 ? '上架' : '下架' }}</span></td>
                <td><button class="btn btn-text" @click="openActivity(a)">编辑</button><button class="btn btn-text btn-danger-text" @click="removeActivity(a.id)">删除</button></td>
              </tr>
            </tbody>
          </table>
        </div>
        <button class="fab" @click="openActivity(null)">＋ 新建活动</button>
      </section>

      <section v-if="view === 'orders'">
        <div class="head">
          <div class="head-actions">
            <input v-model="kw" class="input inline" placeholder="搜索订单/标题/客户" />
            <select v-model="orderStatusFilter" class="input inline">
              <option v-for="s in orderStatuses" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
        </div>
        <div class="card">
          <table>
            <thead><tr><th>订单号</th><th>客户</th><th>标题</th><th>实付</th><th>状态</th><th>主理人</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="o in filteredOrders" :key="o.id">
                <td>{{ o.id }}</td><td>{{ o.participants }}</td><td>{{ o.title }}</td><td>¥{{ o.payAmount }}</td><td><span class="chip" :class="orderChip(o.status)">{{ o.status }}</span></td><td>{{ o.managerId || '散客' }}</td>
                <td>
                  <button v-if="o.status === '待付款'" class="btn btn-filled btn-sm" @click="orderAction(o.id, 'pay')">支付</button>
                  <button v-if="o.status === '待付款'" class="btn btn-outlined btn-sm" @click="orderAction(o.id, 'cancel')">取消</button>
                  <button v-if="o.status === '待发货' || o.status === '待收货'" class="btn btn-outlined btn-sm" @click="orderAction(o.id, 'advance')">推进</button>
                  <button v-if="o.status === '待发货' || o.status === '待收货'" class="btn btn-danger btn-sm" @click="orderAction(o.id, 'refund-audit', { approve: true, reason: '运营退款' })">退款</button>
                  <button v-if="o.status === '已退款'" class="btn btn-outlined btn-sm" @click="orderAction(o.id, 'refund-audit', { approve: false, reason: '撤销退款' })">恢复</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="actions-row"><button class="btn btn-tonal" @click="exportCsv('orders.csv', filteredOrders)">导出订单 CSV</button></div>
      </section>

      <section v-if="view === 'customers'">
        <div class="head">
          <input v-model="kw" class="input inline" placeholder="搜索姓名/电话" />
        </div>
        <div class="card">
          <table>
            <thead><tr><th>ID</th><th>姓名</th><th>电话</th><th>会员</th><th>余额</th><th>积分</th><th>归属主理人</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="c in filteredCustomers" :key="c.id">
                <td>{{ c.id }}</td><td>{{ c.name }}</td><td>{{ c.phone }}</td><td>{{ c.member ? '是' : '否' }}</td><td>¥{{ c.balance }}</td><td>{{ c.points }}</td>
                <td>{{ managers.find(m => String(m.id) === String(c.managerId))?.name || '散客' }}</td>
                <td><button class="btn btn-text" @click="openCustomer(c)">编辑</button><button class="btn btn-text" @click="openRebind(c)">改归属</button><button class="btn btn-text btn-danger-text" @click="unbindCustomer(c.id)">解绑</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="view === 'coupons'">
        <div class="card">
          <table>
            <thead><tr><th>ID</th><th>标题</th><th>类型</th><th>面额</th><th>门槛</th><th>有效期</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="c in coupons" :key="c.id">
                <td>{{ c.id }}</td><td>{{ c.title }}</td><td>{{ couponTypes[c.type] }}</td><td>¥{{ c.value }}</td><td>满 {{ c.minAmount }}</td><td>{{ c.expireAt }}</td><td>{{ c.used ? '已使用' : '可用' }}</td>
                <td><button class="btn btn-text" @click="openCoupon(c)">编辑</button><button class="btn btn-text btn-danger-text" @click="removeCoupon(c.id)">删除</button></td>
              </tr>
            </tbody>
          </table>
        </div>
        <button class="fab" @click="openCoupon(null)">＋ 新建优惠券</button>
      </section>

      <section v-if="view === 'reviews'">
        <div class="card">
          <table>
            <thead><tr><th>ID</th><th>活动</th><th>用户</th><th>评分</th><th>内容</th><th>时间</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="r in reviews" :key="r.id">
                <td>{{ r.id }}</td><td>{{ activities.find(a => String(a.id) === String(r.activityId))?.title || r.activityId }}</td><td>{{ r.name }}</td><td>{{ r.rating }}星</td><td>{{ r.content }}</td><td>{{ r.time }}</td>
                <td><button class="btn btn-text btn-danger-text" @click="removeReview(r.id)">删除</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="view === 'banners'">
        <div class="card">
          <table>
            <thead><tr><th>ID</th><th>标题</th><th>副标题</th><th>图标</th><th>跳转分类</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="b in banners" :key="b.id">
                <td>{{ b.id }}</td><td>{{ b.title }}</td><td>{{ b.sub }}</td><td>{{ b.emoji }}</td><td>{{ b.cat ? catName(b.cat) : '个人中心' }}</td>
                <td><button class="btn btn-text" @click="openBanner(b)">编辑</button><button class="btn btn-text btn-danger-text" @click="removeBanner(b.id)">删除</button></td>
              </tr>
            </tbody>
          </table>
        </div>
        <button class="fab" @click="openBanner(null)">＋ 新建 Banner</button>
      </section>

      <section v-if="view === 'applications'">
        <div class="card">
          <table>
            <thead><tr><th>姓名</th><th>电话</th><th>社群规模</th><th>擅长</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="a in applications" :key="a.id">
                <td>{{ a.name }}</td><td>{{ a.phone }}</td><td>{{ a.scale }}</td><td>{{ (a.fields || []).join('、') }}</td><td><span class="chip" :class="statusChip(a.status)">{{ a.status }}</span></td>
                <td v-if="a.status === '待审核'"><button class="btn btn-filled btn-sm" @click="approveApp(a.id)">通过</button><button class="btn btn-outlined btn-sm" @click="rejectApp(a.id)">拒绝</button></td>
                <td v-else>{{ a.rejectReason || '已通过' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="view === 'managers'">
        <div class="card">
          <table>
            <thead><tr><th>ID</th><th>姓名</th><th>邀请码</th><th>累计业绩</th><th>累计佣金</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="m in managers" :key="m.id">
                <td>{{ m.id }}</td><td>{{ m.name }}</td><td>{{ m.inviteCode }}</td><td>¥{{ m.totalPerformance }}</td><td>¥{{ m.totalCommission }}</td>
                <td><span class="chip" :class="managerChip(m.status)">{{ m.status === 1 ? '正常' : m.status === 2 ? '已冻结' : '已清退' }}</span></td>
                <td>
                  <button v-if="m.status !== 2" class="btn btn-text" @click="setManagerStatus(m.id, 2)">冻结</button>
                  <button v-if="m.status === 2" class="btn btn-text" @click="setManagerStatus(m.id, 1)">解冻</button>
                  <button class="btn btn-text btn-danger-text" @click="setManagerStatus(m.id, 3)">清退</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="view === 'bindings'">
        <div class="card">
          <table>
            <thead><tr><th>客户</th><th>归属主理人</th><th>绑定来源</th><th>绑定时间</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="b in bindings" :key="b.id">
                <td>{{ b.customerName }}</td><td>{{ managers.find(m => String(m.id) === String(b.managerId))?.name || '散客' }}</td><td>{{ bindSource[b.bindSource] }}</td><td>{{ b.bindTime }}</td><td><span class="chip" :class="bindingChip(b.status)">{{ b.status === 1 ? '有效' : b.status === 2 ? '已解除' : '已变更' }}</span></td>
                <td><button class="btn btn-text" @click="openRebind({ id: b.customerId, name: b.customerName })">改归属</button><button class="btn btn-text btn-danger-text" @click="unbindCustomer(b.customerId)">解绑</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="view === 'commissions'">
        <div class="head">
          <div class="head-actions"><input v-model="kw" class="input inline" placeholder="搜索" /><button class="btn btn-tonal" @click="settleAll">一键转可结算</button></div>
        </div>
        <div class="card">
          <table>
            <thead><tr><th>佣金单</th><th>客户</th><th>商品</th><th>比例</th><th>金额</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="c in filteredCommissions" :key="c.id">
                <td>{{ c.id }}</td><td>{{ c.customerName }}</td><td>{{ c.productName }}</td><td>{{ c.commissionRate }}%</td><td>¥{{ c.commissionAmount }}</td><td><span class="chip" :class="statusChip(c.status)">{{ c.status }}</span></td>
                <td><button class="btn btn-text" @click="openAdjust(c)">调整</button></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="actions-row"><button class="btn btn-tonal" @click="exportCsv('commissions.csv', filteredCommissions)">导出佣金 CSV</button></div>
      </section>

      <section v-if="view === 'withdraws'">
        <div class="card">
          <table>
            <thead><tr><th>提现单</th><th>主理人</th><th>金额</th><th>状态</th><th>申请时间</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="w in withdraws" :key="w.id">
                <td>{{ w.id }}</td><td>{{ managers.find(m => String(m.id) === String(w.managerId))?.name || w.managerId }}</td><td>¥{{ w.amount }}</td><td><span class="chip" :class="statusChip(w.status)">{{ w.status }}</span></td><td>{{ w.applyTime }}</td>
                <td v-if="w.status === '待审核'"><button class="btn btn-filled btn-sm" @click="approveWithdraw(w.id)">打款</button><button class="btn btn-outlined btn-sm" @click="rejectWithdraw(w.id)">拒绝</button></td>
                <td v-else>{{ w.rejectReason || w.payTime || '' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="view === 'logs'">
        <div class="card">
          <table>
            <thead><tr><th>时间</th><th>操作</th><th>详情</th></tr></thead>
            <tbody><tr v-for="l in logs" :key="l.id"><td>{{ l.time }}</td><td><span class="chip chip-info">{{ l.action }}</span></td><td>{{ l.detail }}</td></tr></tbody>
          </table>
        </div>
      </section>

      <section v-if="view === 'config' && config">
        <div class="card config-card">
          <div class="section-title">规则配置</div>
          <label class="field-label">全局默认分佣比例（%）</label><input v-model.number="config.globalCommissionRate" type="number" class="input" />
          <label class="field-label">最低提现金额（元）</label><input v-model.number="config.minWithdraw" type="number" class="input" />
          <label class="field-label">每月提现次数上限</label><input v-model.number="config.withdrawMonthlyLimit" type="number" class="input" />
          <div class="actions-row actions-row-left"><button class="btn btn-filled" @click="saveConfig">保存配置</button></div>
        </div>
      </section>
    </main>

    <div v-if="activityForm" class="modal">
      <div class="modal-box">
        <h2>{{ activityForm.id ? '编辑活动' : '新建活动' }}</h2>
        <label class="field-label">标题</label><input v-model="activityForm.title" class="input" />
        <label class="field-label">分类</label>
        <select v-model.number="activityForm.category" class="input"><option v-for="(n, k) in categories" :key="k" :value="Number(k)">{{ n }}</option></select>
        <label class="field-label">城市</label><input v-model="activityForm.city" class="input" />
        <label class="field-label">地址</label><input v-model="activityForm.address" class="input" />
        <label class="field-label">会员价</label><input v-model.number="activityForm.memberPrice" type="number" class="input" />
        <label class="field-label">非会员价</label><input v-model.number="activityForm.price" type="number" class="input" />
        <label class="field-label">最低成团人数</label><input v-model.number="activityForm.minGroup" type="number" class="input" />
        <label class="field-label">商品级分佣比例（%）</label><input v-model="activityForm.managerCommissionRate" type="number" class="input" placeholder="留空用全局" />
        <label class="field-label">状态</label>
        <select v-model.number="activityForm.status" class="input"><option :value="1">上架</option><option :value="0">下架</option></select>
        <label class="field-label">排班 JSON（高级）</label><textarea v-model="activitySchedulesJson" class="input textarea"></textarea>
        <label class="field-label">SKU JSON（高级）</label><textarea v-model="activitySkusJson" class="input textarea"></textarea>
        <div class="modal-actions"><button class="btn btn-outlined" @click="activityForm = null">取消</button><button class="btn btn-filled" @click="saveActivity">保存</button></div>
      </div>
    </div>

    <div v-if="customerForm" class="modal">
      <div class="modal-box">
        <h2>编辑用户：{{ customerForm.name }}</h2>
        <label class="field-label">会员</label><select v-model="customerForm.member" class="input"><option :value="true">是</option><option :value="false">否</option></select>
        <label class="field-label">余额</label><input v-model.number="customerForm.balance" type="number" class="input" />
        <label class="field-label">积分</label><input v-model.number="customerForm.points" type="number" class="input" />
        <label class="field-label">手机号</label><input v-model="customerForm.phone" class="input" />
        <div class="modal-actions"><button class="btn btn-outlined" @click="customerForm = null">取消</button><button class="btn btn-filled" @click="saveCustomer">保存</button></div>
      </div>
    </div>

    <div v-if="couponForm" class="modal">
      <div class="modal-box">
        <h2>{{ couponForm.id ? '编辑优惠券' : '新建优惠券' }}</h2>
        <label class="field-label">标题</label><input v-model="couponForm.title" class="input" />
        <label class="field-label">类型</label><select v-model.number="couponForm.type" class="input"><option v-for="(n, k) in couponTypes" :key="k" :value="Number(k)">{{ n }}</option></select>
        <label class="field-label">面额</label><input v-model.number="couponForm.value" type="number" class="input" />
        <label class="field-label">使用门槛</label><input v-model.number="couponForm.minAmount" type="number" class="input" />
        <label class="field-label">适用分类（品类券）</label><select v-model="couponForm.scopeCategory" class="input"><option :value="null">无</option><option v-for="(n, k) in categories" :key="k" :value="Number(k)">{{ n }}</option></select>
        <label class="field-label">适用商品 ID（指定商品券）</label><input v-model="couponForm.scopeProductId" class="input" />
        <label class="field-label">有效期至</label><input v-model="couponForm.expireAt" class="input" />
        <div class="modal-actions"><button class="btn btn-outlined" @click="couponForm = null">取消</button><button class="btn btn-filled" @click="saveCoupon">保存</button></div>
      </div>
    </div>

    <div v-if="bannerForm" class="modal">
      <div class="modal-box">
        <h2>{{ bannerForm.id ? '编辑 Banner' : '新建 Banner' }}</h2>
        <label class="field-label">标题</label><input v-model="bannerForm.title" class="input" />
        <label class="field-label">副标题</label><input v-model="bannerForm.sub" class="input" />
        <label class="field-label">图标（emoji）</label><input v-model="bannerForm.emoji" class="input" />
        <label class="field-label">渐变背景</label><input v-model="bannerForm.tone" class="input" />
        <label class="field-label">跳转分类（0=个人中心）</label><input v-model.number="bannerForm.cat" type="number" class="input" />
        <div class="modal-actions"><button class="btn btn-outlined" @click="bannerForm = null">取消</button><button class="btn btn-filled" @click="saveBanner">保存</button></div>
      </div>
    </div>

    <div v-if="rebindTarget" class="modal">
      <div class="modal-box">
        <h2>修改归属：{{ rebindTarget.name }}</h2>
        <label class="field-label">新主理人</label>
        <select v-model="rebindManagerId" class="input"><option v-for="m in managers" :key="m.id" :value="String(m.id)">{{ m.name }}</option></select>
        <div class="modal-actions"><button class="btn btn-outlined" @click="rebindTarget = null">取消</button><button class="btn btn-filled" @click="confirmRebind">确认变更</button></div>
      </div>
    </div>

    <div v-if="adjustTarget" class="modal">
      <div class="modal-box">
        <h2>调整佣金：{{ adjustTarget.id }}</h2>
        <label class="field-label">调整后金额</label><input v-model="adjustAmount" type="number" class="input" />
        <label class="field-label">调整原因</label><input v-model="adjustReason" class="input" placeholder="必填" />
        <div class="modal-actions"><button class="btn btn-outlined" @click="adjustTarget = null">取消</button><button class="btn btn-filled" @click="confirmAdjust">确认调整</button></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.layout { display: flex; min-height: 100vh; }
.side { width: 210px; background: #24272b; color: #fff; padding: 18px 0; flex-shrink: 0; }
.logo { padding: 0 18px 18px; font-size: 18px; font-weight: 800; border-bottom: 1px solid rgba(255,255,255,.1); margin-bottom: 8px; }
.nav-item { display: block; width: 100%; text-align: left; background: transparent; border: 0; color: #c8cdd3; padding: 12px 20px; font-size: 15px; }
.nav-item.on { background: #c25e3d; color: #fff; }
.main { flex: 1; padding: 24px; }
.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.head-actions { display: flex; gap: 8px; align-items: center; }
h1 { font-size: 22px; margin-bottom: 16px; }
.grid { display: flex; flex-wrap: wrap; gap: 12px; }
.stat { flex: 1 1 150px; text-align: center; }
.stat b { display: block; font-size: 26px; color: #c25e3d; }
.stat span { color: #6f747b; font-size: 13px; }
.tags { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
.error { background: #fdeeee; color: #d74a4a; padding: 12px 16px; border-radius: 8px; margin-bottom: 12px; }
.loading { color: #6f747b; padding: 40px; text-align: center; }
.input { display: block; width: 100%; margin: 6px 0 14px; padding: 10px 12px; border: 1px solid #d7dae0; border-radius: 8px; font-size: 14px; }
.input.inline { width: 220px; margin: 0; }
.textarea { min-height: 100px; }
.modal { position: fixed; inset: 0; background: rgba(20,22,26,.45); display: flex; align-items: center; justify-content: center; z-index: 50; }
.modal-box { background: #fff; border-radius: 14px; padding: 22px; width: 520px; max-height: 90vh; overflow: auto; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
label { display: block; font-size: 13px; color: #6f747b; margin-top: 6px; }
td .btn { margin-right: 6px; }
h3 { margin-bottom: 8px; }
</style>
