const { API_BASE, DEV_USER_ID } = require('./config.js')

// 登录身份发生过后台合并时升级缓存键，确保新版重新换取服务端会话。
const AUTH_STORAGE_KEY = 'suiyueli_wechat_auth_v2'
let authState = DEV_USER_ID ? { token: 'local-dev', user: { id: String(DEV_USER_ID) }, expiresAt: Number.MAX_SAFE_INTEGER } : (wx.getStorageSync(AUTH_STORAGE_KEY) || null)
let loginPromise = null

function getCurrentUserId() {
  return authState && authState.user ? String(authState.user.id || '') : ''
}

function saveAuth(value) {
  authState = value || null
  if (authState) wx.setStorageSync(AUTH_STORAGE_KEY, authState)
  else wx.removeStorageSync(AUTH_STORAGE_KEY)
}

function loginCode() {
  return new Promise((resolve, reject) => {
    wx.login({
      timeout: 10000,
      success: (result) => result.code ? resolve(result.code) : reject(new Error('微信未返回登录凭证')),
      fail: (error) => reject(new Error(error.errMsg || '微信登录失败'))
    })
  })
}

function exchangeCode(code) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: API_BASE + '/api/auth/wechat',
      method: 'POST',
      data: { code },
      header: { 'Content-Type': 'application/json' },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.code === 0) resolve(res.data.data)
        else reject(new Error((res.data && res.data.message) || `登录失败(${res.statusCode})`))
      },
      fail: (error) => reject(new Error(error.errMsg || '登录服务不可用'))
    })
  })
}

function ensureLogin(force = false) {
  const validUntil = Number(authState && authState.expiresAt)
  const valid = authState && authState.token && getCurrentUserId() && validUntil > Date.now() + 60000
  if (!force && valid) return Promise.resolve(authState)
  if (loginPromise) return loginPromise
  if (force) saveAuth(null)
  loginPromise = loginCode()
    .then(exchangeCode)
    .then((result) => {
      const expiresIn = Number(result.expiresIn || 0)
      const next = { token: result.token, user: result.user, expiresIn, expiresAt: Date.now() + expiresIn * 1000 }
      saveAuth(next)
      return next
    })
    .finally(() => { loginPromise = null })
  return loginPromise
}

function send(path, options, auth) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: API_BASE + '/api' + path,
      method: options.method || 'GET',
      data: options.data || {},
      header: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.token}`,
        ...(DEV_USER_ID ? { 'x-user-id': String(DEV_USER_ID) } : {}),
        ...(options.header || {})
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.code === 0) {
          resolve(res.data.data)
        } else {
          const error = new Error((res.data && res.data.message) || `请求失败(${res.statusCode})`)
          error.statusCode = res.statusCode
          reject(error)
        }
      },
      fail: (error) => reject(new Error(error.errMsg || '网络错误'))
    })
  })
}

async function request(path, options = {}, retried = false) {
  const auth = await ensureLogin()
  try {
    return await send(path, options, auth)
  } catch (error) {
    if (!retried && error.statusCode === 401) {
      const refreshed = await ensureLogin(true)
      return send(path, options, refreshed)
    }
    throw error
  }
}

const api = {
  get: (path) => request(path),
  post: (path, data) => request(path, { method: 'POST', data }),
  put: (path, data) => request(path, { method: 'PUT', data }),
  del: (path) => request(path, { method: 'DELETE' })
}

module.exports = { api, ensureLogin, getCurrentUserId }
