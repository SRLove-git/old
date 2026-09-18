const store = require('./utils/store.js')

App({
  onLaunch(options) {
    store.init()
    const query = (options && options.query) || {}
    if (query.ref) {
      store.setPendingBind(query.ref, 2)
    }
  },
  onShow() {}
})
