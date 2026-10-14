import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'suiyueli-order-store-'))
process.env.DATA_FILE = path.join(directory, 'data.json')

const store = await import(`../src/store.js?order-lifecycle=${Date.now()}`)

test.after(() => {
  fs.rmSync(directory, { recursive: true, force: true })
})

test('order payment and refund keep inventory, attribution, and commission consistent', () => {
  const database = store.init()
  const schedule = {
    id: 'schedule-future',
    date: '2099-10-12',
    time: '09:00',
    full: '2099-10-12',
    totalQuota: 10,
    soldQuota: 0,
    remaining: 10
  }

  database.activities = [
    {
      id: 9001,
      title: '订单事务测试活动',
      category: 1,
      memberPrice: 100,
      price: 120,
      originalPrice: 120,
      status: 1,
      serviceMode: 'checkin',
      sellType: 'date',
      hasSku: false,
      schedules: [schedule],
      skus: [],
      refundRule: { type: 'always' }
    }
  ]
  database.products = []
  database.orders = []
  database.commissions = []
  database.withdraws = []
  database.userCoupons = []
  database.managers = [
    { id: 7001, userId: 'manager-user', name: '测试主理人', commissionRate: 10, status: 1 }
  ]
  database.customers = [
    {
      id: 'customer-1',
      name: '测试会员',
      managerId: 7001,
      wechatOpenId: 'openid-test'
    }
  ]
  database.bindings = [
    {
      id: 'binding-1',
      customerId: 'customer-1',
      managerId: 7001,
      status: 1,
      createdAt: '2026-10-12 09:00'
    }
  ]
  database.config.refundNeedAudit = true
  store.save()

  const order = store.createOrder({
    activityId: 9001,
    userId: 'customer-1',
    scheduleId: schedule.id,
    participants: '测试会员',
    count: 2
  })

  assert.equal(order.status, '待付款')
  assert.equal(order.actualPaidAmount, 200)
  assert.equal(schedule.soldQuota, 2)
  assert.equal(schedule.remaining, 8)

  const payment = store.prepareOrderPayment(order.id, 'customer-1')
  assert.equal(payment.openid, 'openid-test')
  assert.equal(payment.amountFen, 20000)

  const paid = store.confirmWechatPayment(order.id, {
    amount: { payer_total: 20000 },
    transaction_id: 'wechat-transaction-1',
    success_time: '2026-10-12T10:00:00+08:00'
  })

  assert.equal(paid.record.status, '待签到')
  assert.equal(paid.record.paymentStatus, 'SUCCESS')
  assert.equal(paid.record.managerId, 7001)
  assert.equal(paid.record.bindingId, 'binding-1')
  assert.equal(database.commissions.length, 1)
  assert.equal(database.commissions[0].commissionAmount, 20)
  assert.equal(database.commissions[0].status, store.COMMISSION_STATUS.PENDING)

  const requested = store.refundOrder(order.id, '行程变化')
  assert.equal(requested.pending, true)
  assert.equal(requested.order.status, '退款中')
  assert.equal(requested.order.refundAuditRequired, true)

  const prepared = store.prepareWechatRefund(order.id, '行程变化', requested.order.refundRatio)
  assert.equal(prepared.refundFen, 20000)
  store.markWechatRefundRequested(order.id, prepared, {
    refund_id: 'wechat-refund-1',
    status: 'PROCESSING'
  })

  const refunded = store.confirmWechatRefund({
    out_trade_no: order.id,
    out_refund_no: prepared.outRefundNo,
    refund_id: 'wechat-refund-1',
    success_time: '2026-10-12T11:00:00+08:00',
    amount: { refund: 20000 }
  })

  assert.equal(refunded.order.status, '已退款')
  assert.equal(refunded.order.paymentStatus, 'REFUNDED')
  assert.equal(schedule.soldQuota, 0)
  assert.equal(schedule.remaining, 10)
  assert.equal(database.commissions[0].status, store.COMMISSION_STATUS.CLAWED)
  assert.equal(database.commissions[0].clawbackAmount, 20)
  assert.equal(fs.existsSync(process.env.DATA_FILE), true)
})

test('payment callback rejects amount mismatches without marking the order paid', () => {
  const order = store.createOrder({
    activityId: 9001,
    userId: 'customer-1',
    scheduleId: 'schedule-future',
    participants: '测试会员',
    count: 1
  })

  assert.throws(
    () =>
      store.confirmWechatPayment(order.id, {
        amount: { payer_total: 1 },
        transaction_id: 'wechat-transaction-invalid'
      }),
    /支付金额与订单金额不一致/
  )
  assert.equal(order.status, '待付款')
  assert.equal(order.paymentStatus, 'NOTPAY')
})
