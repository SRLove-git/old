import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'suiyueli-balance-store-'))
process.env.DATA_FILE = path.join(directory, 'data.json')
const store = await import(`../src/store.js?balance=${Date.now()}`)

test.after(() => fs.rmSync(directory, { recursive: true, force: true }))

function setup() {
  const database = store.init()
  database.activities = [
    {
      id: 8101,
      title: '余额支付测试活动',
      category: 1,
      memberPrice: 100,
      price: 100,
      status: 1,
      serviceMode: 'checkin',
      sellType: 'date',
      hasSku: false,
      schedules: [
        { id: 'future', full: '2099-10-12', totalQuota: 10, soldQuota: 0, remaining: 10 }
      ],
      skus: [],
      refundRule: { type: 'always' }
    }
  ]
  database.products = []
  database.orders = []
  database.commissions = []
  database.balanceRecharges = []
  database.balanceTransactions = []
  database.customers = [
    { id: 'balance-user', name: '余额会员', balance: 150, wechatOpenId: 'openid-balance', managerId: null }
  ]
  database.config.refundNeedAudit = true
  store.save()
  return database
}

test('balance-only orders reserve funds once and return them on refund', () => {
  const database = setup()
  const order = store.createOrder({
    activityId: 8101,
    userId: 'balance-user',
    scheduleId: 'future',
    participants: '余额会员',
    count: 1,
    useBalance: true
  })

  assert.equal(order.balancePaidAmount, 100)
  assert.equal(order.wechatPayAmount, 0)
  assert.equal(database.customers[0].balance, 50)
  assert.equal(store.prepareOrderPayment(order.id, 'balance-user').balanceOnly, true)

  store.confirmBalanceOnlyPayment(order.id, 'balance-user')
  assert.equal(order.paymentStatus, 'SUCCESS')
  assert.equal(order.payChannel, '余额支付')

  store.refundOrder(order.id, '测试退款')
  store.confirmBalanceRefund(order.id, '测试退款', 1)
  assert.equal(order.status, '已退款')
  assert.equal(database.customers[0].balance, 150)
  assert.equal(order.balanceRefundAmount, 100)

  const expiringOrder = store.createOrder({
    activityId: 8101,
    userId: 'balance-user',
    scheduleId: 'future',
    participants: '余额会员',
    count: 1,
    useBalance: true
  })
  expiringOrder.payDeadline = Date.now() - 1
  store.autoCancelExpired()
  assert.equal(expiringOrder.status, '已取消')
  assert.equal(database.customers[0].balance, 150)
})

test('recharge callbacks are idempotent and mixed payments charge only the remainder', () => {
  const database = setup()
  const recharge = store.createBalanceRecharge('balance-user', 50)
  assert.equal(store.prepareBalanceRechargePayment(recharge.id, 'balance-user').amountFen, 5000)

  const notice = {
    amount: { payer_total: 5000 },
    transaction_id: 'recharge-transaction',
    success_time: '2026-10-12T12:00:00+08:00'
  }
  store.confirmWechatPayment(recharge.id, notice)
  store.confirmWechatPayment(recharge.id, notice)
  assert.equal(database.customers[0].balance, 200)
  assert.equal(store.listBalanceTransactions('balance-user').filter((item) => item.rechargeId === recharge.id).length, 1)

  database.customers[0].balance = 40
  const order = store.createOrder({
    activityId: 8101,
    userId: 'balance-user',
    scheduleId: 'future',
    participants: '余额会员',
    count: 1,
    useBalance: true
  })
  assert.equal(order.balancePaidAmount, 40)
  assert.equal(order.wechatPayAmount, 60)
  assert.equal(store.prepareOrderPayment(order.id, 'balance-user').amountFen, 6000)
  store.confirmWechatPayment(order.id, { amount: { payer_total: 6000 }, transaction_id: 'mixed-payment' })
  assert.equal(order.payChannel, '余额+微信支付')
})

test('refund intent is persisted before API submission and reused idempotently', () => {
  const database = setup()
  database.customers[0].balance = 0
  const order = store.createOrder({
    activityId: 8101,
    userId: 'balance-user',
    scheduleId: 'future',
    participants: '余额会员',
    count: 1,
    useBalance: false
  })
  store.confirmWechatPayment(order.id, { amount: { payer_total: 10000 }, transaction_id: 'refund-payment' })
  const first = store.prepareWechatRefund(order, '测试退款', 0.5)
  const second = store.prepareWechatRefund(order, '不应覆盖', 1)
  assert.equal(first.outRefundNo, second.outRefundNo)
  assert.equal(second.refundFen, 5000)
  assert.equal(order.refundRequestStatus, 'CREATED')
  assert.equal(order.refundRequest.outRefundNo, first.outRefundNo)
})
