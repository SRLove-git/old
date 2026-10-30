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
    { id: 'staff-orders', username: 'test_orders', role: 'staff', status: 1, permissions: ['orders.manage'] }
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

async function startServer(environment = {}) {
  const dir = fs.mkdtempSync(path.join(directory, 'server-'))
  const dataFile = path.join(dir, 'data.json')
  const callsFile = path.join(dir, 'external-calls.jsonl')
  fs.writeFileSync(dataFile, JSON.stringify(fixture()))
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
