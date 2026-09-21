const store = require('../../utils/store.js')

Page({
  data: {
    filter: '全部',
    statuses: store.orderFilterLabels(),
    list: []
  },

  onLoad(options) {
    const status = options.status ? decodeURIComponent(options.status) : ''
    const filter = store.resolveOrderFilter(status)
    if (filter) this.setData({ filter })
  },

  async onShow() {
    await store.ready()
    this.refresh()
  },

  refresh() {
    const filter = this.data.filter
    const list = store.get().orders
      .filter((o) => store.matchOrderFilter(o, filter))
      .map((o) => Object.assign({}, o, {
        statusClass: store.statusClass(o.status),
        displayStatus: store.displayStatus(o),
        timeText: o.schedule && o.schedule.date ? `${o.schedule.date} ${o.schedule.weekday || ''}` : (o.skuName || '无需预约')
      }))
    this.setData({ list })
  },

  setFilter(e) {
    this.setData({ filter: e.currentTarget.dataset.status }, () => this.refresh())
  },

  goOrder(e) {
    wx.navigateTo({ url: `/pages/order-detail/order-detail?id=${e.currentTarget.dataset.id}` })
  },

  goList() {
    wx.switchTab({ url: '/pages/list/list' })
  }
})
