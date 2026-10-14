import assert from 'node:assert/strict'
import test from 'node:test'
import { badRequest, forbidden, maskPhone, normalizePhone, nowText, round2 } from '../src/lib/domain-values.js'
import {
  DEFAULT_BALANCE_RECHARGE_AMOUNTS,
  normalizeBalanceRechargeAmounts,
  parseBalanceRechargeAmounts
} from '../src/lib/balance-config.js'

test('phone helpers normalize international prefixes and mask valid numbers', () => {
  assert.equal(normalizePhone('+86 138-0013-8000'), '13800138000')
  assert.equal(maskPhone('13800138000'), '138****8000')
  assert.equal(maskPhone(''), '未绑定')
})

test('money and time helpers return stable domain values', () => {
  assert.equal(round2(1.235), 1.24)
  assert.equal(round2('invalid'), 0)
  assert.equal(nowText(new Date(2026, 9, 12, 9, 5)), '2026-10-12 09:05')
})

test('HTTP domain errors retain their intended status', () => {
  assert.equal(badRequest('参数错误').status, 400)
  assert.equal(forbidden('无权操作').status, 403)
})

test('balance recharge amount configuration accepts safe unique values', () => {
  assert.deepEqual(parseBalanceRechargeAmounts(['20', 88.8, 500]), [20, 88.8, 500])
  assert.equal(parseBalanceRechargeAmounts([]), null)
  assert.equal(parseBalanceRechargeAmounts([50, 50]), null)
  assert.equal(parseBalanceRechargeAmounts([0, 100]), null)
  assert.equal(parseBalanceRechargeAmounts([100, 50000.001]), null)
  assert.deepEqual(normalizeBalanceRechargeAmounts(['invalid']), [...DEFAULT_BALANCE_RECHARGE_AMOUNTS])
})
