const store = require('../../utils/store.js')

Page({
  data: {
    balanceText: '0.00',
    points: 0,
    serviceOpen: false
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
    this.setData({ serviceOpen: true })
  },

  closeService() {
    this.setData({ serviceOpen: false })
  }
})
