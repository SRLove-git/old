import * as store from '../store.js'
import { httpError } from '../lib/http.js'
import { decodeSession, sessionFromRequest } from '../lib/session.js'
import { permissionForRequest } from '../lib/permissions.js'

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || (process.env.NODE_ENV === 'production' ? '' : 'admin-token')

export function isAdminRequest(req) {
  const identity = adminSession(req)
  if (!identity) return false
  return hasAdminPermission(identity, permissionForRequest(req))
}

export function adminSession(req) {
  const token = String((req.headers && req.headers['x-admin-token']) || '')
  if (!token) return null
  if (ADMIN_TOKEN && token === ADMIN_TOKEN) {
    const account = (store.get().adminAccounts || []).find((item) => item.role === 'super_admin' && Number(item.status) === 1)
    return account ? { id: account.id, username: account.username, name: account.name, role: account.role, permissions: ['*'] } : null
  }
  const session = decodeSession(token)
  if (!session || session.role !== 'admin') return null
  const account = store.findAdminAccount(session.accountId || session.userId)
  if (!account || Number(account.status) !== 1) return null
  return {
    id: account.id,
    username: account.username,
    name: account.name,
    role: account.role,
    permissions: account.role === 'super_admin' ? ['*'] : (account.permissions || [])
  }
}

export function hasAdminPermission(identity, permission) {
  if (!permission) return true
  return Boolean(identity && (identity.role === 'super_admin' || identity.permissions?.includes('*') || identity.permissions?.includes(permission)))
}

export function adminAuth(req, res, next) {
  const identity = adminSession(req)
  if (!identity) return res.status(401).json({ code: 401, message: '登录已失效，请重新登录' })
  const permission = permissionForRequest(req)
  if (!hasAdminPermission(identity, permission)) return res.status(403).json({ code: 403, message: '当前账号没有此功能权限' })
  req.admin = identity
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    res.once('finish', () => {
      if (res.statusCode >= 400) return
      store.addLog('后台操作', `${req.method} ${String(req.originalUrl || '').split('?')[0]}`, identity)
      store.save()
    })
  }
  next()
}

export function requireAdminPermission(permission) {
  return (req, res, next) => {
    const identity = req.admin || adminSession(req)
    if (!identity) return res.status(401).json({ code: 401, message: '登录已失效，请重新登录' })
    if (!hasAdminPermission(identity, permission)) return res.status(403).json({ code: 403, message: '当前账号没有此功能权限' })
    req.admin = identity
    next()
  }
}

export function merchantSession(req) {
  const session = sessionFromRequest(req)
  return session && session.role === 'merchant' && session.merchantId ? session : null
}

export function merchantAuth(req, res, next) {
  const session = merchantSession(req)
  if (!session) return res.status(401).json({ code: 401, message: '请先登录商户账号' })
  const account = store.get().merchantAccounts.find((item) => String(item.id) === String(session.userId))
  if (!account || Number(account.status) !== 1) return res.status(401).json({ code: 401, message: '商户账号已停用' })
  const path = String(req.originalUrl || '')
  const permission = path.includes('/activities') ? 'merchant.activities'
    : path.includes('/products') ? 'merchant.products'
      : path.includes('/courses') ? 'merchant.courses' : null
  if (permission && !(account.permissions || []).includes(permission)) return res.status(403).json({ code: 403, message: '当前商户账号没有此发布权限' })
  next()
}

export function requireMerchantResource(req, collection, id) {
  const session = merchantSession(req)
  if (!session) throw httpError(401, '请先登录商户账号')
  const row = (store.get()[collection] || []).find((item) => String(item.id) === String(id))
  if (!row) throw httpError(404, '内容不存在')
  if (String(row.managerId) !== String(session.merchantId)) throw httpError(403, '无权管理其他商户的内容')
  return row
}

// 会员身份优先由签名会话解析；x-user-id 仅保留给非生产环境的历史联调。
export function requestUserId(req) {
  const session = sessionFromRequest(req)
  if (session) return String(session.userId)
  const legacyAllowed = process.env.NODE_ENV !== 'production'
  const raw = legacyAllowed && ((req.headers && req.headers['x-user-id'])
    || (req.query && req.query.userId)
    || (req.body && req.body.userId))
  return String(raw == null ? '' : raw).trim()
}

export function requireUser(req, targetUserId) {
  if (isAdminRequest(req)) return true
  const caller = requestUserId(req)
  if (!caller) throw httpError(401, '登录已失效，请重新登录')
  if (String(targetUserId == null ? '' : targetUserId) !== caller) throw httpError(403, '无权访问其他会员的数据')
  return true
}

export function requireOrderOwner(req, orderId) {
  if (isAdminRequest(req)) return
  const order = store.get().orders.find((item) => String(item.id) === String(orderId))
  if (!order) return
  requireUser(req, order.userId)
}

export function requireRowOwner(req, collection, id) {
  if (isAdminRequest(req)) return
  const row = (store.get()[collection] || []).find((item) => String(item.id) === String(id))
  if (!row) return
  requireUser(req, row.userId)
}
