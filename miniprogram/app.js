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
    // 已登录用户首次从主理人链接进入时立即建立首触归属；未登录时保留来源，登录后再绑定。
    if (typeof store.syncReferralBinding === 'function') store.syncReferralBinding().catch(() => {})
  },
  captureReferral(options) {
    const referral = parseReferral((options && options.query) || {})
    if (!referral) {
      this.lastReferralEntry = ''
      return
    }
    const key = `${referral.source}:${referral.managerId}`
    // 冷启动的 onLaunch/onShow 是同一次进入；首触来源由 store 持久化并去重。
    if (this.lastReferralEntry === key) return
    this.lastReferralEntry = key
    if (String(store.getPendingBind() || '') !== referral.managerId) {
      store.setPendingBind(referral.managerId, referral.source)
    }
  }
})
