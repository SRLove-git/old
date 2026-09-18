const store = require('../../utils/store.js')

Page({
  data: {
    coupons: []
  },

  async onShow() {
    await store.ready()
    this.setData({ coupons: store.get().coupons })
  },

  goList() {
    wx.switchTab({ url: '/pages/list/list' })
  }
})
