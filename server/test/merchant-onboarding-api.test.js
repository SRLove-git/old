import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import express from 'express'

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'syl-merchant-onboarding-'))
process.env.DATA_FILE = path.join(directory, 'data.json')
process.env.SESSION_SECRET = randomUUID()
const store = await import('../src/store.js')
const { encodeSession, passwordRecord } = await import('../src/lib/session.js')
const { default: providerRoutes } = await import('../src/routes/provider-applications.js')
const { default: accountRoutes } = await import('../src/routes/admin-accounts.js')
const { default: merchantRoutes } = await import('../src/routes/merchant.js')
const accountPath = '/api/admin/merchant-accounts'
const applicationPath = '/api/provider-applications'
const credentials = { username: 'Test_Store', password: 'test-merchant-password' }
const contact = { shopName: '测试小店', contactName: '测试联系人', contactPhone: '13800000001' }
const review = { ...contact, cooperationMode: '服务合作', cooperationContent: '测试商品上架' }
let server, db, base

function session(userId, role) {
  const token = encodeSession({ userId, role, exp: Math.floor(Date.now() / 1000) + 3600 })
  return role === 'admin' ? { 'x-admin-token': token } : { authorization: `Bearer ${token}` }
}
const accountStaff = session('accounts-staff', 'admin')
const reviewStaff = session('review-staff', 'admin')
const customer = session('member-test', 'member')

async function request(endpoint, { method = 'GET', headers = {}, body } = {}) {
  const res = await fetch(base + endpoint, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })
  const json = await res.json()
  return { status: res.status, ...json }
}
function post(path, headers, body) { return request(path, { method: 'POST', headers, body }) }
function create(body) { return post(accountPath, accountStaff, { ...credentials, ...contact, ...body }) }
function value(result) {
  assert.equal(result.status, 200, result.message)
  assert.equal(result.code, 0, result.message)
  return result.data
}
function redacted(value) {
  for (const key of ['password', 'passwordHash', 'salt']) assert.equal(Object.hasOwn(value, key), false, `must omit ${key}`)
}
async function apply() {
  return value(await post(applicationPath, customer, { name: '申请企业', phone: contact.contactPhone, type: 'company', intro: '测试经营范围', address: '测试地址' }))
}

// 仅挂载实际审核、账号管理与商户路由，临时 JSON 独立于本地和线上业务数据。
test.before(async () => {
  db = store.init()
  const app = express()
  app.use(express.json())
  app.use(applicationPath, providerRoutes)
  app.use('/api/admin', accountRoutes)
  app.use('/api/merchant', merchantRoutes)
  server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  base = `http://127.0.0.1:${server.address().port}`
})
test.beforeEach(() => {
  db.adminAccounts = [
    { id: 'accounts-staff', username: 'accounts-staff', status: 1, role: 'staff', permissions: ['accounts.manage'] },
    { id: 'review-staff', username: 'review-staff', status: 1, role: 'staff', permissions: ['merchants.manage'] }
  ]
  db.providerApplications = []
  db.merchantAccounts = []
  db.managers = []
})
test.after(async () => {
  if (server) {
    const closed = once(server, 'close')
    server.close()
    server.closeAllConnections()
    await closed
  }
  fs.rmSync(directory, { recursive: true, force: true })
})

test('独立开户后可登录商户后台，只能使用分配的发布权限', async () => {
  const created = value(await create({ permissions: ['merchant.products'] }))
  redacted(created)
  assert.equal(created.username, 'test_store')
  assert.equal(created.shopName, contact.shopName)
  assert.deepEqual(created.permissions, ['merchant.products'])
  assert.equal(db.providerApplications.length, 0)
  assert.ok(db.managers.some(manager => manager.id === created.merchantId))
  assert.doesNotMatch(fs.readFileSync(process.env.DATA_FILE, 'utf8'), /test-merchant-password/)
  assert.equal((await post('/api/merchant/login', {}, { ...credentials, password: 'incorrect' })).status, 401)
  const login = value(await post('/api/merchant/login', {}, credentials))
  const headers = { authorization: `Bearer ${login.token}` }
  const me = value(await request('/api/merchant/me', { headers }))
  assert.equal(me.merchantId, created.merchantId)
  assert.equal(me.shopName, contact.shopName)
  assert.equal((await request('/api/merchant/products', { headers })).status, 200)
  assert.equal((await request('/api/merchant/courses', { headers })).status, 403)
  redacted(value(await request(accountPath, { headers: accountStaff }))[0])
})

test('审核通过仅更新申请，账号管理人员随后能关联开户一次', async () => {
  const pending = await apply()
  const approved = value(await post(`${applicationPath}/${pending.id}/approve`, reviewStaff, { ...review, ...credentials }))
  assert.equal(approved.status, '已通过')
  assert.equal(approved.name, pending.name)
  assert.equal(approved.type, pending.type)
  assert.equal(db.merchantAccounts.length, 0)
  assert.equal((await post('/api/merchant/login', {}, credentials)).status, 401)
  const candidates = () => request(`${accountPath}/candidates`, { headers: accountStaff })
  assert.deepEqual(value(await candidates()).map(row => row.id), [pending.id])
  const missingName = await create({ providerApplicationId: pending.id, shopName: ' ' })
  assert.equal(missingName.status, 400, '开户人员须明确输入核实后的店铺名称')
  const omittedName = await post(accountPath, accountStaff, { ...credentials, contactName: contact.contactName, contactPhone: contact.contactPhone, providerApplicationId: pending.id })
  assert.equal(omittedName.status, 400, '申请里的店铺名称不能替代开户时核实的正式名称')
  assert.deepEqual(value(await candidates()).map(row => row.id), [pending.id])
  const [first, retry] = await Promise.all([create({ providerApplicationId: pending.id }), create({ providerApplicationId: pending.id, username: 'retry_store' })])
  const successes = [first, retry].filter(response => response.status === 200)
  assert.equal(successes.length, 1)
  const failed = [first, retry].find(response => response.status !== 200)
  assert.ok(failed.status >= 400 && failed.status < 500, failed.message)
  const created = value(successes[0])
  assert.equal(created.providerApplicationId, pending.id)
  assert.equal(created.userId, 'member-test')
  const applications = value(await request(applicationPath, { headers: reviewStaff }))
  assert.equal(applications[0].merchantAccountId, created.id)
  assert.equal(applications[0].loginUsername, created.username)
  assert.equal(applications[0].accountStatus, 1)
  assert.ok(applications[0].accountCreatedAt)
  assert.deepEqual(value(await candidates()), [])
  assert.equal(db.merchantAccounts.length, 1)
  assert.equal(db.managers.length, 1)
  assert.equal(db.managers[0].userId, 'member-test')
  const login = value(await post('/api/merchant/login', {}, { ...credentials, username: created.username }))
  assert.equal(login.merchant.merchantId, created.merchantId)
})

test('开户权限独立于审核权限，未通过、已拒绝和不存在的申请均不能开户', async () => {
  const payload = { ...credentials, ...contact }
  for (const [headers, status] of [[{}, 401], [customer, 401], [reviewStaff, 403]]) {
    assert.equal((await post(accountPath, headers, payload)).status, status)
    assert.equal((await request(`${accountPath}/candidates`, { headers })).status, status)
  }
  const pending = await apply()
  assert.equal((await post(`${applicationPath}/${pending.id}/approve`, accountStaff, review)).status, 403)
  for (const applicationId of [pending.id, 'missing-apply']) {
    const failed = await create({ providerApplicationId: applicationId })
    assert.ok(failed.status >= 400 && failed.status < 500, failed.message)
  }
  value(await post(`${applicationPath}/${pending.id}/reject`, reviewStaff, { reason: '不符合条件' }))
  const rejected = await create({ providerApplicationId: pending.id })
  assert.ok(rejected.status >= 400 && rejected.status < 500, rejected.message)
  assert.equal(db.merchantAccounts.length, 0)
  assert.equal(db.managers.length, 0)
})

test('用户名忽略大小写后必须唯一，失败不产生多余商户主体', async () => {
  for (const malformed of ['merchant.products', ['accounts.manage']]) {
    assert.equal((await create({ permissions: malformed })).status, 400)
  }
  assert.equal(db.managers.length, 0)
  const first = value(await create())
  const duplicate = await create({ username: 'TEST_STORE', shopName: '另一家测试小店' })
  assert.ok(duplicate.status >= 400 && duplicate.status < 500, duplicate.message)
  assert.deepEqual(db.merchantAccounts.map(account => account.id), [first.id])
  assert.deepEqual(db.managers.map(manager => manager.id), [first.merchantId])
  assert.deepEqual([...first.permissions].sort(), ['merchant.activities', 'merchant.courses', 'merchant.products'])
})

test('落盘失败不留下可登录账号、关联标记或主理人，恢复写入后可重试', async () => {
  const pending = await apply()
  value(await post(`${applicationPath}/${pending.id}/approve`, reviewStaff, review))
  const file = process.env.DATA_FILE
  const saved = `${file}.moved`
  fs.renameSync(file, saved)
  fs.mkdirSync(file)
  try {
    assert.equal((await create({ providerApplicationId: pending.id })).status, 500)
    assert.equal(db.merchantAccounts.length, 0)
    assert.equal(db.managers.length, 0)
    assert.equal((await post('/api/merchant/login', {}, credentials)).status, 401)
    assert.deepEqual(value(await request(`${accountPath}/candidates`, { headers: accountStaff })).map(item => item.id), [pending.id])
  } finally {
    fs.rmdirSync(file)
    fs.renameSync(saved, file)
  }
  assert.equal(value(await create({ providerApplicationId: pending.id })).providerApplicationId, pending.id)
})

test('停用与权限一起编辑时，权限非法不能改变账号状态或导致退出', async () => {
  const created = value(await create({ permissions: ['merchant.products'] }))
  const login = value(await post('/api/merchant/login', {}, credentials))
  const headers = { authorization: `Bearer ${login.token}` }
  const update = body => request(`${accountPath}/${created.id}`, { headers: accountStaff, method: 'PUT', body })
  assert.equal((await update({ status: 0, permissions: ['accounts.manage'] })).status, 400)
  assert.equal((await request('/api/merchant/products', { headers })).status, 200)
  assert.equal(db.merchantAccounts[0].status, 1)
  assert.deepEqual(db.merchantAccounts[0].permissions, ['merchant.products'])
  value(await update({ status: 0, permissions: ['merchant.products'] }))
  assert.equal((await request('/api/merchant/me', { headers })).status, 401)
  assert.equal((await post('/api/merchant/login', {}, credentials)).status, 401)
})

test('关联已有主理人复用主体并保留原业绩，同手机号的其他人不受影响', async () => {
  const legacyManager = { id: 44, userId: 'member-test', name: '原主理人', shopName: '旧店铺', status: 1, phone: contact.contactPhone, totalPerformance: 678, totalCommission: 45 }
  const otherManager = { id: 45, userId: 'other-member', name: '同手机号', shopName: '其他店铺', status: 1, phone: contact.contactPhone, totalPerformance: 72 }
  db.managers.push({ ...otherManager }, { ...legacyManager })
  const pending = await apply()
  value(await post(`${applicationPath}/${pending.id}/approve`, reviewStaff, review))
  assert.equal(db.managers.length, 2)
  const created = value(await create({ providerApplicationId: pending.id }))
  assert.equal(created.merchantId, legacyManager.id)
  assert.equal(db.managers.length, 2)
  assert.deepEqual(db.managers[0], otherManager)
  assert.equal(db.managers[1].totalPerformance, 678)
  assert.equal(db.managers[1].totalCommission, 45)
})

test('历史审核时已开户的商户保持原账号和绑定，不可二次开户', async () => {
  const merchantId = 7311
  db.managers.push({ id: merchantId, userId: 'legacy-member', shopName: '历史店铺', status: 1 })
  db.providerApplications.push({ id: 'PA-legacy', userId: 'legacy-member', status: '已通过', merchantId, shopName: '历史店铺', loginUsername: 'legacy_merchant' })
  db.merchantAccounts.push({ id: `merchant-${merchantId}`, merchantId, userId: 'legacy-member', providerApplicationId: 'PA-legacy', username: 'legacy_merchant', shopName: '历史店铺', permissions: ['merchant.products'], status: 1, ...passwordRecord(credentials.password) })
  const refused = await create({ providerApplicationId: 'PA-legacy' })
  assert.ok(refused.status >= 400 && refused.status < 500, refused.message)
  const [application] = value(await request(applicationPath, { headers: reviewStaff }))
  assert.equal(application.merchantAccountId, `merchant-${merchantId}`)
  assert.equal(application.loginUsername, 'legacy_merchant')
  assert.equal(db.merchantAccounts.length, 1)
  const login = value(await post('/api/merchant/login', {}, { username: 'legacy_merchant', password: credentials.password }))
  assert.equal(login.merchant.merchantId, merchantId)
})
