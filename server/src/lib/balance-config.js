export const DEFAULT_BALANCE_RECHARGE_AMOUNTS = Object.freeze([50, 100, 200, 500])

export function parseBalanceRechargeAmounts(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) return null
  const amounts = value.map(Number)
  if (amounts.some((amount) => !Number.isFinite(amount) || amount < 1 || amount > 50000)) return null
  const rounded = amounts.map((amount) => Number(amount.toFixed(2)))
  if (rounded.some((amount, index) => Math.abs(amount - amounts[index]) > Number.EPSILON)) return null
  if (new Set(rounded.map(String)).size !== rounded.length) return null
  return rounded
}

export function normalizeBalanceRechargeAmounts(value) {
  return parseBalanceRechargeAmounts(value) || [...DEFAULT_BALANCE_RECHARGE_AMOUNTS]
}
