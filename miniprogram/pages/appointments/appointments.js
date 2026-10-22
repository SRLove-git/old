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
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    await store.ready()
    await Promise.all([
      store.refreshHome().catch(() => {}),
      store.refreshOrders().catch(() => {})
    ])
    this.refresh()
  },

  refresh() {
    const filter = this.data.filter
    const list = store.get().orders
      .filter((o) => store.matchOrderFilter(o, filter))
      .map((o) => Object.assign({}, o, {
        statusClass: store.statusClass(o.status),
        displayStatus: store.displayStatus(o),
        coverImage: store.getOrderCoverImage(o),
        coverFallback: store.getOrderCoverFallback(o.category),
        timeText: o.schedule && o.schedule.date ? `${o.schedule.date} ${o.schedule.weekday || ''}` : (o.skuName || '无需预约')
      }))
    this.setData({ list })
  },

  onCoverError(e) {
    const index = Number(e.currentTarget.dataset.index)
    const item = this.data.list[index]
    if (!Number.isInteger(index) || !item || item.coverImage === item.coverFallback) return
    this.setData({ [`list[${index}].coverImage`]: item.coverFallback })
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
