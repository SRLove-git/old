const store = require('../../utils/store.js')
const { login, isLoggedIn, hasLoginConsent } = require('../../utils/request.js')

Page({
  data: {
    loading: false
  },

  onLoad(options) {
    this.gateMode = options && options.gate === '1'
    this.loginCompleted = false
    if (this.gateMode) return
    // 已有有效 Token 直接进入；Token 过期的老用户静默重新换取，首次用户仍需主动点击登录。
    if (isLoggedIn() || hasLoginConsent()) this.enterMiniProgram()
  },

  onUnload() {
    if (!this.gateMode || this.loginCompleted) return
    const eventChannel = this.getOpenerEventChannel()
    if (eventChannel && eventChannel.emit) eventChannel.emit('loginCancel')
  },

  finishLogin(auth) {
    if (!this.gateMode) {
      wx.reLaunch({ url: '/pages/index/index' })
      return
    }
    this.loginCompleted = true
    const eventChannel = this.getOpenerEventChannel()
    if (eventChannel && eventChannel.emit) eventChannel.emit('loginSuccess', auth)
    wx.navigateBack({
      delta: 1,
      fail: () => wx.reLaunch({ url: '/pages/index/index' })
    })
  },

  async handleLogin() {
    if (this.data.loading) return
    this.setData({ loading: true })
    try {
      const auth = await login()
      await store.refresh()
      this.finishLogin(auth)
    } catch (error) {
      wx.showToast({
        title: error.message || '登录失败，请稍后重试',
        icon: 'none',
        duration: 2500
      })
      this.setData({ loading: false })
    }
  },

  async enterMiniProgram() {
    if (this.data.loading) return
    this.setData({ loading: true })
    try {
      const auth = await login()
      await store.refresh()
      this.finishLogin(auth)
    } catch (error) {
      this.setData({ loading: false })
      wx.showToast({
        title: error.message || '加载失败，请稍后重试',
        icon: 'none',
        duration: 2500
      })
    }
  }
})
