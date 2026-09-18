const { API_BASE } = require('./config.js')

function request(path, options = {}) {
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
          reject(new Error((res.data && res.data.message) || `请求失败(${res.statusCode})`))
        }
      },
      fail: (err) => reject(new Error(err.errMsg || '网络错误'))
    })
  })
}

const api = {
  get: (path) => request(path),
  post: (path, data) => request(path, { method: 'POST', data }),
  put: (path, data) => request(path, { method: 'PUT', data }),
  del: (path) => request(path, { method: 'DELETE' })
}

module.exports = { api }
