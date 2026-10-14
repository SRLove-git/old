import { httpError } from './http.js'

export function yuanToFen(value, field = '金额') {
  const text = String(value ?? '').trim()
  const match = text.match(/^(\d+)(?:\.(\d{1,2}))?$/)
  if (!match) throw httpError(400, `${field}最多保留两位小数`)
  const fen = BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0') || '0')
  if (fen > BigInt(Number.MAX_SAFE_INTEGER)) throw httpError(400, `${field}超出可支持范围`)
  return Number(fen)
}

export function fenToYuan(fen) {
  const value = Number(fen)
  if (!Number.isSafeInteger(value)) throw httpError(500, '金额数据异常')
  return Number((value / 100).toFixed(2))
}

export function multiplyFen(fen, ratio) {
  const amount = BigInt(Number(fen))
  const text = String(ratio ?? 1).trim()
  const match = text.match(/^(0|1)(?:\.(\d+))?$/)
  if (!match) throw httpError(400, '退款比例不正确')
  const decimals = match[2] || ''
  const denominator = 10n ** BigInt(decimals.length)
  const numerator = BigInt(match[1]) * denominator + BigInt(decimals || '0')
  return Number((amount * numerator + denominator / 2n) / denominator)
}
