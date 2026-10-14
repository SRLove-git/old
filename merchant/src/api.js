const TOKEN_KEY = 'suiyueli_merchant_token'
const BASE = '/api'
const REQUEST_TIMEOUT_MS = 15000

export const token = () => localStorage.getItem(TOKEN_KEY) || ''
export const setToken = (value) => value ? localStorage.setItem(TOKEN_KEY, value) : localStorage.removeItem(TOKEN_KEY)

async function request(path, options = {}) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(BASE + path, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}`, ...(options.headers || {}) }
    })
    const text = await response.text()
    let result = null
    try {
      result = text ? JSON.parse(text) : { code: response.ok ? 0 : response.status }
    } catch {
      throw new Error(`服务响应格式异常(${response.status})`)
    }
    if (!response.ok || result.code !== 0) {
      if (response.status === 401) setToken('')
      const error = new Error(result.message || `请求失败(${response.status})`)
      error.status = response.status
      error.code = result.code
      throw error
    }
    return result.data
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('请求超时，请检查网络后重试')
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body || {}) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body || {}) }),
  del: (path) => request(path, { method: 'DELETE' })
}
