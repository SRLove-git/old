import assert from 'node:assert/strict'
import test from 'node:test'
import { COMMISSION_STATUS, commissionAmountOf, sumCommissions } from '../src/lib/commission-values.js'
import { pendingStatusForMode, serviceModeOfOffering } from '../src/lib/order-fulfillment.js'

test('offering fulfillment modes map to their pending order statuses', () => {
  assert.equal(serviceModeOfOffering({ serviceMode: 'online', category: 5 }), 'online')
  assert.equal(serviceModeOfOffering({ category: 5 }), 'delivery')
  assert.equal(serviceModeOfOffering({ city: '线上' }), 'online')
  assert.equal(serviceModeOfOffering({ category: 4 }), 'verify_code')
  assert.equal(serviceModeOfOffering({ category: 1 }), 'checkin')
  assert.equal(pendingStatusForMode('delivery'), '待发货')
  assert.equal(pendingStatusForMode('online'), '待使用')
  assert.equal(pendingStatusForMode('verify_code'), '待核销')
  assert.equal(pendingStatusForMode('checkin'), '待签到')
})

test('commission helpers normalize monetary values and expose stable statuses', () => {
  assert.equal(COMMISSION_STATUS.CLAWED, '已扣回')
  assert.equal(commissionAmountOf({ commissionAmount: '1.235' }), 1.24)
  assert.equal(sumCommissions([{ commissionAmount: 1.235 }, { commissionAmount: 2 }]), 3.24)
})
