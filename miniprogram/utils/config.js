// 后端服务地址。
// - 已部署：https://api.syljoy.com/old-api（服务器 8.138.153.108，nginx 反代到本地后端 3001）
// - 本地联调（开发者工具模拟器）：改回 http://127.0.0.1:3000 即可
const API_BASE = 'http://127.0.0.1:3000'

// 本地联调账号：使用后台已存在的会员数据，留空则恢复真实微信登录。
// 该配置只应配合本地 API 使用，发布前必须改为 ''。
const DEV_USER_ID = 'u1'

module.exports = { API_BASE, DEV_USER_ID }
