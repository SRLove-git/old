const store = require('./utils/store.js')
const { isLoggedIn } = require('./utils/request.js')

const LOGIN_PATH = 'pages/login/login'

App({
  onLaunch(options) {
    const query = (options && options.query) || {}
    if (query.ref) {
      store.setPendingBind(query.ref, 2)
    }
  },
  onShow(options) {
    if (isLoggedIn()) {
      store.init()
      return
    }

    const launchPath = String((options && options.path) || '').replace(/^\//, '')
    if (!launchPath || launchPath === LOGIN_PATH) return
    setTimeout(() => {
      if (!isLoggedIn()) wx.reLaunch({ url: `/${LOGIN_PATH}` })
    }, 0)
  }
})
