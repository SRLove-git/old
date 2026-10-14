export function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

export function round2(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Number(number.toFixed(2))
}

function httpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

export function badRequest(message) {
  return httpError(400, message)
}

export function forbidden(message) {
  return httpError(403, message)
}

export function nowText(date = new Date()) {
  const pad = (number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// 手机号统一成 11 位数字：容忍空格、短横线、+86 前缀等写法。
export function normalizePhone(value) {
  let digits = String(value == null ? '' : value).replace(/\D/g, '')
  if (digits.length === 13 && digits.startsWith('86')) digits = digits.slice(2)
  return digits
}

export function maskPhone(value) {
  const phone = normalizePhone(value)
  if (phone.length !== 11) return phone || '未绑定'
  return `${phone.slice(0, 3)}****${phone.slice(7)}`
}
