const store = require('../../utils/store.js')

Page({
  data: {
    user: {},
    boundManager: null,
    isManager: false,
    application: null,
    bindLogs: [],
    cards: [],
    couponCount: 0,
    pendingUnbind: null,
    products: [],
    bindOpen: false,
    code: '',
    phoneDisplay: ''
  },

  async onShow() {
    this.pageVisible = true
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 })
    }
    try {
      await store.ready()
      await store.refreshUserProfile()
      if (!this.pageVisible) return
      this.loadState()
      this.startStatusPolling()
    } catch (e) {
      // 网络波动时保留上一次成功加载的资料，不阻塞个人中心使用。
      if (this.pageVisible) this.loadState()
    }
  },

  onHide() {
    this.pageVisible = false
    this.stopStatusPolling()
  },

  onUnload() {
    this.pageVisible = false
    this.stopStatusPolling()
  },

  startStatusPolling() {
    this.stopStatusPolling()
    if (!store.get().pendingUnbind) return
    this.statusTimer = setInterval(async () => {
      try {
        await store.refreshUserProfile()
        if (!this.pageVisible) return
        this.loadState()
        if (!store.get().pendingUnbind) this.stopStatusPolling()
      } catch (e) {
        // 静默等待下一次同步，避免临时断网反复打扰用户。
      }
    }, 5000)
  },

  stopStatusPolling() {
    if (this.statusTimer) clearInterval(this.statusTimer)
    this.statusTimer = null
  },

  loadState() {
    const state = store.get()
    const managers = state.managers || []
    const bindLogs = (state.bindLogs || []).map((log) => {
      const manager = managers.find((m) => String(m.id) === String(log.managerId))
      const unbound = Number(log.status) === 2 || !!log.unbindTime
      return {
        ...log,
        time: unbound ? (log.unbindTime || log.bindTime || '') : (log.bindTime || ''),
        action: unbound ? '解绑' : '绑定',
        managerName: (manager && manager.name) || '平台主理人',
        reason: log.unbindReason || ''
      }
    })
    this.setData({
      user: state.user,
      phoneDisplay: store.formatPhoneDisplay(state.user.phone),
      boundManager: state.boundManager,
      isManager: state.isManager,
      application: state.application,
      bindLogs,
      cards: state.cards || [],
      couponCount: state.coupons.length,
      pendingUnbind: state.pendingUnbind || null,
      products: (state.products || []).slice(0, 6)
    })
  },

  goDetail(e) {
    wx.navigateTo({ url: `/pages/detail/detail?id=${e.currentTarget.dataset.id}` })
  },

  go(e) {
    const url = e.currentTarget.dataset.url
    wx.navigateTo({ url })
  },

  goMemberCode() {
    wx.navigateTo({ url: '/pages/member-code/member-code' })
  },

  goAcademy() {
    wx.setStorageSync('academyTab', 'mine')
    wx.switchTab({ url: '/pages/lives/lives' })
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

  unbind() {
    const a = store.getAssistant()
    wx.showModal({
      title: '申请解绑主理人',
      content: `解绑需平台客服审核。您也可以直接联系客服电话 ${a.phone} 或小助理微信 ${a.wechat} 协助处理。`,
      confirmText: '继续申请',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return
        wx.showModal({
          title: '申请解绑',
          editable: true,
          placeholderText: '请填写解绑原因',
          content: '',
          confirmText: '提交申请',
          success: async (sub) => {
            if (!sub.confirm) return
            const reason = (sub.content || '').trim() || '客户主动申请解绑'
            try {
              const application = await store.unbindApply(reason)
              this.setData({ pendingUnbind: application })
              this.startStatusPolling()
              wx.showToast({ title: '申请已提交，等待客服审核', icon: 'none' })
            } catch (e) {
              wx.showToast({ title: e.message || '提交失败', icon: 'none' })
            }
          }
        })
      }
    })
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
