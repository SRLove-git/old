import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'suiyueli-customer-binding-'))
process.env.DATA_FILE = path.join(directory, 'data.json')
const store = await import(`../src/store.js?customer-binding=${Date.now()}`)

test.after(() => fs.rmSync(directory, { recursive: true, force: true }))

function setup() {
  const db = store.init()
  db.customers = [{ id: 'c1', name: '测试客户', member: true, managerId: null, isManager: false }]
  db.managers = [
    { id: 1001, name: '主理人甲', status: 1, inviteCode: 'CODEA' },
    { id: 1002, name: '主理人乙', status: 1, inviteCode: 'CODEB' },
    { id: 1003, name: '停用主理人', status: 2, inviteCode: 'CODEC' },
    { id: 1004, name: '清退主理人', status: 3, inviteCode: 'CODED' }
  ]
  db.bindings = []
  db.logs = []
  store.save()
  return db
}

function activeBindings(db, customerId = 'c1') {
  return db.bindings.filter((binding) => String(binding.customerId) === customerId && Number(binding.status) === 1)
}

test('首次通过分享链接建立首触归属', () => {
  const db = setup()
  const manager = store.bindCustomerByCodeOrId('c1', null, 1001, 2)
  assert.equal(manager.id, 1001)
  assert.equal(manager.commissionRate, undefined, '绑定响应不应下发主理人佣金等内部字段')
  assert.equal(manager.userId, undefined)
  assert.equal(String(db.customers[0].managerId), '1001')
  const active = activeBindings(db)
  assert.equal(active.length, 1)
  assert.equal(String(active[0].managerId), '1001')
  assert.equal(active[0].bindSource, 2)
  assert.ok(active[0].effectiveAt, '归属记录需要带生效时间，便于核对订单归属')
})

test('已绑定的客户打开其他主理人的链接不改变归属，也不新增记录', () => {
  const db = setup()
  store.bindCustomerByCodeOrId('c1', null, 1001, 2)
  const manager = store.bindCustomerByCodeOrId('c1', null, 1002, 1)
  assert.equal(manager.id, 1001)
  assert.equal(String(db.customers[0].managerId), '1001')
  assert.equal(db.bindings.length, 1)
  assert.equal(String(activeBindings(db)[0].managerId), '1001')
})

test('同一主理人重复分享进入保持单条有效归属', () => {
  const db = setup()
  store.bindCustomerByCodeOrId('c1', null, 1001, 2)
  store.bindCustomerByCodeOrId('c1', 'CODEA', null, 3)
  assert.equal(db.bindings.length, 1)
  assert.equal(activeBindings(db).length, 1)
})

test('主动输入其他主理人的邀请码会被拒绝且归属不变', () => {
  const db = setup()
  store.bindCustomerByCodeOrId('c1', null, 1001, 2)
  assert.throws(
    () => store.bindCustomerByCodeOrId('c1', 'CODEB', null, 3),
    /您已绑定主理人甲/
  )
  assert.equal(String(db.customers[0].managerId), '1001')
  assert.equal(activeBindings(db).length, 1)
})

test('邀请码大小写不敏感，停用的主理人不可绑定', () => {
  setup()
  assert.throws(
    () => store.bindCustomerByCodeOrId('c1', 'codec', null, 3),
    /不可绑定/
  )
  const manager = store.bindCustomerByCodeOrId('c1', 'codeb', null, 3)
  assert.equal(manager.id, 1002)
})

test('解绑后可以通过新的主理人链接重新建立归属', () => {
  const db = setup()
  store.bindCustomerByCodeOrId('c1', null, 1001, 2)
  store.unbindCustomerByUser('c1', '客户申请解绑')
  assert.equal(db.customers[0].managerId, null)
  assert.equal(activeBindings(db).length, 0)
  const manager = store.bindCustomerByCodeOrId('c1', null, 1002, 2)
  assert.equal(manager.id, 1002)
  assert.equal(String(db.customers[0].managerId), '1002')
})

test('原主理人已清退时结束旧归属并允许绑定新主理人', () => {
  const db = setup()
  store.bindCustomerByCodeOrId('c1', null, 1001, 2)
  db.managers.find((manager) => manager.id === 1001).status = 3
  const manager = store.bindCustomerByCodeOrId('c1', null, 1002, 2)
  assert.equal(manager.id, 1002)
  assert.equal(String(db.customers[0].managerId), '1002')
  const previous = db.bindings.find((binding) => String(binding.managerId) === '1001')
  assert.equal(previous.status, 2)
  assert.match(previous.unbindReason, /停用/)
})

test('无效链接或邀请码、缺失会员都返回明确错误', () => {
  setup()
  assert.throws(() => store.bindCustomerByCodeOrId('c1', null, 9999, 2), /无效/)
  assert.throws(() => store.bindCustomerByCodeOrId('c1', 'NOPE', null, 3), /无效/)
  assert.throws(() => store.bindCustomerByCodeOrId('missing', null, 1001, 2), /会员账号不存在/)
})
