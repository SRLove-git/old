import { round2 } from './domain-values.js'

export const COMMISSION_STATUS = Object.freeze({
  PENDING: '待结算',
  AVAILABLE: '可结算',
  WITHDRAWING: '提现中',
  SETTLED: '已结算',
  CLAWED: '已扣回'
})

export function commissionAmountOf(record) {
  return round2(record && record.commissionAmount)
}

export function sumCommissions(rows) {
  return round2((rows || []).reduce((total, row) => total + commissionAmountOf(row), 0))
}
