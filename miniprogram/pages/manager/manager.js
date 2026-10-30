const store = require('../../utils/store.js')
const { normalizeManagerId } = require('../../utils/referral.js')

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
    canApply: false,
    manager: {},
    commissions: [],
    withdraws: [],
    pendingConfirms: 0,
    transfer: {},
    customers: [],
    recentOrders: [],
    promotions: [],
    promotionCodePath: '',
    promotionCodeLoading: false,
    promotionCodeSaving: false,
    promotionCodeError: '',
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
    this.hidden = false
    await this.load()
    if (this.data.tab === 'promote' && !this.hidden && !this.unloaded && !this.data.denied) await this.loadPromotionCode()
  },

  onHide() {
    this.hidden = true
    this.clearPromotionCode()
  },

  onUnload() {
    this.unloaded = true
    this.dashboardVersion = (this.dashboardVersion || 0) + 1
    this.clearPromotionCode()
  },

  load() {
    if (this.dashboardPromise) return this.dashboardPromise
    const pending = this.loadDashboard().finally(() => {
      if (this.dashboardPromise === pending) this.dashboardPromise = null
    })
    this.dashboardPromise = pending
    return pending
  },

  async loadDashboard() {
    const version = this.dashboardVersion = (this.dashboardVersion || 0) + 1
    this.verifiedPromotionIdentity = ''
    this.clearPromotionCode()
    try {
      await store.ready()
      await Promise.all([store.refreshConfig().catch(() => {}), store.refreshUserProfile()])
    } catch (error) {
      if (!this.unloaded && version === this.dashboardVersion) {
        this.setData({ denied: true, deniedTip: error.message || '工作台加载失败，请稍后重试', canApply: false })
      }
      return
    }
    if (this.unloaded || version !== this.dashboardVersion) return
    const userId = store.getCurrentUserId()
    const own = store.getOwnManager()
    const isManager = store.get().isManager
    // 工作台只对主理人本人开放，非主理人看不到任何人的钱包与客户数据
    if (!isManager || !own || !own.id) {
      // 没有本人主理人记录：给出申请入口
      this.setData({ denied: true, deniedTip: '当前账号还不是主理人，无法进入工作台', canApply: true })
      return
    }
    let dash = null
    try {
      dash = await store.loadManagerDashboard(own.id)
    } catch (e) {
      if (this.unloaded || version !== this.dashboardVersion || userId !== store.getCurrentUserId()) return
      // 已有主理人记录但加载失败（停用、网络等）：不再引导重复申请
      this.setData({ denied: true, deniedTip: e.message || '无法加载主理人工作台', canApply: false })
      return
    }
    if (this.unloaded || version !== this.dashboardVersion || userId !== store.getCurrentUserId()) return
    this.setData({ denied: false, deniedTip: '', canApply: false })
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
    // 可推广内容：服务端返回活动 + 商品 + 课程（旧接口只返回活动时降级兼容）
    const promotionSource = (dash.promotions && dash.promotions.length) ? dash.promotions : (dash.activities || [])
    const promotions = promotionSource.map((item) => ({
      ...item,
      typeLabel: item.type === 'product' ? '商品' : (item.type === 'live' ? '课程' : '活动')
    }))
    this.setData({
      // 客户数按实际归属客户计算，不用主理人表里的静态值
      manager,
      commissions: dash.commissions || [],
      withdraws,
      pendingConfirms: withdraws.filter((w) => w.canConfirm).length,
      transfer: dash.transfer || {},
      customers: customerList,
      promotions,
      config: dash.config || {},
      recentOrders
    })
    this.verifiedPromotionIdentity = this.promotionIdentity()
    if (this.data.tab === 'promote' && !this.hidden) this.loadPromotionCode()
  },

  setTab(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ tab: id }, () => {
      if (id === 'promote') this.loadPromotionCode()
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
    if (!this.verifiedPromotionIdentity || this.promotionIdentity() !== this.verifiedPromotionIdentity) {
      wx.showToast({ title: '请等待主理人身份验证完成', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: `/pages/index/index?ref=${this.data.manager.id}`,
      success: () => wx.showToast({ title: '小程序推广路径已复制', icon: 'none' })
    })
  },

  promotionIdentity() {
    const managerId = normalizeManagerId(this.data.manager.id)
    const own = store.getOwnManager()
    const userId = store.getCurrentUserId()
    if (this.data.denied || !store.get().isManager || !managerId || !userId || !own ||
      String(own.id) !== managerId || Number(own.status ?? 1) !== 1) return ''
    return `${userId}:${managerId}`
  },

  removePromotionFile(filePath) {
    if (!filePath || !wx.env || !wx.getFileSystemManager ||
      !filePath.startsWith(`${wx.env.USER_DATA_PATH}/manager-promotion-`)) return
    try {
      wx.getFileSystemManager().unlink({ filePath, success: () => {}, fail: () => {} })
    } catch (error) {}
  },

  clearPromotionCode() {
    this.promotionVersion = (this.promotionVersion || 0) + 1
    this.promotionSaveVersion = (this.promotionSaveVersion || 0) + 1
    this.promotionRequest = null
    this.promotionOwner = ''
    this.removePromotionFile(this.data.promotionCodePath)
    if (!this.unloaded) this.setData({ promotionCodePath: '', promotionCodeLoading: false, promotionCodeSaving: false, promotionCodeError: '' })
  },

  loadPromotionCode() {
    const identity = this.promotionIdentity()
    if (this.unloaded || this.hidden) return Promise.resolve('')
    if (!identity || identity !== this.verifiedPromotionIdentity) {
      this.clearPromotionCode()
      this.setData({ promotionCodeError: '请先刷新主理人身份后重试' })
      return Promise.resolve('')
    }
    if (this.promotionOwner === identity) {
      if (this.promotionRequest) return this.promotionRequest
      if (this.data.promotionCodePath) return Promise.resolve(this.data.promotionCodePath)
    }
    this.clearPromotionCode()
    const version = this.promotionVersion
    const isCurrent = () => !this.unloaded && !this.hidden && version === this.promotionVersion &&
      identity === this.verifiedPromotionIdentity && identity === this.promotionIdentity()
    this.promotionOwner = identity
    this.setData({ promotionCodeLoading: true, promotionCodeError: '' })
    let filePath = ''
    const request = (async () => {
      try {
        const result = await store.loadManagerPromotionCode(this.data.manager.id)
        if (!isCurrent()) return ''
        const extension = { 'image/png': 'png', 'image/jpeg': 'jpg' }[result && result.mimeType]
        const base64 = result && result.imageBase64
        if (!extension || typeof base64 !== 'string' || !base64 || base64.length > 3000000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
          throw new Error('推广码图片无效，请重试')
        }
        if (!wx.getFileSystemManager || !wx.env || !wx.env.USER_DATA_PATH) throw new Error('当前微信版本无法保存推广码，请升级微信')
        filePath = `${wx.env.USER_DATA_PATH}/manager-promotion-${this.data.manager.id}-${Date.now()}-${version}-${Math.random().toString(36).slice(2, 8)}.${extension}`
        await new Promise((resolve, reject) => wx.getFileSystemManager().writeFile({ filePath, data: base64, encoding: 'base64', success: resolve, fail: reject }))
        if (!isCurrent()) {
          this.removePromotionFile(filePath)
          return ''
        }
        this.setData({ promotionCodePath: filePath })
        return filePath
      } catch (error) {
        this.removePromotionFile(filePath)
        if (isCurrent()) this.setData({ promotionCodeError: error.message || error.errMsg || '推广码加载失败，请稍后重试' })
        return ''
      } finally {
        if (isCurrent()) {
          this.promotionRequest = null
          this.setData({ promotionCodeLoading: false })
        } else if (version === this.promotionVersion && !this.unloaded && !this.hidden) {
          this.clearPromotionCode()
          this.setData({ promotionCodeError: '登录身份已变化，请重新加载' })
        }
      }
    })()
    this.promotionRequest = request
    return request
  },

  retryPromotionCode() {
    if (this.data.promotionCodeLoading) return
    this.clearPromotionCode()
    if (!this.verifiedPromotionIdentity || this.verifiedPromotionIdentity !== this.promotionIdentity()) return this.load()
    return this.loadPromotionCode()
  },

  onPromotionImageError(e) {
    if (e.currentTarget.dataset.path !== this.data.promotionCodePath) return
    this.clearPromotionCode()
    this.setData({ promotionCodeError: '推广码图片显示失败，请重试' })
  },

  async saveQr() {
    if (this.savingPromotion) return
    this.savingPromotion = true
    let isCurrent = () => false
    try {
      const filePath = await this.loadPromotionCode()
      if (!filePath || this.unloaded || this.hidden) return
      const identity = this.promotionIdentity()
      const version = this.promotionSaveVersion = (this.promotionSaveVersion || 0) + 1
      isCurrent = () => !this.unloaded && !this.hidden && version === this.promotionSaveVersion && identity === this.promotionIdentity()
      this.setData({ promotionCodeSaving: true })
      await new Promise((resolve, reject) => wx.saveImageToPhotosAlbum({ filePath, success: resolve, fail: reject }))
      if (isCurrent()) wx.showToast({ title: '推广码已保存到相册', icon: 'success' })
    } catch (error) {
      if (!isCurrent()) return
      if (String(error.errMsg || '').includes('auth')) {
        wx.showModal({
          title: '需要相册权限', content: '请允许保存图片到相册，才能保存推广码。', confirmText: '去设置',
          success: (result) => { if (result.confirm) wx.openSetting() }
        })
      } else wx.showToast({ title: '保存失败，请稍后重试', icon: 'none' })
    } finally {
      this.savingPromotion = false
      if (isCurrent()) this.setData({ promotionCodeSaving: false })
    }
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
    const verified = this.verifiedPromotionIdentity && this.verifiedPromotionIdentity === this.promotionIdentity()
    return {
      title: store.getCopy().shareManagerTitle || '',
      path: verified ? `/pages/index/index?ref=${this.data.manager.id}` : '/pages/index/index'
    }
  }
})
