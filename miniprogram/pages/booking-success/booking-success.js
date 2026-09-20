const store = require('../../utils/store.js')

Page({
  data: {
    order: null,
    deferred: false,
    timeText: ''
  },

  async onLoad(options) {
    await store.ready()
    const order = (store.get().orders || []).find((o) => String(o.id) === String(options.orderId)) || null
    const timeText = order && order.schedule && order.schedule.date
      ? `${order.schedule.date} ${order.schedule.weekday || ''} ${order.schedule.time || ''}`
      : (order && order.skuName) || ''
    this.setData({ order, deferred: options.deferred === '1', timeText })
  },

  goAppointments() {
    wx.redirectTo({ url: '/pages/appointments/appointments' })
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' })
  }
})
