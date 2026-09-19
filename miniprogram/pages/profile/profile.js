const store = require('../../utils/store.js')

Page({
  data: {
    user: {},
    largeMode: true,
    boundManager: null,
    isManager: false,
    application: null,
    bindLogs: [],
    cards: [],
    couponCount: 0,
    bindOpen: false,
    code: ''
  },

  async onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 })
    }
    await store.ready()
    this.loadState()
  },

  loadState() {
    const state = store.get()
    this.setData({
      user: state.user,
      largeMode: state.largeMode,
      boundManager: state.boundManager,
      isManager: state.isManager,
      application: state.application,
      bindLogs: state.bindLogs || [],
      cards: state.cards || [],
      couponCount: state.coupons.length
    })
  },

  toggleLarge() {
    const largeMode = store.toggleLargeMode()
    this.setData({ largeMode })
    wx.showToast({ title: largeMode ? '已开启大字模式' : '已关闭大字模式', icon: 'none' })
  },

  go(e) {
    const url = e.currentTarget.dataset.url
    if (url === '/pages/appointments/appointments') {
      wx.switchTab({ url })
    } else {
      wx.navigateTo({ url })
    }
  },

  openBind() {
    this.setData({ bindOpen: true, code: '' })
  },

  closeBind() {
    this.setData({ bindOpen: false })
  },

  noop() {},

  onCode(e) {
    this.setData({ code: e.detail.value })
  },

  async bindByCode() {
    const manager = await store.bindByCode(this.data.code)
    this.setData({ boundManager: manager, bindOpen: false })
    wx.showToast({ title: `已绑定${manager.name}`, icon: 'none' })
  },

  async unbind() {
    await store.unbindManager()
    this.setData({ boundManager: null })
    wx.showToast({ title: '已解除主理人绑定', icon: 'none' })
  },

  goManagerApply() {
    wx.navigateTo({ url: '/pages/manager-apply/manager-apply' })
  },

  enterManager() {
    wx.navigateTo({ url: '/pages/manager/manager' })
  },

  showService() {
    const a = store.getAssistant()
    wx.showModal({
      title: '需要帮忙吗？',
      content: `客服电话：${a.phone}\n小助理微信：${a.wechat}`,
      showCancel: false
    })
  }
})
