import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'suiyueli-logistics-tracking-'))
process.env.DATA_FILE = path.join(directory, 'data.json')
const store = await import(`../src/store.js?logistics-tracking=${Date.now()}`)
test.after(() => fs.rmSync(directory, { recursive: true, force: true }))

function setup(orderType = 'order') {
  const database = store.init()
  database.orders = []
  database.pointOrders = []
  database.logisticsShipments = []
  const order = { id: 'tracking-test', status: orderType === 'point' ? '已发货' : '待收货', carrier: '极兔速递', trackingNo: 'JT000000000001', address: { name: '测试收件人' } }
  database[orderType === 'point' ? 'pointOrders' : 'orders'].push(order)
  store.registerLogisticsShipment(order, orderType)
  return order
}

function tracking(state, extra = {}) {
  return { LogisticCode: 'JT000000000001', ShipperCode: 'JTSD', State: state, Success: true, ...extra }
}

test('signed main state clears stale delivering extension and completes a merchandise order', () => {
  const order = setup()
  store.applyKdniaoTracking(tracking('2', { StateEx: '202' }))
  assert.equal(order.logisticsStatus, '派送中')
  const [signed] = store.applyKdniaoTracking(tracking('3', { Traces: [{ AcceptTime: '2026-10-30 10:00:00', AcceptStation: '本人签收' }] }), 'query')
  assert.equal(signed.providerState, '3')
  assert.equal(signed.providerStateEx, '')
  assert.equal(signed.status, '已签收')
  assert.equal(order.status, '待评价')
  assert.equal(order.logisticsStatus, '已签收')
  assert.equal(store.listActiveLogisticsShipments().length, 0)
})

test('matching extension is retained while conflicting incoming extension cannot override the main state', () => {
  setup()
  store.applyKdniaoTracking(tracking('2', { StateEx: '202' }))
  const [same] = store.applyKdniaoTracking(tracking('2'))
  assert.equal(same.status, '派送中')
  const [signed] = store.applyKdniaoTracking(tracking('3', { StateEx: '202' }))
  assert.equal(signed.status, '已签收')
  assert.equal(signed.providerStateEx, '')
})

test('repeated signed callback preserves events, signed time and later order completion', () => {
  const order = setup()
  const payload = tracking('3', { StateEx: '301', Traces: [{ AcceptTime: '2026-10-30 10:00:00', AcceptStation: '已签收' }] })
  const [first] = store.applyKdniaoTracking(payload)
  const [repeat] = store.applyKdniaoTracking(payload)
  assert.equal(repeat.signedAt, first.signedAt)
  assert.deepEqual(repeat.events, first.events)
  assert.equal(order.status, '待评价')
  order.status = '已完成'
  const [withoutTraces] = store.applyKdniaoTracking(tracking('3'))
  assert.deepEqual(withoutTraces.events, first.events)
  assert.equal(withoutTraces.signedAt, first.signedAt)
  assert.equal(order.status, '已完成')
})

test('signed main state completes point orders and survives persistence', () => {
  const order = setup('point')
  store.applyKdniaoTracking(tracking('2', { StateEx: '202' }))
  store.applyKdniaoTracking(tracking('3'))
  assert.equal(order.status, '已完成')
  const persisted = JSON.parse(fs.readFileSync(process.env.DATA_FILE, 'utf8'))
  assert.equal(persisted.pointOrders[0].status, '已完成')
  assert.equal(persisted.logisticsShipments[0].status, '已签收')
})
