const store = require('../../utils/store.js')
const qrcode = require('../../utils/qrcode.js')

Page({
  data: {
    user: {},
    memberId: '',
    memberIdDisplay: '',
    memberLevel: 2,
    memberLevelName: '',
    levelClass: 'level-2',
    memberSince: '',
    memberExpireAt: '',
    brandName: '',
    copy: {},
    benefits: [],
    joinText: ''
  },

  async onLoad() {
    const version = this.memberVersion = (this.memberVersion || 0) + 1
    try {
      await store.ready()
      await Promise.all([store.refreshConfig().catch(() => {}), store.refreshUserProfile()])
      if (this.unloaded || version !== this.memberVersion) return
      this.pageLoaded = true
      this.applyBranding()
    } catch (error) {
      if (!this.unloaded && version === this.memberVersion) {
        this.pageLoaded = true
        wx.showToast({ title: error.message || '会员信息加载失败，请稍后重试', icon: 'none' })
      }
    }
  },

  async onShow() {
    if (!this.pageLoaded || this.joining) return
    const version = this.memberVersion = (this.memberVersion || 0) + 1
    try {
      await Promise.all([store.refreshConfig().catch(() => {}), store.refreshUserProfile()])
      if (this.unloaded || version !== this.memberVersion) return
      this.applyBranding()
    } catch (error) {
      if (!this.unloaded && version === this.memberVersion && error.code !== 'AUTH_REQUIRED') {
        wx.showToast({ title: error.message || '会员信息刷新失败，请稍后重试', icon: 'none' })
      }
    }
  },

  onUnload() {
    this.unloaded = true
    this.canvasReady = false
    this.memberVersion = (this.memberVersion || 0) + 1
    this.qrVersion = (this.qrVersion || 0) + 1
  },

  applyBranding() {
    const brand = store.getBrand()
    const copy = store.getCopy()
    const benefitIcons = [
      '/assets/member-benefits/member-price-ai-v1.png',
      '/assets/member-benefits/coupon-ai-v1.png',
      '/assets/member-benefits/personal-service-ai-v1.png',
      '/assets/member-benefits/priority-booking-ai-v1.png',
      '/assets/member-benefits/points-gift-ai-v1.png'
    ]
    const benefits = String(copy.memberBenefitLines || '').split('\n').map((line, index) => {
      const separator = line.indexOf('|')
      const text = separator >= 0 ? line.slice(separator + 1).trim() : line.trim()
      return {
        text,
        icon: benefitIcons[index] || '/assets/profile-icons/member-benefits-ai-v1.png'
      }
    }).filter((item) => item.text)
    this.setData({ ...this.buildCard(store.get().user), brandName: brand.chineseName, copy, benefits, joinText: this.formatCount(copy.memberJoinText, 2) }, () => this.drawQr())
  },

  onReady() {
    this.canvasReady = true
    this.drawQr()
  },

  buildCard(user = {}) {
    const seq = String(user.id || '').replace(/\D/g, '') || '1'
    const memberId = String(user.memberId || `8808${new Date().getFullYear()}${seq.padStart(4, '0')}`)
    const level = Number(user.memberLevel || 2)
    const memberLevelName = user.memberLevelName || user.memberType || '会员'
    const memberIdDisplay = memberId.replace(/(.{4})/g, '$1 ').trim()
    return {
      user,
      phoneDisplay: store.formatPhoneDisplay(user.phone),
      memberId,
      memberIdDisplay,
      memberLevel: level,
      memberLevelName,
      levelClass: `level-${level}`,
      memberSince: user.memberSince || `${new Date().getFullYear()}年${new Date().getMonth() + 1}月`,
      memberExpireAt: user.memberExpireAt || '长期有效'
    }
  },

  formatCount(text, count) {
    return String(text || '').replace(/\{count\}/g, String(count))
  },

  drawQr() {
    if (!this.canvasReady || this.unloaded || !this.data.memberId) return
    const version = this.qrVersion = (this.qrVersion || 0) + 1
    const memberId = this.data.memberId
    wx.createSelectorQuery()
      .in(this)
      .select('.qr-canvas')
      .boundingClientRect((rect) => {
        if (this.unloaded || version !== this.qrVersion || memberId !== this.data.memberId) return
        const size = (rect && rect.width) || 200
        const ctx = wx.createCanvasContext('memberQr', this)
        qrcode.draw(ctx, memberId, size)
        ctx.draw()
      })
      .exec()
  },

  async joinMember() {
    if (!this.pageLoaded) {
      wx.showToast({ title: '会员信息加载中，请稍后再试', icon: 'none' })
      return
    }
    if (this.joining) return
    this.joining = true
    const version = this.memberVersion = (this.memberVersion || 0) + 1
    try {
      const result = await store.joinMember()
      if (this.unloaded || version !== this.memberVersion) return
      this.setData(this.buildCard(result.user), () => this.drawQr())
      wx.showToast({
        title: result.alreadyMember ? '您已是会员' : this.formatCount(this.data.copy.memberJoinSuccessText, result.issuedCount || 0),
        icon: 'none'
      })
    } catch (e) {
      if (!this.unloaded) wx.showToast({ title: e.message || '入会失败，请稍后重试', icon: 'none' })
    } finally {
      this.joining = false
    }
  }
})
