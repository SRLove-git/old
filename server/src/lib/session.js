import crypto from 'node:crypto'
import { httpError } from './http.js'

const SESSION_SECRET = process.env.SESSION_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'suiyueli-local-session-secret')

export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60

export function encodeSession(payload) {
  if (!SESSION_SECRET) throw httpError(503, '服务端未配置 SESSION_SECRET')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url')
  return `${body}.${signature}`
}

export function decodeSession(token) {
  if (!token || !SESSION_SECRET) return null
  const [body, signature] = String(token).split('.')
  if (!body || !signature) return null
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url')
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (!payload.userId || !payload.exp || Number(payload.exp) <= Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

export function sessionFromRequest(req) {
  const authorization = String((req.headers && req.headers.authorization) || '')
  if (!authorization.startsWith('Bearer ')) return null
  return decodeSession(authorization.slice(7).trim())
}

export function passwordRecord(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const passwordHash = crypto.scryptSync(password, salt, 64).toString('hex')
  return { salt, passwordHash }
}

export function passwordMatches(password, account) {
  if (!account || !account.salt || !account.passwordHash) return false
  const actual = crypto.scryptSync(password, account.salt, 64)
  const expected = Buffer.from(account.passwordHash, 'hex')
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}
