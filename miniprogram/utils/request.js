const { API_BASE, DEV_USER_ID } = require('./config.js')

// 按需登录门控升级后换用新缓存键，避免旧版静默登录 Token 绕过登录页面。
const AUTH_STORAGE_KEY = 'suiyueli_wechat_auth_v4'
const LOGIN_CONSENT_KEY = 'suiyueli_login_consent_v1'
let authState = DEV_USER_ID ? { token: 'local-dev', user: { id: String(DEV_USER_ID) }, expiresAt: Number.MAX_SAFE_INTEGER } : (wx.getStorageSync(AUTH_STORAGE_KEY) || null)
let loginPromise = null
let loginGatePromise = null

function hasLoginConsent() {
  return !!DEV_USER_ID || wx.getStorageSync(LOGIN_CONSENT_KEY) === true
}

function hasValidAuth() {
  const validUntil = Number(authState && authState.expiresAt)
  return !!(authState && authState.token && getCurrentUserId() && validUntil > Date.now() + 60000)
}

function isLoggedIn() {
  return hasLoginConsent() && hasValidAuth()
}

function getCurrentUserId() {
  return authState && authState.user ? String(authState.user.id || '') : ''
}

function saveAuth(value) {
  authState = value || null
  if (authState) wx.setStorageSync(AUTH_STORAGE_KEY, authState)
  else wx.removeStorageSync(AUTH_STORAGE_KEY)
}

function clearAuth(clearConsent = false) {
  saveAuth(null)
  if (clearConsent) wx.removeStorageSync(LOGIN_CONSENT_KEY)
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
        const result = res.data && res.data.data
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.code === 0 && result && result.token && result.user && result.user.id) {
          resolve(result)
        } else {
          reject(new Error((res.data && res.data.message) || `登录失败(${res.statusCode})`))
        }
      },
      fail: (error) => reject(new Error(error.errMsg || '登录服务不可用'))
    })
  })
}

function authenticate(force = false) {
  if (!force && hasValidAuth()) return Promise.resolve(authState)
  if (loginPromise) return loginPromise
  if (force) clearAuth()
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

function login() {
  return authenticate(false).then((auth) => {
    wx.setStorageSync(LOGIN_CONSENT_KEY, true)
    return auth
  })
}

function loginRequiredError(message = '请先登录后再使用') {
  const error = new Error(message)
  error.code = 'AUTH_REQUIRED'
  return error
}

function promptLogin() {
  if (loginGatePromise) return loginGatePromise
  loginGatePromise = new Promise((resolve, reject) => {
    const current = getCurrentPages()
    const route = current.length ? current[current.length - 1].route : ''
    if (route === 'pages/login/login') {
      reject(loginRequiredError())
      return
    }
    wx.navigateTo({
      url: '/pages/login/login?gate=1',
      events: {
        loginSuccess: (auth) => resolve(auth),
        loginCancel: () => reject(loginRequiredError('已取消登录'))
      },
      fail: () => reject(loginRequiredError('无法打开登录页面，请稍后重试'))
    })
  }).finally(() => { loginGatePromise = null })
  return loginGatePromise
}

function ensureLogin(force = false) {
  // 只有仍然有效的会员 Token 才算已登录；仅有历史同意标记时也必须展示登录页。
  if (!isLoggedIn()) {
    return promptLogin()
  }
  return authenticate(force)
}

function logout() {
  clearAuth(true)
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

function sendPublic(path, options = {}) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: API_BASE + '/api' + path,
      method: options.method || 'GET',
      data: options.data || {},
      header: { 'Content-Type': 'application/json', ...(options.header || {}) },
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

const publicApi = {
  get: (path) => sendPublic(path)
}

module.exports = { api, publicApi, ensureLogin, login, logout, isLoggedIn, hasLoginConsent, getCurrentUserId }
