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
    await store.ready()
    await store.refreshConfig().catch(() => {})
    this.pageLoaded = true
    this.applyBranding()
  },

  async onShow() {
    if (!this.pageLoaded) return
    try {
      await Promise.all([store.refreshConfig(), store.refreshUserProfile()])
      this.applyBranding()
    } catch (e) {}
  },

  applyBranding() {
    const brand = store.getBrand()
    const copy = store.getCopy()
    const benefitIcons = [
      '/assets/member-benefits/member-price-ai-v1.webp',
      '/assets/member-benefits/coupon-ai-v1.webp',
      '/assets/member-benefits/personal-service-ai-v1.webp',
      '/assets/member-benefits/priority-booking-ai-v1.webp',
      '/assets/member-benefits/points-gift-ai-v1.webp'
    ]
    const benefits = String(copy.memberBenefitLines || '').split('\n').map((line, index) => {
      const separator = line.indexOf('|')
      const text = separator >= 0 ? line.slice(separator + 1).trim() : line.trim()
      return {
        text,
        icon: benefitIcons[index] || '/assets/profile-icons/member-benefits-ai-v1.webp'
      }
    }).filter((item) => item.text)
    this.setData({ ...this.buildCard(store.get().user), brandName: brand.chineseName, copy, benefits, joinText: this.formatCount(copy.memberJoinText, 2) })
  },

  onReady() {
    this.drawQr()
  },

  buildCard(user) {
    const seq = String(user.id || '').replace(/\D/g, '') || '1'
    const memberId = user.memberId || `8808${new Date().getFullYear()}${seq.padStart(4, '0')}`
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
    wx.createSelectorQuery()
      .in(this)
      .select('.qr-canvas')
      .boundingClientRect((rect) => {
        const size = (rect && rect.width) || 200
        const ctx = wx.createCanvasContext('memberQr', this)
        qrcode.draw(ctx, this.data.memberId, size)
        ctx.draw()
      })
      .exec()
  },

  async joinMember() {
    try {
      const result = await store.joinMember()
      this.setData(this.buildCard(result.user))
      wx.showToast({
        title: result.alreadyMember ? '您已是会员' : this.formatCount(this.data.copy.memberJoinSuccessText, result.issuedCount || 0),
        icon: 'none'
      })
    } catch (e) {
      wx.showToast({ title: e.message || '入会失败，请稍后重试', icon: 'none' })
    }
  }
})
