import test from 'node:test'
import assert from 'node:assert/strict'
import { validateActivityScheduleDates } from '../src/lib/activity-schedules.js'

test('activity schedules allow today and future dates', () => {
  assert.doesNotThrow(() => validateActivityScheduleDates({
    sellType: 'date',
    schedules: [{ full: '2026-10-20' }, { full: '2026-10-21' }]
  }, '2026-10-20'))
})

test('activity schedules reject past and invalid dates', () => {
  assert.throws(
    () => validateActivityScheduleDates({ sellType: 'date', schedules: [{ full: '2026-10-19' }] }, '2026-10-20'),
    /只能选择今天或未来日期/
  )
  assert.throws(
    () => validateActivityScheduleDates({ sellType: 'date', schedules: [{ full: '' }] }, '2026-10-20'),
    /有效日期/
  )
})

test('sku activities do not require schedule dates', () => {
  assert.doesNotThrow(() => validateActivityScheduleDates({ sellType: 'sku', schedules: [{ full: '2020-01-01' }] }, '2026-10-20'))
})
