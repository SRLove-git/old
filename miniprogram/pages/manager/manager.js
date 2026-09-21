const store = require('../../utils/store.js')
const qrcode = require('../../utils/qrcode.js')

Page({
  data: {
    tab: 'dashboard',
    denied: false,
    deniedTip: '',
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
    const own = store.getOwnManager()
    const isManager = store.get().isManager
    // 工作台只对主理人本人开放，非主理人看不到任何人的钱包与客户数据
    if (!isManager || !own || !own.id) {
      this.setData({ denied: true, deniedTip: '当前账号还不是主理人，无法进入工作台' })
      return
    }
    let dash = null
    try {
      dash = await store.loadManagerDashboard(own.id)
    } catch (e) {
      this.setData({ denied: true, deniedTip: e.message || '无法加载主理人工作台' })
      return
    }
    this.setData({ denied: false, deniedTip: '' })
    const recentOrders = (dash.commissions || []).slice(0, 3).map((c) => ({
      id: c.id,
      customerName: c.customerName,
      productName: c.productName,
      payAmount: store.money(c.payAmount),
      commissionAmount: store.money(c.commissionAmount)
    }))
    const customerList = (dash.customers || []).map((c) => ({ id: c.id, name: c.name, phone: c.phone }))
    const rawManager = { ...(dash.manager || {}), customers: customerList.length }
    // 展示金额统一保留两位小数；缺失字段（如提现中）按 0 兜底
    const manager = { ...rawManager }
    ;['monthPerformance', 'monthCommission', 'pending', 'available', 'withdrawing', 'total', 'debt', 'withdrawable'].forEach((k) => {
      manager[k] = store.money(rawManager[k] || 0)
    })
    const withdraws = (dash.withdraws || []).map((w) => ({
      ...w,
      amount: store.money(w.amount),
      tax: store.money(w.tax || 0),
      actualAmount: store.money(w.actualAmount || 0)
    }))
    this.setData({
      // 客户数按实际归属客户计算，不用主理人表里的静态值
      manager,
      commissions: dash.commissions || [],
      withdraws,
      customers: customerList,
      activities: dash.activities || [],
      config: dash.config || {},
      recentOrders
    })
  },

  setTab(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ tab: id })
    if (id === 'promote') this.drawPromoQr()
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
    if (this.data.denied || !this.data.manager.id) {
      wx.showToast({ title: '当前账号还不是主理人', icon: 'none' })
      return
    }
    const cfg = this.data.config || {}
    const monthlyLimit = Number(cfg.withdrawMonthlyLimit ?? 1)
    const monthKey = this.monthKey()
    const applied = (this.data.withdraws || []).filter(
      (w) => !['已拒绝', '已撤销'].includes(w.status) && String(w.applyTime || '').slice(0, 7) === monthKey
    ).length
    if (monthlyLimit > 0 && applied >= monthlyLimit) {
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
    try {
      // 服务端会再次校验金额、最低提现额与每月次数，以服务端结果为准
      const record = await store.applyWithdraw(this.data.manager.id, amount)
      this.setData({ withdrawOpen: false })
      await this.load()
      wx.showToast({ title: `已提交，锁定佣金${record.commissionCount || 0}笔`, icon: 'none' })
    } catch (e) {
      wx.showToast({ title: e.message || '提现申请失败', icon: 'none' })
    }
  },

  monthKey() {
    const d = new Date()
    const p = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}`
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

  promoText() {
    return `/pages/index/index?ref=${this.data.manager.id}`
  },

  drawPromoQr(onDone) {
    const ctx = wx.createCanvasContext('promoQr', this)
    qrcode.draw(ctx, this.promoText(), 240)
    ctx.draw(false, typeof onDone === 'function' ? onDone : undefined)
  },

  saveQr() {
    this.drawPromoQr(() => {
      wx.canvasToTempFilePath({
        canvasId: 'promoQr',
        x: 0,
        y: 0,
        width: 240,
        height: 240,
        destWidth: 480,
        destHeight: 480,
        success: (res) => {
          wx.saveImageToPhotosAlbum({
            filePath: res.tempFilePath,
            success: () => wx.showToast({ title: '推广码已保存到相册', icon: 'success' }),
            fail: (err) => {
              if (err && err.errMsg && err.errMsg.includes('auth')) {
                wx.showModal({
                  title: '需要相册权限',
                  content: '请允许保存图片到相册，才能保存推广码。',
                  confirmText: '去设置',
                  success: (r) => { if (r.confirm) wx.openSetting() }
                })
              } else {
                wx.showToast({ title: '保存失败，请稍后重试', icon: 'none' })
              }
            }
          })
        },
        fail: () => wx.showToast({ title: '生成图片失败，请稍后重试', icon: 'none' })
      }, this)
    })
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

  goApply() {
    wx.navigateTo({ url: '/pages/manager-apply/manager-apply' })
  },

  onShareAppMessage() {
    return {
      title: '和同龄人一起玩，岁悦里精选活动',
      path: `/pages/index/index?ref=${this.data.manager.id}`
    }
  }
})
