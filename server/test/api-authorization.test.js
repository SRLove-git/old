import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { seed } from '../src/seed.js'
import { permissionForRequest } from '../src/lib/permissions.js'
import { hasAdminPermission } from '../src/middleware/auth.js'

test('内容管理路由使用一致的权限，未映射功能默认关闭', () => {
  const editor = { role: 'staff', permissions: ['content.manage'] }
  const path = permissionForRequest({ method: 'GET', path: '/API/CONTENT-POSTS/' })
  assert.equal(path, 'content.manage')
  assert.equal(hasAdminPermission(editor, path), true)
  assert.equal(hasAdminPermission(editor, permissionForRequest({ method: 'GET', path: '/api/unassigned' })), false)
  assert.equal(hasAdminPermission(null, 'admin.self'), false)
})

const serverRoot = fileURLToPath(new URL('../', import.meta.url))
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'suiyueli-api-auth-'))
const sessionSecret = crypto.randomBytes(32).toString('hex')
const running = new Set()

// 启动真实路由，使用临时 JSON 数据；子进程只接收白名单环境变量。
// 所有外部请求均由此预加载模块阻断，微信查单只返回临时 RSA 签名的 NOTPAY。
const mockPath = path.join(directory, 'mock-provider.mjs')
fs.writeFileSync(mockPath, `
import crypto from 'node:crypto'
import fs from 'node:fs'
const merchant = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const platform = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
Object.assign(process.env, {
  WECHAT_APPID: 'wx-auth-test', WECHAT_PAY_MCH_ID: '1900000001',
  WECHAT_PAY_CERT_SERIAL: 'TEST-MERCHANT',
  WECHAT_PAY_PRIVATE_KEY: merchant.privateKey.export({type:'pkcs8',format:'pem'}),
  WECHAT_PAY_API_V3_KEY: '12345678901234567890123456789012',
  WECHAT_PAY_NOTIFY_URL: 'https://auth-test.invalid/notify',
  WECHAT_PAY_PLATFORM_SERIAL: 'TEST-PLATFORM',
  WECHAT_PAY_PLATFORM_PUBLIC_KEY: platform.publicKey.export({type:'spki',format:'pem'}),
  WECHAT_PAY_API_HOSTS: 'https://auth-test.invalid'
})
globalThis.fetch = async (url, options = {}) => {
  fs.appendFileSync(process.env.TEST_EXTERNAL_CALLS, JSON.stringify({url:String(url),method:options.method || 'GET'}) + '\\n')
  const parsed = new URL(url)
  if (parsed.hostname !== 'auth-test.invalid' || (options.method || 'GET') !== 'GET' || !parsed.pathname.includes('/out-trade-no/')) throw new Error('Test blocked unexpected external request')
  const raw = JSON.stringify({appid:'wx-auth-test',mchid:'1900000001',out_trade_no:decodeURIComponent(parsed.pathname.split('/').at(-1)),trade_state:'NOTPAY'})
  const timestamp = String(Math.floor(Date.now()/1000)), nonce = 'test-response'
  const signature = crypto.sign('RSA-SHA256', Buffer.from(timestamp+'\\n'+nonce+'\\n'+raw+'\\n'), platform.privateKey).toString('base64')
  return new Response(raw,{status:200,headers:{'content-type':'application/json','wechatpay-timestamp':timestamp,'wechatpay-nonce':nonce,'wechatpay-signature':signature,'wechatpay-serial':'TEST-PLATFORM'}})
}
// index.js 的 PORT=0 让系统分配端口，通过实际 listen 地址回传，避免端口争用。
const { default: http } = await import('node:http')
const originalListen = http.Server.prototype.listen
http.Server.prototype.listen = function (...args) {
  this.once('listening', () => process.send?.({port:this.address().port}))
  return originalListen.apply(this,args)
}
`)

function fixture() {
  const database = structuredClone(seed)
  const deadline = Date.now() + 60 * 60 * 1000
  database.customers = ['member-a', 'member-b'].map(id => ({ id, name: id, member: true, balance: 0, points: 0 }))
  database.products = [{ id: 9001, title: '测试商品', status: 1, memberPrice: 20, price: 20, stock: 10, serviceMode: 'delivery', sellType: 'sku', hasSku: false, skus: [], schedules: [] }]
  database.orders = ['a', 'b'].map(suffix => ({ id: `ORDER-${suffix}`, userId: `member-${suffix}`, activityId: 9001, title: '测试订单', status: '待付款', paymentStatus: 'NOTPAY', serviceMode: 'delivery', payAmount: 20, count: 1, payDeadline: deadline }))
  database.balanceRecharges = [{ id: 'BAL-b', userId: 'member-b', amount: 100, amountFen: 10000, status: '待支付', paymentStatus: 'NOTPAY' }]
  database.managerApplications = [{ id: 'MA-b', userId: 'member-b', name: '测试申请', phone: '13800000000', status: '待付款', paymentStatus: '待支付' }]
  database.adminAccounts = [
    { id: 'staff-dashboard', username: 'test_dashboard', role: 'staff', status: 1, permissions: ['dashboard.view'] },
    { id: 'staff-orders', username: 'test_orders', role: 'staff', status: 1, permissions: ['orders.manage'] },
    { id: 'staff-courses', username: 'test_courses', role: 'staff', status: 1, permissions: ['courses.manage'] }
  ]
  database.addresses = [{ id: 'ADDR-b', userId: 'member-b', name: '测试收件人', phone: '13800000000' }]
  database.participants = []
  database.commissions = []
  database.withdraws = []
  database.logisticsShipments = [{ id: 'LOG-b', orderId: 'ORDER-b', orderType: 'order', trackingNo: 'TEST123456', status: '物流异常', subscriptionStatus: 'failed', receiverPhone: '13800000000' }]
  return database
}

function token(userId, extra = {}) {
  const body = Buffer.from(JSON.stringify({ userId, exp: Math.floor(Date.now() / 1000) + 3600, ...extra })).toString('base64url')
  return `${body}.${crypto.createHmac('sha256', sessionSecret).update(body).digest('base64url')}`
}
const member = id => ({ authorization: `Bearer ${token(id)}` })
const staff = id => ({ 'x-admin-token': token(id, { role: 'admin', accountId: id }) })

async function startServer(environment = {}, database = fixture()) {
  const dir = fs.mkdtempSync(path.join(directory, 'server-'))
  const dataFile = path.join(dir, 'data.json')
  const callsFile = path.join(dir, 'external-calls.jsonl')
  fs.writeFileSync(dataFile, JSON.stringify(database))
  fs.writeFileSync(callsFile, '')
  const child = spawn(process.execPath, ['--import', mockPath, path.join(serverRoot, 'src/index.js')], {
    cwd: serverRoot,
    env: { PATH: process.env.PATH, PORT: '0', DATA_FILE: dataFile, SESSION_SECRET: sessionSecret, ADMIN_PASSWORD: 'test-only-password', ADMIN_TOKEN: 'test-only-admin', TEST_EXTERNAL_CALLS: callsFile, ...environment },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  })
  running.add(child)
  let output = ''
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { output += chunk })
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server startup timed out: ${output}`)), 10_000)
    child.once('message', message => { clearTimeout(timer); resolve(message.port) })
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${output}`)) })
    child.once('error', error => { clearTimeout(timer); reject(error) })
  })
  return {
    async request(route, { method = 'GET', headers = {}, body } = {}) {
      const response = await fetch(`http://127.0.0.1:${port}${route}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })
      return { status: response.status, body: await response.json() }
    },
    calls: () => fs.readFileSync(callsFile, 'utf8').trim().split('\n').filter(Boolean),
    data: () => JSON.parse(fs.readFileSync(dataFile, 'utf8')),
    async close() {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit')
        child.kill('SIGTERM')
        await exited
      }
      running.delete(child)
    }
  }
}

test.after(async () => {
  await Promise.all([...running].map(async child => {
    if (child.exitCode !== null || child.signalCode !== null) return
    const exited = once(child, 'exit')
    child.kill('SIGTERM')
    await exited
  }))
  fs.rmSync(directory, { recursive: true, force: true })
})

test('管理端按链接导入后，小程序首页接口可读取原文，重复导入只产生一条资讯', async () => {
  const db = fixture()
  db.adminAccounts.push({ id: 'editor', username: 'editor', role: 'staff', status: 1, permissions: ['content.manage'] })
  const server = await startServer({}, db)
  try {
    const route = '/api/content-posts/wechat-import'
    const url = 'https://mp.weixin.qq.com/s/history-fixture'
    const body = { title: '历史资讯', publishedAt: '2026-10-23', url, accountConfirmed: true }
    const post = (headers, data = body) => server.request(route, { method: 'POST', headers, body: data })
    assert.equal((await post({})).status, 401)
    assert.equal((await post(staff('staff-dashboard'))).status, 403)
    assert.equal((await post(staff('editor'), { ...body, url: 'https://example.com/' })).status, 400)
    assert.equal((await post(staff('editor'), { ...body, accountConfirmed: false })).status, 400)
    assert.equal((await post(staff('editor'), { ...body, url: url + '?tempkey=preview' })).status, 400)
    assert.deepEqual((await post(staff('editor'))).body.data, { added: 1 })
    assert.deepEqual((await post(staff('editor'), { ...body, url: url + '?scene=1' })).body.data, { added: 0 })
    const home = await server.request('/api/home')
    const articles = home.body.data.contentPosts.filter(row => row.officialArticleUrl === url)
    assert.equal(articles.length, 1)
    assert.equal(articles[0].publishedAt, '2026-10-23')
    assert.equal(articles[0].wechat, undefined)
    const id = articles[0].id
    const details = await server.request(`/api/content-posts/${id}`, { headers: staff('editor') })
    assert.equal(details.body.data.wechat.confirmedBy, 'editor')
    assert.equal(details.body.data.wechat.sourceVerification, 'operator-confirmed')
    assert.equal((await server.request('/api/admin/me', { headers: staff('staff-dashboard') })).status, 200)
    assert.equal((await server.request(`/api/content-posts/${id}`, { headers: staff('staff-dashboard') })).body.data.wechat, undefined)
    assert.equal(server.calls().length, 0)
  } finally { await server.close() }
})

test('a course editor can upload course images but cannot use another publishing permission', async () => {
  const server = await startServer()
  try {
    const upload = scope => server.request(`/api/uploads/image?scope=${scope}`, {
      method: 'POST', headers: staff('staff-courses'), body: { dataUrl: 'invalid' }
    })
    const permitted = await upload('courses')
    assert.equal(permitted.status, 400)
    assert.match(permitted.body.message, /PNG/)
    assert.equal((await upload('products')).status, 403)
    assert.equal((await upload('accounts')).status, 403)
  } finally {
    await server.close()
  }
})

for (const [label, environment] of [
  ['production ignores even an enabled legacy flag', { NODE_ENV: 'production', ALLOW_LEGACY_USER_ID: 'true' }],
  ['missing NODE_ENV defaults to signed sessions', { ALLOW_LEGACY_USER_ID: 'true' }],
  ['development requires an explicit legacy flag', { NODE_ENV: 'development' }]
]) {
  test(label, async () => {
    const server = await startServer(environment)
    try {
      const attempts = [
        ['/api/orders', {}],
        ['/api/orders', { headers: { 'x-user-id': 'member-a' } }],
        ['/api/orders?userId=member-a', {}],
        ['/api/orders', { method: 'POST', body: { activityId: 9001, count: 1 } }],
        ['/api/orders', { method: 'POST', body: { userId: 'member-a', activityId: 9001, count: 1 } }],
        ['/api/orders', { headers: { authorization: 'Bearer invalid-token', 'x-user-id': 'member-a' } }]
      ]
      for (const [route, options] of attempts) assert.equal((await server.request(route, options)).status, 401, `${options.method || 'GET'} ${route}`)
      assert.equal(server.data().orders.length, 2, 'rejected anonymous requests must not create orders')
      assert.equal(server.data().products[0].stock, 10, 'rejected anonymous requests must not reserve stock')
      const own = await server.request('/api/orders', { headers: member('member-a') })
      assert.equal(own.status, 200)
      assert.deepEqual(own.body.data.map(row => row.id), ['ORDER-a'])
      assert.equal((await server.request('/api/orders', { method: 'POST', headers: member('member-a'), body: { userId: 'member-b', activityId: 9001, count: 1 } })).status, 403)
      assert.equal(server.calls().length, 0)
    } finally { await server.close() }
  })
}

test('explicit development legacy mode works but signed sessions retain priority', async () => {
  const server = await startServer({ NODE_ENV: 'development', ALLOW_LEGACY_USER_ID: 'true' })
  try {
    const legacy = await server.request('/api/orders', { headers: { 'x-user-id': 'member-a' } })
    assert.equal(legacy.status, 200)
    assert.deepEqual(legacy.body.data.map(row => row.id), ['ORDER-a'])
    const signed = await server.request('/api/orders', { headers: { ...member('member-b'), 'x-user-id': 'member-a' } })
    assert.equal(signed.status, 200)
    assert.deepEqual(signed.body.data.map(row => row.id), ['ORDER-b'])
    assert.equal((await server.request('/api/orders')).status, 401)
  } finally { await server.close() }
})

test('payment refresh rejects absent, cross-user and cross-business IDs before external calls', async () => {
  const server = await startServer({ NODE_ENV: 'production' })
  try {
    const checks = [
      ['/api/orders/ORDER-b/payment-status/refresh', {}, 401],
      ['/api/orders/ORDER-b/payment-status/refresh', member('member-a'), 403],
      ...['BAL-b', 'MA-b', 'missing'].flatMap(id => [
        [`/api/orders/${id}/payment-status/refresh`, {}, 404],
        [`/api/orders/${id}/payment-status/refresh`, member('member-b'), 404],
        [`/api/orders/${id}/payment-status/refresh`, staff('staff-orders'), 404]
      ]),
      ['/api/balance/recharges/BAL-b/payment-status/refresh', member('member-a'), 404],
      ['/api/balance/recharges/ORDER-b/payment-status/refresh', member('member-b'), 404],
      ['/api/manager-applications/MA-b/payment-status/refresh', member('member-a'), 404],
      ['/api/manager-applications/ORDER-b/payment-status/refresh', member('member-b'), 404]
    ]
    for (const [route, headers, status] of checks) assert.equal((await server.request(route, { method: 'POST', headers, body: {} })).status, status, route)
    assert.equal(server.calls().length, 0, 'rejected requests must never call the payment provider')
    for (const [route, headers, id] of [
      ['/api/orders/ORDER-b/payment-status/refresh', member('member-b'), 'ORDER-b'],
      ['/api/orders/ORDER-b/payment-status/refresh', staff('staff-orders'), 'ORDER-b'],
      ['/api/balance/recharges/BAL-b/payment-status/refresh', member('member-b'), 'BAL-b'],
      ['/api/manager-applications/MA-b/payment-status/refresh', member('member-b'), 'MA-b']
    ]) {
      const response = await server.request(route, { method: 'POST', headers, body: {} })
      assert.equal(response.status, 200, JSON.stringify(response.body))
      assert.equal(response.body.data.id, id)
    }
    assert.equal(server.calls().length, 4)
  } finally { await server.close() }
})

test('missing owned records reject without mutation, and another member cannot edit a record', async () => {
  const server = await startServer({ NODE_ENV: 'production' })
  try {
    assert.equal((await server.request('/api/addresses/missing', { method: 'PUT', headers: member('member-a'), body: { name: 'invalid' } })).status, 404)
    assert.equal((await server.request('/api/participants/missing', { method: 'DELETE', headers: staff('staff-orders') })).status, 404)
    assert.equal((await server.request('/api/addresses/ADDR-b', { method: 'PUT', headers: member('member-a'), body: { name: 'invalid' } })).status, 403)
    assert.equal(server.data().addresses[0].name, '测试收件人')
  } finally { await server.close() }
})

test('logistics administration requires orders permission, including reads and provider queries', async () => {
  const server = await startServer({ NODE_ENV: 'production' })
  try {
    for (const [route, method] of [['/api/logistics/config', 'GET'], ['/api/logistics/exceptions', 'GET'], ['/api/logistics/query', 'POST'], ['/api/logistics/LOG-b/refresh', 'POST']]) {
      assert.equal((await server.request(route, { method, headers: staff('staff-dashboard'), ...(method === 'POST' ? { body: { trackingNo: 'TEST123456' } } : {}) })).status, 403, route)
    }
    assert.equal(server.calls().length, 0)
    assert.equal((await server.request('/api/logistics/config', { headers: staff('staff-orders') })).status, 200)
    const exceptions = await server.request('/api/logistics/exceptions', { headers: staff('staff-orders') })
    assert.equal(exceptions.status, 200)
    assert.equal(exceptions.body.data[0].id, 'LOG-b')
  } finally { await server.close() }
})

const publishingAreas = [
  { path: 'activities', merchantPath: 'activities' },
  { path: 'products', merchantPath: 'products' },
  { path: 'lives', merchantPath: 'courses' }
]
const adminHeaders = { 'x-admin-token': 'test-only-admin' }
function publicCatalogFixture() {
  const data = fixture()
  for (const key of ['managers', 'merchantAccounts', 'activities', 'products', 'lives', 'bindings', 'orders', 'cards', 'logisticsShipments']) data[key] = []
  return data
}
function offering(path) {
  return { title: `平台${path}`, memberPrice: 20, price: 20, coverImage: 'https://images.example.test/test.png', status: path === 'lives' ? 'scheduled' : 1 }
}
function ok(response) {
  assert.equal(response.status, 200, JSON.stringify(response.body))
  assert.equal(response.body.code, 0)
  return response.body.data
}
function assertPlatform(record) {
  assert.equal(record.publisherType, 'platform')
  assert.equal(record.managerId, null)
}

test('没有商户、没有主理人时管理员仍能发布三类平台内容并编辑旧平台课程', async () => {
  const data = publicCatalogFixture()
  data.lives.push({ id: 'old-platform-live', title: '历史平台课', status: 'scheduled', memberPrice: 20, lessons: [] })
  data.lives.push({ id: 'missing-shop', title: '原商家已删除', managerId: 9876, memberPrice: 20 })
  data.lives.push({ id: 'unknown-shop', title: '商家归属待修复', publisherType: 'merchant', managerId: null, memberPrice: 20 })
  const server = await startServer({ NODE_ENV: 'production' }, data)
  try {
    for (const { path } of publishingAreas) {
      const published = ok(await server.request(`/api/${path}`, { method: 'POST', headers: adminHeaders, body: offering(path) }))
      assertPlatform(published)
      const publicRow = ok(await server.request(`/api/${path}`)).find(row => row.id === published.id)
      assert.ok(publicRow, `${path} 应在小程序使用的公开列表可读`)
      assertPlatform(publicRow)
    }
    const old = ok(await server.request('/api/lives/old-platform-live', { method: 'PUT', headers: adminHeaders, body: { title: '已编辑历史平台课' } }))
    assertPlatform(old)
    const courses = ok(await server.request('/api/lives'))
    assert.equal(courses.find(row => row.id === old.id).title, old.title)
    for (const [id, managerId] of [['missing-shop', 9876], ['unknown-shop', null]]) {
      const course = courses.find(item => item.id === id)
      assert.equal(course.publisherType, 'merchant')
      assert.equal(course.managerId, managerId)
    }
    const corrected = ok(await server.request('/api/lives/unknown-shop', {
      method: 'PUT', headers: adminHeaders, body: { publisherType: 'platform' }
    }))
    assertPlatform(corrected)
    assert.deepEqual(server.data().managers, [])
    assert.deepEqual(server.data().merchantAccounts, [])
  } finally { await server.close() }
})

test('商户无法改删平台条目或用平台条目的 ID、发布来源及归属伪造商家内容', async () => {
  const data = publicCatalogFixture()
  const merchantId = 34
  data.managers.push({ id: merchantId, status: 1, name: '测试商户' })
  data.lives.push({ id: 'old-unassigned', title: '无归属旧课', hostName: '测试商户', memberPrice: 20 })
  data.merchantAccounts.push({ id: 'merchant-34', merchantId, status: 1, permissions: ['merchant.activities', 'merchant.products', 'merchant.courses'] })
  const merchantHeaders = { authorization: `Bearer ${token('merchant-34', { role: 'merchant', merchantId })}` }
  const server = await startServer({ NODE_ENV: 'production' }, data)
  try {
    assertPlatform(ok(await server.request('/api/lives')).find(row => row.id === 'old-unassigned'))
    assert.ok(!ok(await server.request('/api/merchant/courses', { headers: merchantHeaders })).some(row => row.id === 'old-unassigned'))
    for (const { path, merchantPath } of publishingAreas) {
      const platform = ok(await server.request(`/api/${path}`, { method: 'POST', headers: adminHeaders, body: { ...offering(path), publisherType: 'platform' } }))
      const endpoint = `/api/merchant/${merchantPath}`
      const attempt = { ...offering(path), id: platform.id, title: '商户创建', publisherType: 'platform', managerId: null }
      const claimed = await server.request(endpoint, { method: 'POST', headers: merchantHeaders, body: attempt })
      // 可以拒绝客户端提供的 ID，也可以忽略后分配新 ID；成功时必须绑定登录商户。
      if (claimed.status === 200) {
        const own = ok(claimed)
        assert.notEqual(own.id, platform.id)
        assert.equal(own.publisherType, 'merchant')
        assert.equal(own.managerId, merchantId)
        const changed = ok(await server.request(`${endpoint}/${own.id}`, { method: 'PUT', headers: merchantHeaders, body: { publisherType: 'platform', managerId: null, title: '仍为商户内容' } }))
        assert.equal(changed.publisherType, 'merchant')
        assert.equal(changed.managerId, merchantId)
      } else assert.ok(claimed.status === 400 || claimed.status === 409)
      assert.equal((await server.request(`${endpoint}/${platform.id}`, { method: 'PUT', headers: merchantHeaders, body: attempt })).status, 403)
      assert.equal((await server.request(`${endpoint}/${platform.id}`, { method: 'DELETE', headers: merchantHeaders })).status, 403)
      assert.ok(!ok(await server.request(endpoint, { headers: merchantHeaders })).some(row => row.id === platform.id))
      const visible = ok(await server.request(`/api/${path}`)).filter(row => row.id === platform.id)
      assert.equal(visible.length, 1)
      assertPlatform(visible[0])
      assert.equal(visible[0].title, platform.title)
    }
  } finally { await server.close() }
})

test('平台课程付款按购买会员当前绑定结佣，散客不生成佣金，两人均获得课程权益', async () => {
  const data = publicCatalogFixture()
  const promoterId = 61
  data.managers = [{ id: promoterId, status: 1, name: '推广主理人', commissionRate: 10 }]
  for (const customer of data.customers) {
    customer.managerId = null
    customer.balanceFen = 5000
    customer.balance = 50
  }
  const server = await startServer({ NODE_ENV: 'production' }, data)
  try {
    const course = ok(await server.request('/api/lives', { method: 'POST', headers: adminHeaders, body: { ...offering('lives'), publisherType: 'platform' } }))
    for (const customer of data.customers) {
      const headers = member(customer.id)
      const order = ok(await server.request(`/api/lives/${course.id}/purchase`, { method: 'POST', headers, body: { useBalance: true, managerId: 999 } }))
      assert.equal(order.managerId, null)
      assert.equal(order.publisherType, 'platform')
      assert.equal(order.publisherManagerId, null)
      const bound = customer.id === 'member-a'
      if (bound) {
        ok(await server.request('/api/bindings/rebind', { method: 'POST', headers: adminHeaders, body: { customerId: customer.id, managerId: promoterId, reason: '隔离测试' } }))
      }
      const payment = ok(await server.request(`/api/orders/${order.id}/pay`, { method: 'POST', headers, body: {} }))
      assert.equal(payment.balanceOnly, true)
      assert.equal(payment.order.paymentStatus, 'SUCCESS')
      assert.equal(payment.order.managerId, bound ? promoterId : null)
      assert.equal(payment.order.publisherManagerId, null)
      const stored = server.data()
      const commissions = stored.commissions.filter(row => row.orderId === order.id)
      if (bound) {
        const binding = stored.bindings.find(item => item.customerId === customer.id && item.status === 1)
        assert.equal(payment.order.bindingId, binding.id)
        assert.equal(commissions.length, 1)
        assert.equal(commissions[0].managerId, promoterId)
        assert.equal(commissions[0].bindingId, binding.id)
        assert.equal(commissions[0].commissionAmount, 2)
      } else assert.deepEqual(commissions, [])
      assert.ok(stored.cards.some(card => card.orderId === order.id && card.userId === customer.id && card.liveId === course.id))
      assertPlatform(stored.lives.find(row => row.id === course.id))
    }
    assert.equal(server.calls().length, 0)
  } finally { await server.close() }
})

function localDate(offset) {
  const day = new Date()
  day.setDate(day.getDate() + offset)
  return [day.getFullYear(), String(day.getMonth() + 1).padStart(2, '0'), String(day.getDate()).padStart(2, '0')].join('-')
}

function attendanceFixture() {
  const data = fixture()
  data.adminAccounts.push({ id: 'staff-crm', username: 'crm', status: 1, role: 'staff', permissions: ['customers.manage'] })
  data.adminAccounts.find(account => account.id === 'staff-orders').name = '现场测试员'
  data.customers = [
    { id: 'member-a', name: '签到测试甲', phone: '13800000001', idCard: 'test-sensitive-id', wechatOpenId: 'test-sensitive-openid', balanceFen: 5000 },
    { id: 'member-b', name: '签到测试乙', phone: '13800000002' },
    { id: 'no-card-member', name: '签到无卡', phone: '13800000003' }
  ]
  data.cards = [
    { id: 'expired-card', userId: 'member-a', title: '历史计次卡', validUntil: localDate(-2), remain: 1, total: 3, orderId: 'private-reference', attendanceRecords: [
      { id: 'absent-session', date: localDate(-2), time: '14:00-15:00', status: 'absent', latitude: 12, longitude: 32 }
    ] },
    { id: 'current-card', userId: 'member-a', title: '当前计次卡', validUntil: localDate(20), remain: 2, total: 2, attendanceRecords: [] },
    { id: 'other-card', userId: 'member-b', title: '他人计次卡', validUntil: localDate(20), remain: 1, total: 1, attendanceRecords: [] }
  ]
  return data
}

function assertClientError(response) {
  assert.ok(response.status >= 400 && response.status < 500, `预期客户端错误，实际为 ${response.status}: ${response.body.message}`)
}

test('核销人员可按姓名和手机号检索持卡会员并查看计次卡，不需要 CRM 权限', async () => {
  const server = await startServer({ NODE_ENV: 'production' }, attendanceFixture())
  try {
    const orderStaff = staff('staff-orders')
    const customer = { id: 'member-a', name: '签到测试甲', phone: '13800000001' }
    for (const keyword of ['测试甲', '13800000001']) {
      assert.deepEqual(ok(await server.request(`/api/cards/customers?keyword=${encodeURIComponent(keyword)}`, { headers: orderStaff })), [customer])
    }
    const all = ok(await server.request('/api/cards/customers', { headers: orderStaff }))
    assert.deepEqual(all.map(item => item.id).sort(), ['member-a', 'member-b'])
    const withoutCards = ok(await server.request(`/api/cards/customers?keyword=${encodeURIComponent('无卡')}`, { headers: orderStaff }))
    assert.deepEqual(withoutCards.map(item => item.id), ['no-card-member'])
    assert.deepEqual(ok(await server.request('/api/cards/customers/no-card-member', { headers: orderStaff })).cards, [])
    const profile = ok(await server.request('/api/cards/customers/member-a', { headers: orderStaff }))
    assert.deepEqual(profile.user, customer)
    assert.equal(profile.orders, undefined)
    assert.deepEqual(profile.cards.map(card => card.id).sort(), ['current-card', 'expired-card'])
    const card = profile.cards.find(item => item.id === 'expired-card')
    assert.equal(card.orderId, undefined)
    assert.equal(card.absentCount, 1)
    assert.equal(card.attendanceRecords[0].latitude, undefined)
    assert.equal(card.attendanceRecords[0].longitude, undefined)
    assertClientError(await server.request('/api/cards/customers/missing-user', { headers: orderStaff }))
    assert.equal((await server.request('/api/customers/member-a', { headers: orderStaff })).status, 403)
    assert.equal((await server.request('/api/customers/member-a', { headers: staff('staff-crm') })).status, 200)
    for (const [headers, expected] of [[{}, 401], [member('member-a'), 401], [staff('staff-crm'), 403], [staff('staff-dashboard'), 403]]) {
      for (const endpoint of ['/api/cards/customers?keyword=test', '/api/cards/customers/member-a']) {
        assert.equal((await server.request(endpoint, { headers })).status, expected)
      }
      const rejected = await server.request('/api/cards/current-card/makeup-checkin', { method: 'POST', headers, body: { date: localDate(0), time: '10:30', reason: '未授权补签' } })
      assert.equal(rejected.status, expected)
    }
    assert.equal(server.data().cards.find(item => item.id === 'current-card').remain, 2)
  } finally { await server.close() }
})

test('补签校验日期、时间与原因；过期卡可补有效期内的缺席，并发重试只扣一次', async () => {
  const server = await startServer({ NODE_ENV: 'production' }, attendanceFixture())
  try {
    const headers = staff('staff-orders')
    const makeup = (id, body) => server.request(`/api/cards/${id}/makeup-checkin`, { method: 'POST', headers, body })
    const booking = { date: localDate(-2), time: '14:00-15:00', reason: '当日现场签到遗漏', sessionId: 'absent-session' }
    const before = server.data().cards
    for (const input of [
      { date: '' }, { date: '2025-02-29' }, { date: localDate(1) }, { time: '24:00' }, { time: '23:70' }, { reason: '  ' }
    ]) assertClientError(await makeup('current-card', { ...booking, sessionId: '', ...input }))
    assertClientError(await makeup('expired-card', { ...booking, date: localDate(-1), sessionId: '' }))
    assertClientError(await makeup('expired-card', { ...booking, time: '19:00' }))
    assertClientError(await makeup('expired-card', { ...booking, date: localDate(-3) }))
    assertClientError(await makeup('expired-card', { ...booking, sessionId: 'forged-session' }))
    assert.deepEqual(server.data().cards, before)
    const spoof = { ...booking, operator: '伪造操作人', memberName: '伪造会员', memberPhone: '13800000009' }
    const replies = await Promise.all([makeup('expired-card', spoof), makeup('expired-card', spoof)])
    for (const reply of replies) assert.equal(ok(reply).remain, 0)
    const duplicate = await makeup('expired-card', { ...booking, sessionId: '' })
    assert.equal(ok(duplicate).remain, 0)
    const card = server.data().cards.find(item => item.id === 'expired-card')
    assert.equal(card.remain, 0)
    assert.equal(card.attendanceRecords.length, 1)
    const [record] = card.attendanceRecords
    assert.equal(record.id, 'absent-session')
    assert.equal(record.checkinType, 'makeup')
    assert.equal(record.status, 'checked')
    assert.equal(record.date, booking.date)
    assert.equal(record.time, booking.time)
    assert.equal(record.makeupReason, booking.reason)
    assert.equal(record.operator, '现场测试员')
    assert.equal(record.memberName, '签到测试甲')
    assert.equal(record.memberPhone, '13800000001')
    assert.ok(record.checkedAt)
    assertClientError(await makeup('expired-card', { ...booking, date: localDate(-3), sessionId: '' }))
    assert.deepEqual(server.data().cards.find(item => item.id === 'expired-card'), card)
    const manual = ok(await makeup('current-card', { date: localDate(-1), time: '09:45', reason: '后台补登' }))
    assert.equal(manual.remain, 1)
    assert.equal(manual.attendanceRecords[0].time, '09:45')
    assert.equal(manual.attendanceRecords[0].memberPhone, undefined)
  } finally { await server.close() }
})

test('订单核销码只匹配唯一订单，重复核销不会重复推进状态或写入履约日志', async () => {
  const data = fixture()
  const order = (id, code, mode = 'verify_code') => ({ id, code, serviceMode: mode, status: mode === 'delivery' ? '待发货' : '待核销', paymentStatus: 'SUCCESS', userId: 'member-a', title: '测试订单', payAmount: 10 })
  data.orders = [order('valid', '1234 5678'), order('dup-a', '8765 4321'), order('dup-b', '87654321'), order('unspecified', ''), order('delivery', '2222 3333', 'delivery')]
  const server = await startServer({ NODE_ENV: 'production' }, data)
  try {
    const headers = staff('staff-orders')
    const lookup = (code, identity = headers) => server.request(`/api/orders/code/${encodeURIComponent(code)}`, { headers: identity })
    const verify = (id, identity = headers) => server.request(`/api/orders/${id}/verify`, { method: 'POST', headers: identity, body: {} })
    const original = server.data().orders
    assert.equal(ok(await lookup('12345678')).id, 'valid')
    assert.equal(ok(await lookup('1234 5678')).id, 'valid')
    for (const invalid of [' ', 'abc123', '00000000']) assertClientError(await lookup(invalid))
    const conflict = await lookup('8765 4321')
    assertClientError(conflict)
    assert.match(conflict.body.message, /冲突|重复/)
    assert.equal((await lookup('12345678', staff('staff-dashboard'))).status, 403)
    assert.equal((await verify('valid', staff('staff-dashboard'))).status, 403)
    assertClientError(await verify('delivery'))
    assert.deepEqual(server.data().orders, original)
    const results = await Promise.all([verify('valid'), verify('valid')])
    assert.equal(results.filter(reply => reply.status === 200).length, 1)
    assertClientError(results.find(reply => reply.status !== 200))
    const completed = ok(results.find(reply => reply.status === 200))
    assert.equal(completed.status, '待评价')
    assert.equal(completed.fulfillmentStatus, '已核销')
    assert.ok(completed.verifiedAt)
    const snapshot = server.data()
    assertClientError(await verify('valid'))
    assert.deepEqual(server.data().orders, snapshot.orders)
    assert.deepEqual(server.data().logs, snapshot.logs)
    assert.equal(server.calls().length, 0)
  } finally { await server.close() }
})

test('同卡同日多节课必须选定课次，省略时间时保留所选课次的排课时段', async () => {
  const data = attendanceFixture()
  const date = localDate(-1)
  const scheduled = [
    { id: 'morning', status: 'absent', date, time: '09:00-10:30' },
    { id: 'afternoon', status: 'absent', date, time: '14:00-15:30' }
  ]
  data.cards.find(card => card.id === 'current-card').attendanceRecords = scheduled
  const server = await startServer({ NODE_ENV: 'production' }, data)
  try {
    const submit = (extra = {}) => server.request('/api/cards/current-card/makeup-checkin', {
      method: 'POST', headers: staff('staff-orders'), body: { date, reason: '课次签到遗漏', ...extra }
    })
    const ambiguous = await submit()
    assertClientError(ambiguous)
    assert.match(ambiguous.body.message, /选择.*课次/)
    const first = ok(await submit({ sessionId: 'afternoon' }))
    assert.equal(first.remain, 1)
    assert.equal(first.checkedCount, 1)
    assert.equal(first.absentCount, 1)
    const afternoon = first.attendanceRecords.find(row => row.id === 'afternoon')
    assert.equal(afternoon.status, 'checked')
    assert.equal(afternoon.time, '14:00-15:30')
    assert.equal(ok(await submit({ sessionId: 'afternoon' })).remain, 1)
    const morning = ok(await submit({ sessionId: 'morning' }))
    assert.equal(morning.remain, 0)
    assert.equal(morning.checkedCount, 2)
  } finally { await server.close() }
})
