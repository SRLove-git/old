const store = require('../../utils/store.js')
const qrcode = require('../../utils/qrcode.js')

// 微信商家转账单据状态（用户确认收款模式），仅用于工作台展示。
const TRANSFER_STATE_TEXT = {
  REQUESTING: '发起转账中',
  UNKNOWN: '结果待确认',
  REQUEST_FAILED: '发起失败',
  ACCEPTED: '转账已受理',
  PROCESSING: '资金锁定中',
  WAIT_USER_CONFIRM: '待确认收款',
  TRANSFERING: '转账中',
  SUCCESS: '转账成功',
  FAIL: '转账失败',
  CANCELING: '撤销中',
  CANCELLED: '已撤销'
}

Page({
  data: {
    tab: 'dashboard',
    denied: false,
    deniedTip: '',
    manager: {},
    commissions: [],
    withdraws: [],
    pendingConfirms: 0,
    transfer: {},
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
    await store.refreshConfig().catch(() => {})
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
      actualAmount: store.money(w.actualAmount || 0),
      transferStateText: TRANSFER_STATE_TEXT[w.transferState] || '',
      canConfirm: w.status === '打款中' && !!w.transferPackage,
      failText: w.transferFailReasonText || w.transferError || ''
    }))
    this.setData({
      // 客户数按实际归属客户计算，不用主理人表里的静态值
      manager,
      commissions: dash.commissions || [],
      withdraws,
      pendingConfirms: withdraws.filter((w) => w.canConfirm).length,
      transfer: dash.transfer || {},
      customers: customerList,
      activities: dash.activities || [],
      config: dash.config || {},
      recentOrders
    })
  },

  setTab(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ tab: id }, () => {
      if (id === 'promote') this.drawPromoQr()
    })
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
      (w) => !['已拒绝', '已撤销', '打款失败'].includes(w.status) && String(w.applyTime || '').slice(0, 7) === monthKey
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

  async confirmTransfer(e) {
    const id = e.currentTarget.dataset.id
    const record = (this.data.withdraws || []).find((item) => String(item.id) === String(id))
    const transfer = this.data.transfer || {}
    if (!record || !record.transferPackage) {
      wx.showToast({ title: '暂无可确认的收款', icon: 'none' })
      return
    }
    if (!transfer.mchId) {
      wx.showToast({ title: '商家转账未配置，请联系平台', icon: 'none' })
      return
    }
    if (!wx.canIUse || !wx.canIUse('requestMerchantTransfer')) {
      wx.showModal({
        title: '微信版本过低',
        content: '当前微信版本不支持确认收款，请升级微信后重试',
        showCancel: false
      })
      return
    }
    // 收款确认页的 success 只代表页面拉起成功，到账结果以服务端查单/回调为准。
    const appId = (wx.getAccountInfoSync && wx.getAccountInfoSync().miniProgram.appId) || transfer.appId
    wx.requestMerchantTransfer({
      mchId: transfer.mchId,
      appId,
      package: record.transferPackage,
      success: async () => {
        wx.showLoading({ title: '确认中', mask: true })
        try {
          await store.syncWithdrawTransfer(id)
          await this.load()
          wx.hideLoading()
          wx.showToast({ title: '已确认，到账以微信通知为准', icon: 'none' })
        } catch (err) {
          wx.hideLoading()
          wx.showToast({ title: (err && err.message) || '结果查询失败', icon: 'none' })
        }
      },
      fail: (res) => {
        const message = String((res && res.errMsg) || '')
        wx.showToast({ title: message.indexOf('cancel') >= 0 ? '已取消收款' : '收款确认失败', icon: 'none' })
      }
    })
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
    wx.createSelectorQuery()
      .in(this)
      .select('.promo-qr')
      .boundingClientRect((rect) => {
        const size = (rect && Math.min(rect.width, rect.height)) || 100
        const ctx = wx.createCanvasContext('promoQr', this)
        qrcode.draw(ctx, this.promoText(), size)
        ctx.draw(false, typeof onDone === 'function' ? () => onDone(size) : undefined)
      })
      .exec()
  },

  saveQr() {
    this.drawPromoQr((size) => {
      wx.canvasToTempFilePath({
        canvasId: 'promoQr',
        x: 0,
        y: 0,
        width: size,
        height: size,
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
      title: store.getCopy().shareManagerTitle || '',
      path: `/pages/index/index?ref=${this.data.manager.id}`
    }
  }
})
