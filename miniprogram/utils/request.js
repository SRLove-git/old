const { API_BASE } = require('./config.js')

// 当前登录会员：真实项目里由登录态（openid 换取的会话）决定，这里先用固定演示账号。
// 每个请求都会带上 x-user-id，服务端据此只返回本人的订单、报名人、地址等数据。
const CURRENT_USER_ID = 'u1'

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: API_BASE + '/api' + path,
      method: options.method || 'GET',
      data: options.data || {},
      header: {
        'Content-Type': 'application/json',
        'x-user-id': CURRENT_USER_ID,
        ...(options.header || {})
      },
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

module.exports = { api, CURRENT_USER_ID }
