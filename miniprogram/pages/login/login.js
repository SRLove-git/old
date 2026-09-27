const store = require('../../utils/store.js')
const { login, isLoggedIn } = require('../../utils/request.js')

Page({
  data: {
    loading: false
  },

  onLoad() {
    if (isLoggedIn()) this.enterMiniProgram()
  },

  async handleLogin() {
    if (this.data.loading) return
    this.setData({ loading: true })
    try {
      await login()
      await store.refresh()
      wx.reLaunch({ url: '/pages/index/index' })
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
      await store.ready()
      wx.reLaunch({ url: '/pages/index/index' })
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
