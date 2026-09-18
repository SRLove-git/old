const store = require('../../utils/store.js')

const DEMO_MANAGER_ID = 1001

Page({
  data: {
    tab: 'dashboard',
    manager: {},
    commissions: [],
    withdraws: [],
    customers: [],
    recentOrders: [],
    withdrawOpen: false,
    withdrawAmount: '',
    nav: [
      { id: 'dashboard', name: '看板', emoji: '📊' },
      { id: 'customers', name: '客户', emoji: '👥' },
      { id: 'commission', name: '佣金', emoji: '💰' },
      { id: 'promote', name: '推广', emoji: '📣' }
    ]
  },

  async onLoad() {
    await this.load()
  },

  async onShow() {
    await this.load()
  },

  async load() {
    await store.ready()
    const dash = await store.loadManagerDashboard(DEMO_MANAGER_ID)
    const recentOrders = (dash.commissions || []).slice(0, 3).map((c) => ({
      id: c.id,
      customerName: c.customerName,
      productName: c.productName,
      payAmount: c.payAmount,
      commissionAmount: c.commissionAmount
    }))
    this.setData({
      manager: dash.manager || {},
      commissions: dash.commissions || [],
      withdraws: dash.withdraws || [],
      customers: (dash.customers || []).map((c) => ({ id: c.id, name: c.name, phone: c.phone })),
      recentOrders
    })
  },

  setTab(e) {
    this.setData({ tab: e.currentTarget.dataset.id })
  },

  openWithdraw() {
    this.setData({ withdrawOpen: true, withdrawAmount: '' })
  },

  closeWithdraw() {
    this.setData({ withdrawOpen: false })
  },

  noop() {},

  onAmount(e) {
    this.setData({ withdrawAmount: e.detail.value })
  },

  async applyWithdraw() {
    if (this.data.withdraws.length > 0) {
      wx.showToast({ title: '本月已申请过提现', icon: 'none' })
      return
    }
    const amount = Number(this.data.withdrawAmount)
    if (!amount || amount < 100) {
      wx.showToast({ title: '最低提现金额为100元', icon: 'none' })
      return
    }
    await store.applyWithdraw(DEMO_MANAGER_ID, amount)
    this.setData({ withdrawOpen: false })
    await this.load()
    wx.showToast({ title: '提现申请已提交', icon: 'none' })
  },

  copyCode() {
    wx.setClipboardData({
      data: this.data.manager.inviteCode || '',
      success: () => wx.showToast({ title: '邀请码已复制', icon: 'none' })
    })
  },

  copyLink() {
    wx.setClipboardData({
      data: `/pages/index/index?ref=${this.data.manager.id}`,
      success: () => wx.showToast({ title: '推广链接已复制', icon: 'none' })
    })
  },

  saveQr() {
    wx.showToast({ title: '推广码已保存到相册', icon: 'none' })
  },

  shareCard() {
    wx.showShareMenu({
      withShareTicket: true,
      success: () => wx.showToast({ title: '请点击右上角分享', icon: 'none' })
    })
  },

  exit() {
    wx.switchTab({ url: '/pages/profile/profile' })
  },

  onShareAppMessage() {
    return {
      title: '和同龄人一起玩，岁悦里俱乐部精选活动',
      path: `/pages/index/index?ref=${this.data.manager.id}`
    }
  }
})
