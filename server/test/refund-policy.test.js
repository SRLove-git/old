import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateRefund, scheduleDaysUntil } from '../src/lib/refund-policy.js'

const now = new Date('2026-10-12T00:00:00').getTime()
const order = { status: '待签到', payAmount: 199.99, schedule: { full: '2026-10-15' } }

test('refund policy supports full, partial, and denied day-based refunds', () => {
  assert.equal(scheduleDaysUntil(order.schedule, now), 3)

  assert.deepEqual(
    calculateRefund(order, { refundRule: { type: 'day', fullDays: 3, partialDays: 1, partialRate: 0.5 } }, now),
    { can: true, ratio: 1, amount: 199.99, reason: '距开始3天，可全额退款' }
  )

  const partialNow = new Date('2026-10-14T00:00:00').getTime()
  assert.deepEqual(
    calculateRefund(order, { refundRule: { type: 'day', fullDays: 3, partialDays: 1, partialRate: 0.5 } }, partialNow),
    { can: true, ratio: 0.5, amount: 100, reason: '距开始不足3天，可退50%' }
  )

  const deniedNow = new Date('2026-10-15T12:00:00').getTime()
  assert.equal(
    calculateRefund(order, { refundRule: { type: 'day', fullDays: 3, partialDays: 1, partialRate: 0.5 } }, deniedNow).can,
    false
  )
})

test('ladder policy is evaluated from the longest lead time and blocks terminal states', () => {
  const activity = {
    refundRule: {
      type: 'ladder',
      ladder: [
        { days: 1, rate: 0 },
        { days: 7, rate: 0.8 },
        { days: 3, rate: 0.5 }
      ]
    }
  }
  const earlyOrder = { ...order, schedule: { full: '2026-10-20' } }
  assert.equal(calculateRefund(earlyOrder, activity, now).ratio, 0.8)
  assert.equal(calculateRefund({ ...order, status: '已核销' }, activity, now).reason, '当前状态不可退款')
  assert.equal(calculateRefund(order, null, now).reason, '活动不存在')
})
