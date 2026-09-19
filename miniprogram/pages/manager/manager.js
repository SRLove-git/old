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
    activities: [],
    config: {},
    withdrawOpen: false,
    withdrawAmount: '',
    withdrawTax: 0,
    withdrawActual: 0,
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
      activities: dash.activities || [],
      config: dash.config || {},
      recentOrders
    })
  },

  setTab(e) {
    this.setData({ tab: e.currentTarget.dataset.id })
  },

  openWithdraw() {
    this.setData({ withdrawOpen: true, withdrawAmount: '', withdrawTax: 0, withdrawActual: 0 })
  },

  closeWithdraw() {
    this.setData({ withdrawOpen: false })
  },

  noop() {},

  onAmount(e) {
    const amount = Number(e.detail.value || 0)
    const taxRate = Number(this.data.config.withdrawTaxRate ?? 20)
    const tax = Number((amount * taxRate / 100).toFixed(2))
    const actual = Number((amount - tax).toFixed(2))
    this.setData({ withdrawAmount: e.detail.value, withdrawTax: tax, withdrawActual: actual })
  },

  async applyWithdraw() {
    const cfg = this.data.config || {}
    const monthlyLimit = Number(cfg.withdrawMonthlyLimit ?? 1)
    const applied = (this.data.withdraws || []).filter((w) => w.status !== '已拒绝').length
    if (applied >= monthlyLimit) {
      wx.showToast({ title: `每月最多提现${monthlyLimit}次`, icon: 'none' })
      return
    }
    const amount = Number(this.data.withdrawAmount)
    const min = Number(cfg.minWithdraw ?? 100)
    if (!amount || amount < min) {
      wx.showToast({ title: `最低提现金额为${min}元`, icon: 'none' })
      return
    }
    const available = Number(this.data.manager.available || 0)
    if (amount > available) {
      wx.showToast({ title: '超出可结算余额', icon: 'none' })
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
      title: '和同龄人一起玩，岁悦里精选活动',
      path: `/pages/index/index?ref=${this.data.manager.id}`
    }
  }
})
