const BASE = `${import.meta.env.BASE_URL}api`
const TOKEN = 'admin-token'

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': TOKEN,
      ...(options.headers || {})
    }
  })
  const json = await res.json()
  if (!res.ok || json.code !== 0) {
    throw new Error(json.message || '请求失败')
  }
  return json.data
}

export const api = {
  get: (p) => request(p),
  post: (p, body) => request(p, { method: 'POST', body: JSON.stringify(body || {}) }),
  put: (p, body) => request(p, { method: 'PUT', body: JSON.stringify(body || {}) }),
  del: (p) => request(p, { method: 'DELETE' })
}
