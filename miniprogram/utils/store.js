// 兼容入口：业务逻辑已拆分到 store/ 与 services/，页面继续 require('./store.js') 无需改动。
module.exports = require('../store/index.js')
