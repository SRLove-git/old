const store = require('../../utils/store.js')

Page({
  data: {
    balanceText: '0.00',
    points: 0
  },

  async onShow() {
    await store.ready()
    const user = store.get().user || {}
    this.setData({
      balanceText: store.money(user.balance),
      points: Number(user.points || 0)
    })
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
