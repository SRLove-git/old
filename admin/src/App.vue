<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from './api.js'

const view = ref('dashboard')
const loading = ref(false)
const error = ref('')

const nav = [
  { key: 'dashboard', name: '数据看板' },
  { key: 'activities', name: '活动管理' },
  { key: 'orders', name: '订单管理' },
  { key: 'applications', name: '主理人审核' },
  { key: 'managers', name: '主理人管理' },
  { key: 'customers', name: '客户归属' },
  { key: 'commissions', name: '佣金管理' },
  { key: 'withdraws', name: '提现审核' },
  { key: 'config', name: '规则配置' }
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
const config = ref({})

const activityForm = ref(null)
const adjustTarget = ref(null)
const adjustAmount = ref('')
const adjustReason = ref('')
const rebindTarget = ref(null)
const rebindManagerId = ref('')
const rejectReason = ref('')

const categories = { 1: '同城活动', 2: '研学旅行', 3: '岁悦学堂', 4: '商家福利', 5: '商品文创' }

function catName(id) {
  return categories[id] || '未知'
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    if (view.value === 'dashboard') stats.value = await api.get('/stats/dashboard')
    if (view.value === 'activities') activities.value = await api.get('/activities')
    if (view.value === 'orders') orders.value = await api.get('/orders')
    if (view.value === 'applications') applications.value = await api.get('/manager-applications')
    if (view.value === 'managers') managers.value = await api.get('/managers')
    if (view.value === 'customers') {
      customers.value = await api.get('/customers')
      bindings.value = await api.get('/bindings')
    }
    if (view.value === 'commissions') commissions.value = await api.get('/commissions')
    if (view.value === 'withdraws') withdraws.value = await api.get('/withdraws')
    if (view.value === 'config') config.value = await api.get('/config')
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

function switchView(key) {
  view.value = key
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

function openActivity(activity) {
  activityForm.value = activity
    ? { ...activity }
    : {
        title: '', category: 1, city: '北京', address: '', price: 0, memberPrice: 0,
        originalPrice: 0, minGroup: 0, maxGroup: 40, highlight: '', time: '',
        managerCommissionRate: null, status: 1, hasSku: false, schedules: [], points: [], detail: ''
      }
}

function saveActivity() {
  const form = activityForm.value
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
  doAction(async () => {
    await api.post(`/orders/${id}/${action}`, body || {})
  })
}

function approveApp(id) {
  doAction(() => api.post(`/manager-applications/${id}/approve`))
}

function rejectApp(id) {
  const reason = prompt('请输入拒绝原因')
  if (reason === null) return
  doAction(() => api.post(`/manager-applications/${id}/reject`, { reason }))
}

function setManagerStatus(id, status) {
  doAction(() => api.post(`/managers/${id}/status`, { status }))
}

function unbindCustomer(id) {
  const reason = prompt('请输入解绑原因')
  if (reason === null) return
  doAction(() => api.post('/bindings/unbind', { customerId: id, reason }))
}

function openRebind(customer) {
  rebindTarget.value = customer
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
  })
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
      reason: adjustReason.value
    })
    adjustTarget.value = null
  })
}

function settleAll() {
  if (!confirm('确认把所有待结算佣金转为可结算？')) return
  doAction(() => api.post('/commissions/settle'))
}

function approveWithdraw(id) {
  doAction(() => api.post(`/withdraws/${id}/approve`))
}

function rejectWithdraw(id) {
  const reason = prompt('请输入拒绝原因')
  if (reason === null) return
  doAction(() => api.post(`/withdraws/${id}/reject`, { reason }))
}

function saveConfig() {
  doAction(() => api.put('/config', config.value))
}
</script>

<template>
  <div class="layout">
    <aside class="side">
      <div class="logo">岁悦里 · 运营后台</div>
      <button
        v-for="n in nav"
        :key="n.key"
        class="nav-item"
        :class="{ on: view === n.key }"
        @click="switchView(n.key)"
      >{{ n.name }}</button>
    </aside>

    <main class="main">
      <div v-if="error" class="error">⚠️ {{ error }}</div>
      <div v-if="loading" class="loading">加载中…</div>

      <section v-if="view === 'dashboard' && stats">
        <h1>数据看板</h1>
        <div class="grid">
          <div class="stat card"><b>{{ stats.activityCount }}</b><span>活动数</span></div>
          <div class="stat card"><b>{{ stats.orderCount }}</b><span>订单数</span></div>
          <div class="stat card"><b>{{ stats.customerCount }}</b><span>客户数</span></div>
          <div class="stat card"><b>{{ stats.managerCount }}</b><span>主理人数</span></div>
          <div class="stat card"><b>{{ stats.pendingApply }}</b><span>待审核申请</span></div>
          <div class="stat card"><b>{{ stats.pendingWithdraw }}</b><span>待审核提现</span></div>
        </div>
        <div class="card" style="margin-top:16px">
          <h3>订单状态分布</h3>
          <div class="tags">
            <span v-for="(v, k) in stats.orderStatus" :key="k" class="tag tag-gray">{{ k }}：{{ v }}</span>
          </div>
          <p style="margin-top:12px;color:#6f747b">累计佣金：¥{{ stats.totalCommission.toFixed(2) }}</p>
        </div>
      </section>

      <section v-if="view === 'activities'">
        <div class="head">
          <h1>活动管理</h1>
          <button class="btn btn-primary" @click="openActivity(null)">新建活动</button>
        </div>
        <div class="card">
          <table>
            <thead><tr><th>ID</th><th>标题</th><th>分类</th><th>城市</th><th>会员价</th><th>已报名</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="a in activities" :key="a.id">
                <td>{{ a.id }}</td>
                <td>{{ a.title }}</td>
                <td><span class="tag tag-blue">{{ catName(a.category) }}</span></td>
                <td>{{ a.city }}</td>
                <td>¥{{ a.memberPrice }}</td>
                <td>{{ a.soldCount }}</td>
                <td>
                  <button class="btn btn-ghost" @click="openActivity(a)">编辑</button>
                  <button class="btn btn-danger" @click="removeActivity(a.id)">删除</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="view === 'orders'">
        <h1>订单管理</h1>
        <div class="card">
          <table>
            <thead><tr><th>订单号</th><th>客户</th><th>标题</th><th>实付</th><th>状态</th><th>主理人</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="o in orders" :key="o.id">
                <td>{{ o.id }}</td>
                <td>{{ o.participants }}</td>
                <td>{{ o.title }}</td>
                <td>¥{{ o.payAmount }}</td>
                <td><span class="tag tag-orange">{{ o.status }}</span></td>
                <td>{{ o.managerId || '散客' }}</td>
                <td>
                  <button v-if="o.status === '待付款'" class="btn btn-primary" @click="orderAction(o.id, 'pay')">支付</button>
                  <button v-if="o.status === '待付款'" class="btn btn-ghost" @click="orderAction(o.id, 'cancel')">取消</button>
                  <button v-if="o.status === '待发货' || o.status === '待收货'" class="btn btn-ghost" @click="orderAction(o.id, 'advance')">推进状态</button>
                  <button v-if="o.status === '待发货' || o.status === '待收货'" class="btn btn-danger" @click="orderAction(o.id, 'refund', { reason: '运营退款' })">退款</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="view === 'applications'">
        <h1>主理人审核</h1>
        <div class="card">
          <table>
            <thead><tr><th>姓名</th><th>电话</th><th>社群规模</th><th>擅长</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="a in applications" :key="a.id">
                <td>{{ a.name }}</td>
                <td>{{ a.phone }}</td>
                <td>{{ a.scale }}</td>
                <td>{{ (a.fields || []).join('、') }}</td>
                <td><span class="tag tag-orange">{{ a.status }}</span></td>
                <td v-if="a.status === '待审核'">
                  <button class="btn btn-primary" @click="approveApp(a.id)">通过</button>
                  <button class="btn btn-danger" @click="rejectApp(a.id)">拒绝</button>
                </td>
                <td v-else>{{ a.rejectReason || '已通过' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="view === 'managers'">
        <h1>主理人管理</h1>
        <div class="card">
          <table>
            <thead><tr><th>ID</th><th>姓名</th><th>邀请码</th><th>累计业绩</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="m in managers" :key="m.id">
                <td>{{ m.id }}</td>
                <td>{{ m.name }}</td>
                <td>{{ m.inviteCode }}</td>
                <td>¥{{ m.totalPerformance }}</td>
                <td><span class="tag tag-green">{{ m.status === 1 ? '正常' : (m.status === 2 ? '已冻结' : '已清退') }}</span></td>
                <td>
                  <button v-if="m.status !== 2" class="btn btn-ghost" @click="setManagerStatus(m.id, 2)">冻结</button>
                  <button v-if="m.status === 2" class="btn btn-ghost" @click="setManagerStatus(m.id, 1)">解冻</button>
                  <button class="btn btn-danger" @click="setManagerStatus(m.id, 3)">清退</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="view === 'customers'">
        <h1>客户归属管理</h1>
        <div class="card">
          <table>
            <thead><tr><th>客户</th><th>电话</th><th>归属主理人</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="c in customers" :key="c.id">
                <td>{{ c.name }}</td>
                <td>{{ c.phone }}</td>
                <td>{{ managers.find(m => String(m.id) === String(c.managerId))?.name || '散客' }}</td>
                <td>
                  <button class="btn btn-ghost" @click="openRebind(c)">修改归属</button>
                  <button class="btn btn-danger" @click="unbindCustomer(c.id)">解绑</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="view === 'commissions'">
        <div class="head">
          <h1>佣金管理</h1>
          <button class="btn btn-primary" @click="settleAll">一键转可结算</button>
        </div>
        <div class="card">
          <table>
            <thead><tr><th>佣金单</th><th>客户</th><th>商品</th><th>比例</th><th>金额</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="c in commissions" :key="c.id">
                <td>{{ c.id }}</td>
                <td>{{ c.customerName }}</td>
                <td>{{ c.productName }}</td>
                <td>{{ c.commissionRate }}%</td>
                <td>¥{{ c.commissionAmount }}</td>
                <td><span class="tag tag-gray">{{ c.status }}</span></td>
                <td><button class="btn btn-ghost" @click="openAdjust(c)">调整</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="view === 'withdraws'">
        <h1>提现审核</h1>
        <div class="card">
          <table>
            <thead><tr><th>提现单</th><th>主理人</th><th>金额</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="w in withdraws" :key="w.id">
                <td>{{ w.id }}</td>
                <td>{{ managers.find(m => String(m.id) === String(w.managerId))?.name || w.managerId }}</td>
                <td>¥{{ w.amount }}</td>
                <td><span class="tag tag-orange">{{ w.status }}</span></td>
                <td v-if="w.status === '待审核'">
                  <button class="btn btn-primary" @click="approveWithdraw(w.id)">打款</button>
                  <button class="btn btn-danger" @click="rejectWithdraw(w.id)">拒绝</button>
                </td>
                <td v-else>{{ w.rejectReason || w.payTime || '' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="view === 'config' && config">
        <h1>规则配置</h1>
        <div class="card" style="max-width:480px">
          <label>全局默认分佣比例（%）</label>
          <input v-model.number="config.globalCommissionRate" type="number" class="input" />
          <label>最低提现金额（元）</label>
          <input v-model.number="config.minWithdraw" type="number" class="input" />
          <label>每月提现次数上限</label>
          <input v-model.number="config.withdrawMonthlyLimit" type="number" class="input" />
          <button class="btn btn-primary" @click="saveConfig">保存配置</button>
        </div>
      </section>
    </main>

    <div v-if="activityForm" class="modal">
      <div class="modal-box">
        <h2>{{ activityForm.id ? '编辑活动' : '新建活动' }}</h2>
        <label>标题</label><input v-model="activityForm.title" class="input" />
        <label>分类</label>
        <select v-model.number="activityForm.category" class="input">
          <option v-for="(n, k) in categories" :key="k" :value="Number(k)">{{ n }}</option>
        </select>
        <label>城市</label><input v-model="activityForm.city" class="input" />
        <label>地址</label><input v-model="activityForm.address" class="input" />
        <label>会员价</label><input v-model.number="activityForm.memberPrice" type="number" class="input" />
        <label>非会员价</label><input v-model.number="activityForm.price" type="number" class="input" />
        <label>最低成团人数</label><input v-model.number="activityForm.minGroup" type="number" class="input" />
        <label>商品级分佣比例（%）</label><input v-model="activityForm.managerCommissionRate" type="number" class="input" placeholder="留空用全局" />
        <label>活动亮点</label><input v-model="activityForm.highlight" class="input" />
        <div class="modal-actions">
          <button class="btn btn-ghost" @click="activityForm = null">取消</button>
          <button class="btn btn-primary" @click="saveActivity">保存</button>
        </div>
      </div>
    </div>

    <div v-if="rebindTarget" class="modal">
      <div class="modal-box">
        <h2>修改归属：{{ rebindTarget.name }}</h2>
        <label>新主理人</label>
        <select v-model="rebindManagerId" class="input">
          <option v-for="m in managers" :key="m.id" :value="String(m.id)">{{ m.name }}</option>
        </select>
        <div class="modal-actions">
          <button class="btn btn-ghost" @click="rebindTarget = null">取消</button>
          <button class="btn btn-primary" @click="confirmRebind">确认变更</button>
        </div>
      </div>
    </div>

    <div v-if="adjustTarget" class="modal">
      <div class="modal-box">
        <h2>调整佣金：{{ adjustTarget.id }}</h2>
        <label>调整后金额</label><input v-model="adjustAmount" type="number" class="input" />
        <label>调整原因</label><input v-model="adjustReason" class="input" placeholder="必填，用于日志" />
        <div class="modal-actions">
          <button class="btn btn-ghost" @click="adjustTarget = null">取消</button>
          <button class="btn btn-primary" @click="confirmAdjust">确认调整</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.layout { display: flex; min-height: 100vh; }
.side { width: 210px; background: #24272b; color: #fff; padding: 18px 0; flex-shrink: 0; }
.logo { padding: 0 18px 18px; font-size: 18px; font-weight: 800; border-bottom: 1px solid rgba(255,255,255,.1); margin-bottom: 8px; }
.nav-item { display: block; width: 100%; text-align: left; background: transparent; border: 0; color: #c8cdd3; padding: 13px 20px; font-size: 15px; }
.nav-item.on { background: #c25e3d; color: #fff; }
.main { flex: 1; padding: 24px; }
.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
h1 { font-size: 22px; margin-bottom: 16px; }
.grid { display: flex; flex-wrap: wrap; gap: 12px; }
.stat { flex: 1 1 160px; text-align: center; }
.stat b { display: block; font-size: 28px; color: #c25e3d; }
.stat span { color: #6f747b; font-size: 13px; }
.tags { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
.error { background: #fdeeee; color: #d74a4a; padding: 12px 16px; border-radius: 8px; margin-bottom: 12px; }
.loading { color: #6f747b; padding: 40px; text-align: center; }
.input { display: block; width: 100%; margin: 6px 0 14px; padding: 10px 12px; border: 1px solid #d7dae0; border-radius: 8px; font-size: 14px; }
.modal { position: fixed; inset: 0; background: rgba(20,22,26,.45); display: flex; align-items: center; justify-content: center; z-index: 50; }
.modal-box { background: #fff; border-radius: 14px; padding: 22px; width: 480px; max-height: 90vh; overflow: auto; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
label { display: block; font-size: 13px; color: #6f747b; margin-top: 6px; }
td .btn { margin-right: 6px; }
</style>
