const store = require('../../utils/store.js')

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
        const n = 21
        const quiet = 4
        const cell = size / (n + quiet * 2)
        ctx.setFillStyle('#ffffff')
        ctx.fillRect(0, 0, size, size)
        ctx.setFillStyle('#141821')
        const matrix = this.qrMatrix(this.data.memberId)
        matrix.forEach((row, r) => {
          row.forEach((v, c) => {
            if (v) ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell + 0.5, cell + 0.5)
          })
        })
        ctx.draw()
      })
      .exec()
  },

  qrMatrix(seed) {
    const n = 21
    const m = Array.from({ length: n }, () => Array(n).fill(0))
    let h = 2166136261
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i)
      h = (h * 16777619) >>> 0
    }
    const rnd = () => {
      h ^= h << 13
      h ^= h >>> 17
      h ^= h << 5
      h >>>= 0
      return h / 4294967295
    }
    const finder = (r, c) => {
      for (let i = 0; i < 7; i++) {
        for (let j = 0; j < 7; j++) {
          const border = i === 0 || i === 6 || j === 0 || j === 6
          const core = i >= 2 && i <= 4 && j >= 2 && j <= 4
          m[r + i][c + j] = border || core ? 1 : 0
        }
      }
    }
    finder(0, 0)
    finder(0, n - 7)
    finder(n - 7, 0)
    for (let i = 8; i < n - 8; i++) {
      m[6][i] = i % 2 === 0 ? 1 : 0
      m[i][6] = i % 2 === 0 ? 1 : 0
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const inFinder = (i < 8 && j < 8) || (i < 8 && j >= n - 8) || (i >= n - 8 && j < 8)
        if (inFinder || i === 6 || j === 6) continue
        m[i][j] = rnd() > 0.5 ? 1 : 0
      }
    }
    return m
  },

  joinMember() {
    wx.showToast({ title: '免费入会，请联系客服开通', icon: 'none' })
  }
})
