const store = require('./utils/store.js')

App({
  onLaunch(options) {
    const query = (options && options.query) || {}
    if (query.ref) {
      store.setPendingBind(query.ref, 2)
    }
  },
  onShow() {
    // 游客也可以预取首页公开数据；会员身份只在报名、提交等操作发生时请求。
    store.init()
  }
})
