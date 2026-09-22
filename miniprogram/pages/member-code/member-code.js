const store = require('../../utils/store.js')
const qrcode = require('../../utils/qrcode.js')

const LEVEL_NAMES = {
  1: '普通会员',
  2: '银卡会员',
  3: '金卡会员',
  4: '铂金会员',
  5: '钻石会员'
}

Page({
  data: {
    user: {},
    memberId: '',
    memberIdDisplay: '',
    memberLevel: 2,
    memberLevelName: '银卡会员',
    levelClass: 'level-2',
    memberSince: '',
    memberExpireAt: '',
    benefits: [
      { emoji: '💰', text: '会员价：活动更便宜，长期更省钱' },
      { emoji: '🎟️', text: '入会即送优惠券，下单可抵扣' },
      { emoji: '👩‍💼', text: '专属主理人一对一贴心服务' },
      { emoji: '⭐', text: '热门活动优先报名名额' },
      { emoji: '🎁', text: '积分可兑换好礼' }
    ]
  },

  async onLoad() {
    await store.ready()
    this.setData(this.buildCard(store.get().user))
  },

  onReady() {
    this.drawQr()
  },

  buildCard(user) {
    const seq = String(user.id || '').replace(/\D/g, '') || '1'
    const memberId = user.memberId || `8808${new Date().getFullYear()}${seq.padStart(4, '0')}`
    const level = Number(user.memberLevel || 2)
    const memberLevelName = user.memberLevelName || LEVEL_NAMES[level] || '会员'
    const memberIdDisplay = memberId.replace(/(.{4})/g, '$1 ').trim()
    return {
      user,
      phoneDisplay: store.formatPhoneDisplay(user.phone),
      memberId,
      memberIdDisplay,
      memberLevel: level,
      memberLevelName,
      levelClass: `level-${level}`,
      memberSince: user.memberSince || '2026年9月',
      memberExpireAt: user.memberExpireAt || '长期有效'
    }
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
        title: result.alreadyMember ? '您已是会员' : '入会成功，已发放2张券',
        icon: 'none'
      })
    } catch (e) {
      wx.showToast({ title: e.message || '入会失败，请稍后重试', icon: 'none' })
    }
  }
})
