import express from 'express'
import cors from 'cors'
import * as store from './store.js'
import { httpError, wrap } from './lib/http.js'
import { UPLOAD_DIR } from './lib/uploads.js'
import {
  kdniaoConfigured,
  kdniaoPublicConfig,
  normalizeKdniaoQuery,
  queryKdniao
} from './lib/kdniao.js'
import { paymentConfigured } from './lib/wechat-pay.js'
import { parseBalanceRechargeAmounts } from './lib/balance-config.js'
import {
  adminAuth,
  hasAdminPermission,
  isAdminRequest,
  requestUserId,
  requireUser
} from './middleware/auth.js'
import { registerBodyParsers } from './middleware/body-parsers.js'
import { refreshLogisticsShipment, startLogisticsRefreshJob, subscribeOrderLogistics } from './services/logistics.js'
import {
  refreshWechatPayment,
  rejectManagerApplication,
  requestManagerApplicationPayment,
  startWechatPaymentJob
} from './services/payments.js'
import {
  cancelWithdrawTransfer,
  requestWithdrawTransfer,
  startWechatTransferJob,
  syncWithdrawTransfer,
  transferConfigured,
  transferPublicConfig
} from './services/transfers.js'
import { transferClientConfig } from './lib/wechat-transfer.js'
import merchantRouter from './routes/merchant.js'
import providerApplicationsRouter from './routes/provider-applications.js'
import customersRouter from './routes/customers.js'
import couponsRouter from './routes/coupons.js'
import reviewsRouter from './routes/reviews.js'
import bannersRouter from './routes/banners.js'
import adminAccountsRouter from './routes/admin-accounts.js'
import authRouter from './routes/auth.js'
import ordersRouter from './routes/orders.js'
import uploadsRouter from './routes/uploads.js'
import webhooksRouter from './routes/webhooks.js'
import memberDataRouter from './routes/member-data.js'
import balanceRouter from './routes/balance.js'

const app = express()
const PORT = process.env.PORT || 3000
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || (process.env.NODE_ENV === 'production' ? '' : 'admin-token')
const WECHAT_APPID = process.env.WECHAT_APPID || 'wx5d1ccdf824e45e73'
const WECHAT_APP_SECRET = process.env.WECHAT_APP_SECRET || ''

app.use(cors())
// 原始报文回调必须先于全局 JSON 解析器注册。
app.use('/api', webhooksRouter)
registerBodyParsers(app)
app.use('/api/uploads/files', express.static(UPLOAD_DIR, { maxAge: '7d', fallthrough: false }))

app.use('/api', authRouter)
app.use('/api/merchant', merchantRouter)
app.use('/api/provider-applications', providerApplicationsRouter)
app.use('/api/customers', customersRouter)
app.use('/api/coupons', couponsRouter)
app.use('/api/reviews', reviewsRouter)
app.use('/api/banners', bannersRouter)
app.use('/api/admin', adminAccountsRouter)
app.use('/api/uploads', uploadsRouter)
app.use('/api/orders', ordersRouter)
app.use('/api/balance', balanceRouter)
app.use('/api', memberDataRouter)

// 首页数据
app.get('/api/home', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate')
  next()
}, wrap(() => {
  const db = store.get()
  return {
    banners: store.listBanners(),
    categories: db.categories,
    activities: store.listActivitiesForDisplay({ publishedOnly: true }),
    products: store.listProducts({ publishedOnly: true }),
    regions: store.listRegions({ enabledOnly: true }),
    contentPosts: store.listContentPosts({ publishedOnly: true }),
    config: db.config
  }
}))

// 分类管理（活动/资讯/视频通用）
app.get('/api/categories', wrap(() => store.getCategories()))
app.post('/api/categories', adminAuth, wrap((req) => store.createCategory(req.body)))
app.put('/api/categories/:id', adminAuth, wrap((req) => store.updateCategory(req.params.id, req.body)))
app.delete('/api/categories/:id', adminAuth, wrap((req) => store.deleteCategory(req.params.id)))

// 地区管理：历史关联不删除，停用后仅从前台筛选和新发布选项中隐藏
app.get('/api/regions', wrap((req) => store.listRegions({ enabledOnly: req.query.enabled === '1' })))
app.post('/api/regions', adminAuth, wrap((req) => store.createRegion(req.body)))
app.put('/api/regions/:id', adminAuth, wrap((req) => store.updateRegion(req.params.id, req.body)))

// 政务资讯与视频内容
app.get('/api/content-posts', wrap((req) => store.listContentPosts({
  type: req.query.type,
  publishedOnly: !isAdminRequest(req)
})))
app.get('/api/content-posts/:id', wrap((req) => store.listContentPosts({ publishedOnly: !isAdminRequest(req) })
  .find((item) => String(item.id) === String(req.params.id))))
app.post('/api/content-posts', adminAuth, wrap((req) => store.createContentPost(req.body)))
app.put('/api/content-posts/:id', adminAuth, wrap((req) => store.updateContentPost(req.params.id, req.body)))
app.delete('/api/content-posts/:id', adminAuth, wrap((req) => store.deleteContentPost(req.params.id)))

// 活动/商品
app.get('/api/activities', wrap((req) => store.searchActivities(req.query.keyword, req.query.category, { publishedOnly: !isAdminRequest(req) })))
app.get('/api/activities/:id', wrap((req) => store.listActivitiesForDisplay({ publishedOnly: !isAdminRequest(req) })
  .find((a) => String(a.id) === String(req.params.id))))
app.post('/api/activities', adminAuth, wrap((req) => store.createActivity(req.body)))
app.put('/api/activities/:id', adminAuth, wrap((req) => store.updateActivity(req.params.id, req.body)))
app.delete('/api/activities/:id', adminAuth, wrap((req) => store.deleteActivity(req.params.id)))

// 商品
app.get('/api/products', wrap((req) => store.listProducts({ publishedOnly: !isAdminRequest(req) })))
app.post('/api/products', adminAuth, wrap((req) => store.createProduct(req.body)))
app.put('/api/products/:id', adminAuth, wrap((req) => store.updateProduct(req.params.id, req.body)))
app.delete('/api/products/:id', adminAuth, wrap((req) => store.deleteProduct(req.params.id)))

// 积分商城：商品由运营后台维护，兑换时校验当前会员、积分、库存和地址。
app.get('/api/point-products', wrap((req) => store.listPointProducts({ publishedOnly: !isAdminRequest(req) })))
app.post('/api/point-products', adminAuth, wrap((req) => store.createPointProduct(req.body)))
app.put('/api/point-products/:id', adminAuth, wrap((req) => store.updatePointProduct(req.params.id, req.body)))
app.delete('/api/point-products/:id', adminAuth, wrap((req) => store.deletePointProduct(req.params.id)))
app.get('/api/point-orders', wrap((req) => {
  if (isAdminRequest(req)) return store.listPointOrders()
  const userId = requestUserId(req)
  if (!userId) throw httpError(401, '登录已失效，请重新登录')
  return store.listPointOrders(userId)
}))
app.post('/api/point-orders', wrap((req) => {
  const userId = requestUserId(req)
  if (!userId) throw httpError(401, '登录已失效，请重新登录')
  return store.redeemPointProduct(userId, req.body)
}))
app.put('/api/point-orders/:id', adminAuth, wrap(async (req) => {
  const order = store.updatePointOrder(req.params.id, req.body)
  if (req.body?.status === '已发货') await subscribeOrderLogistics(order, 'point')
  return order
}))

// 后台全局待办不属于单个订单资源，保留在管理端命名空间。
app.get('/api/admin/notifications', adminAuth, wrap(() => store.adminNotifications()))

// 主理人
app.get('/api/managers', wrap((req) => (isAdminRequest(req) ? store.listManagers() : store.listPublicManagers())))
app.post('/api/managers', adminAuth, wrap((req) => store.createManager(req.body || {})))
app.get('/api/managers/:id/finance', adminAuth, wrap((req) => store.getManagerFinanceDetail(req.params.id)))
app.get('/api/manager-applications', adminAuth, wrap(() => store.get().managerApplications))
app.post('/api/manager-applications', wrap((req) => {
  const userId = String((req.body && req.body.userId) || requestUserId(req)).trim()
  requireUser(req, userId)
  return store.applyManager({ ...req.body, userId })
}))
app.get('/api/manager-applications/:id', wrap((req) => {
  const userId = requestUserId(req)
  requireUser(req, userId)
  const application = store.get().managerApplications.find((item) => String(item.id) === String(req.params.id))
  if (application && String(application.userId) !== String(userId)) throw httpError(403, '无权查看其他会员的申请')
  return application || null
}))
app.post('/api/manager-applications/:id/pay', wrap(async (req) => {
  const userId = requestUserId(req)
  requireUser(req, userId)
  return requestManagerApplicationPayment(req.params.id, userId)
}))
app.post('/api/manager-applications/:id/payment-status/refresh', wrap(async (req) => {
  const userId = requestUserId(req)
  requireUser(req, userId)
  const application = store.get().managerApplications.find((item) => String(item.id) === String(req.params.id))
  if (!application || String(application.userId) !== String(userId)) throw httpError(404, '申请不存在')
  return refreshWechatPayment(req.params.id)
}))
app.post('/api/manager-applications/:id/approve', adminAuth, wrap((req) => store.approveManagerApp(req.params.id, req.body || {})))
app.post('/api/manager-applications/:id/reject', adminAuth, wrap(async (req) => rejectManagerApplication(req.params.id, req.body.reason)))
app.post('/api/managers/:id/status', adminAuth, wrap((req) => store.setManagerStatus(req.params.id, req.body.status)))

// 客户与归属
app.get('/api/bindings', adminAuth, wrap(() => store.listBindingsForAdmin()))
app.post('/api/bindings/unbind', adminAuth, wrap((req) => store.unbindCustomer(req.body.customerId, req.body.reason)))
app.post('/api/bindings/rebind', adminAuth, wrap((req) => store.rebindCustomer(req.body.customerId, req.body.managerId, req.body.reason)))
app.get('/api/users/:id', wrap((req) => {
  requireUser(req, req.params.id)
  return store.getUserProfile(req.params.id)
}))
app.put('/api/users/:id', wrap((req) => {
  requireUser(req, req.params.id)
  return store.updateUserProfile(req.params.id, req.body)
}))
app.post('/api/members/join', wrap((req) => {
  const userId = String((req.body && req.body.userId) || requestUserId(req)).trim()
  requireUser(req, userId)
  return store.joinMember(userId)
}))
app.post('/api/cards/:id/checkin', wrap((req) => {
  const userId = requestUserId(req)
  requireUser(req, userId)
  return store.selfCheckInCard(req.params.id, userId, req.body)
}))
app.post('/api/cards/:id/makeup-checkin', adminAuth, wrap((req) => store.makeupCheckInCard(req.params.id, req.body)))
app.post('/api/customers/:id/bind', wrap((req) => {
  requireUser(req, req.params.id)
  return store.bindCustomerByCodeOrId(req.params.id, req.body.code, req.body.managerId, req.body.source)
}))
app.post('/api/customers/:id/unbind', wrap((req) => {
  requireUser(req, req.params.id)
  return store.unbindCustomerByUser(req.params.id, req.body.reason)
}))
app.post('/api/customers/:id/unbind-apply', wrap((req) => {
  requireUser(req, req.params.id)
  return store.applyUnbind(req.params.id, req.body.reason)
}))
app.get('/api/managers/:id/dashboard', wrap((req) => ({
  ...store.getManagerDashboard(req.params.id, {
    userId: isAdminRequest(req) ? req.query.userId : requestUserId(req),
    isAdmin: isAdminRequest(req)
  }),
  // 主理人确认收款时需要 mchId/appId 拉起微信官方收款页
  transfer: transferClientConfig()
})))

// 解绑申请
app.get('/api/unbind-applications', adminAuth, wrap(() => store.get().unbindApplications || []))
app.post('/api/unbind-applications/:id/approve', adminAuth, wrap((req) => store.auditUnbind(req.params.id, true)))
app.post('/api/unbind-applications/:id/reject', adminAuth, wrap((req) => store.auditUnbind(req.params.id, false, req.body.reason)))

// 佣金
app.get('/api/commissions', adminAuth, wrap(() => store.get().commissions))
app.get('/api/commission-settlements', adminAuth, wrap((req) => store.getSettlementRecords(req.query.managerId)))
app.post('/api/commissions/settle', adminAuth, wrap((req) => store.settleCommissions(req.body || {})))
app.post('/api/commissions/:id/adjust', adminAuth, wrap((req) => store.adjustCommission(req.params.id, req.body.amount, req.body.reason)))

// 提现
app.get('/api/withdraws', adminAuth, wrap(() => store.get().withdraws))
app.get('/api/withdraws/:id', adminAuth, wrap((req) => ({
  ...store.getWithdrawDetail(req.params.id),
  transfer: transferPublicConfig()
})))
app.post('/api/withdraws', wrap((req) => {
  const managerId = req.body.managerId
  // 只能为绑定了自己的主理人账号发起提现，避免替别人锁单
  if (!isAdminRequest(req)) {
    const caller = requestUserId(req)
    if (!caller) throw httpError(401, '登录已失效，请重新登录')
    const own = store.findManagerByUser(caller)
    if (!own || String(own.id) !== String(managerId)) throw httpError(403, '只能为自己的主理人账号发起提现')
  }
  return store.applyWithdraw(managerId, req.body.amount, { source: req.body.source })
}))
app.post('/api/withdraws/:id/approve', adminAuth, wrap((req) => {
  const body = req.body || {}
  const operator = req.admin?.name || 'admin'
  if (body.payMethod && String(body.payMethod) !== 'wechat') {
    throw httpError(400, '人工标记到账已禁用，只能通过微信商家转账打款')
  }
  return requestWithdrawTransfer(req.params.id, { ...body, payMethod: 'wechat', operator })
}))
app.post('/api/withdraws/:id/reject', adminAuth, wrap((req) => store.rejectWithdraw(req.params.id, req.body.reason, req.admin?.name || 'admin')))
// 主理人确认收款后主动同步一次结果；也用于管理员手工查单。
app.post('/api/withdraws/:id/transfer/sync', wrap((req) => {
  const record = store.findWithdrawById(req.params.id)
  if (!record) throw httpError(404, '提现单不存在')
  if (!isAdminRequest(req)) {
    const caller = requestUserId(req)
    const own = caller ? store.findManagerByUser(caller) : null
    if (!own || String(own.id) !== String(record.managerId)) throw httpError(403, '只能查询自己的提现单')
  }
  return syncWithdrawTransfer(req.params.id)
}))
app.post('/api/withdraws/:id/transfer/cancel', adminAuth, wrap((req) => cancelWithdrawTransfer(req.params.id)))
app.get('/api/transfers/config', adminAuth, wrap(() => transferPublicConfig()))

// 配置
app.get('/api/config', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate')
  next()
}, wrap(() => store.get().config))

function validatedConfigInput(req, input) {
  const db = store.get()
  const next = { ...(input || {}) }
  const financeRules = {
    globalCommissionRate: { min: 0, max: 100, integer: false, label: '全局佣金比例' },
    minWithdraw: { min: 0.01, max: 50000, integer: false, label: '最低提现金额' },
    withdrawMonthlyLimit: { min: 1, max: 31, integer: true, label: '每月提现次数' },
    withdrawTaxRate: { min: 0, max: 100, integer: false, label: '提现税费比例' },
    managerApplyFee: { min: 0, max: 50000, integer: false, label: '主理人申请费用' }
  }
  const changedFinanceKeys = Object.keys(financeRules).filter((key) => Object.prototype.hasOwnProperty.call(next, key)
    && Number(next[key]) !== Number(db.config[key]))
  if (changedFinanceKeys.length && !hasAdminPermission(req.admin, 'finance.manage')) {
    throw httpError(403, '当前账号没有修改财务规则的权限')
  }
  Object.entries(financeRules).forEach(([key, rule]) => {
    if (!Object.prototype.hasOwnProperty.call(next, key)) return
    const value = Number(next[key])
    if (!Number.isFinite(value) || value < rule.min || value > rule.max || (rule.integer && !Number.isInteger(value))) {
      throw httpError(400, `${rule.label}配置不正确`)
    }
    next[key] = value
  })
  if (Object.prototype.hasOwnProperty.call(next, 'balanceRechargeAmounts')) {
    const amounts = parseBalanceRechargeAmounts(next.balanceRechargeAmounts)
    if (!amounts) throw httpError(400, '充值金额须设置1至8项，每项为1至50000元且不可重复')
    next.balanceRechargeAmounts = amounts
  }
  return next
}

app.put('/api/config', adminAuth, wrap((req) => (
  store.updateConfiguration(validatedConfigInput(req, req.body)).config
)))
app.put('/api/config/bundle', adminAuth, wrap((req) => store.updateConfiguration(
  validatedConfigInput(req, req.body?.config),
  req.body?.categories
)))

// 统计
app.get('/api/stats/dashboard', adminAuth, wrap(() => store.dashboardStats()))
app.get('/api/logs', adminAuth, wrap(() => store.getLogs()))
app.get('/api/logistics/config', adminAuth, wrap(() => kdniaoPublicConfig()))
app.post('/api/logistics/query', adminAuth, wrap(async (req) => {
  const trackingNo = String(req.body?.trackingNo || '').trim()
  if (!/^[A-Za-z0-9-]{6,32}$/.test(trackingNo)) throw httpError(400, '请输入正确的快递单号')
  if (!kdniaoConfigured()) throw httpError(503, '快递鸟未配置')
  const result = await queryKdniao({ orderId: '', trackingNo, carrier: '', carrierCode: '' })
  return normalizeKdniaoQuery(result)
}))
app.get('/api/logistics/exceptions', adminAuth, wrap(() => store.listLogisticsExceptions()))
app.post('/api/logistics/:id/refresh', adminAuth, wrap((req) => refreshLogisticsShipment(store.getLogisticsShipment(req.params.id))))

// 私域直播
app.get('/api/lives', wrap((req) => store.listLives(isAdminRequest(req) ? req.query.userId : (requestUserId(req) || null), { admin: isAdminRequest(req) })))
app.post('/api/lives/:id/purchase', wrap((req) => {
  const userId = String((req.body && req.body.userId) || requestUserId(req)).trim()
  requireUser(req, userId)
  return store.purchaseLive(req.params.id, userId, { useBalance: Boolean(req.body?.useBalance) })
}))
app.post('/api/lives', adminAuth, wrap((req) => store.createLive(req.body)))
app.put('/api/lives/:id', adminAuth, wrap((req) => store.updateLive(req.params.id, req.body)))
app.delete('/api/lives/:id', adminAuth, wrap((req) => store.deleteLive(req.params.id)))

app.use((req, res) => res.status(404).json({ code: 404, message: '接口不存在' }))

store.init()
app.listen(PORT, () => {
  console.log(`岁悦里后端已启动：http://127.0.0.1:${PORT}`)
  console.log(`管理员认证：${ADMIN_TOKEN ? '已配置' : '未配置'}`)
  console.log(`微信登录 AppID：${WECHAT_APPID}（AppSecret ${WECHAT_APP_SECRET ? '已配置' : '未配置'}）`)
  console.log(`微信支付：${paymentConfigured() ? '已配置（真实支付）' : '未配置（支付接口将拒绝请求，不会模拟成功）'}`)
  console.log(`商家转账：${transferConfigured() ? '已启用（提现可打款到微信零钱）' : '未启用（提现审核打款已禁用）'}`)
  console.log(`快递鸟物流：${kdniaoConfigured() ? '已配置' : '未配置（发货仍可保存，不会订阅轨迹）'}`)
})

startLogisticsRefreshJob()
startWechatPaymentJob()
startWechatTransferJob()
