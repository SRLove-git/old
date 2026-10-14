const store = require('../../utils/store.js')
const { login, isLoggedIn, hasLoginConsent } = require('../../utils/request.js')

Page({
  data: {
    loading: false,
    brandName: '',
    brandMark: '',
    brandEnglish: 'SUI YUE LI',
    slogan: '',
    copy: {}
  },

  async onLoad(options) {
    this.gateMode = options && options.gate === '1'
    this.loginCompleted = false
    try {
      await store.refreshConfig()
      const brand = store.getBrand()
      this.setData({ brandName: brand.chineseName, brandMark: String(brand.chineseName || '').slice(0, 1), brandEnglish: brand.englishName, slogan: brand.slogan, copy: store.getCopy() })
    } catch (e) {
      // 首屏断网时继续展示内置品牌信息，不阻塞登录。
    }
    if (this.gateMode) return
    // 已有有效 Token 直接进入；Token 过期的老用户静默重新换取，首次用户仍需主动点击登录。
    if (isLoggedIn() || hasLoginConsent()) this.enterMiniProgram()
  },

  async onShow() {
    if (!this.loginPageLoaded) {
      this.loginPageLoaded = true
      return
    }
    try {
      await store.refreshConfig()
      const brand = store.getBrand()
      this.setData({ brandName: brand.chineseName, brandMark: String(brand.chineseName || '').slice(0, 1), brandEnglish: brand.englishName, slogan: brand.slogan, copy: store.getCopy() })
    } catch (e) {}
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
