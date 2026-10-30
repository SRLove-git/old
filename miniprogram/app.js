const store = require('./utils/store.js')
const { parseReferral } = require('./utils/referral.js')

App({
  onLaunch(options) {
    this.captureReferral(options)
  },
  onShow(options) {
    this.captureReferral(options)
    // 游客也可以预取首页公开数据；会员身份只在报名、提交等操作发生时请求。
    store.init()
  },
  captureReferral(options) {
    const referral = parseReferral((options && options.query) || {})
    if (!referral) {
      this.lastReferralEntry = ''
      return
    }
    const key = `${referral.source}:${referral.managerId}`
    // 冷启动的 onLaunch/onShow 是同一次进入；绑定仍由首页弹窗征得用户同意。
    if (this.lastReferralEntry === key) return
    this.lastReferralEntry = key
    if (String(store.getPendingBind() || '') !== referral.managerId) {
      store.setPendingBind(referral.managerId, referral.source)
    }
  }
})
