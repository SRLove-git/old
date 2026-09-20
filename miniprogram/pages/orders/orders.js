const store = require('../../utils/store.js')

Page({
  data: {
    filter: '全部',
    statuses: ['全部', '待付款', '待发货', '待收货', '待评价', '已完成', '退款中', '已退款', '已取消'],
    list: []
  },

  onLoad(options) {
    const map = { '待付款': '待付款', '待出行': '待收货', '待完成': '待评价', '待评价': '待评价', '退款售后': '退款售后' }
    const status = options.status ? decodeURIComponent(options.status) : ''
    if (map[status]) this.setData({ filter: map[status] })
  },

  async onShow() {
    await store.ready()
    this.refresh()
  },

  refresh() {
    const filter = this.data.filter
    const list = store.get().orders
      .filter((o) => filter === '全部' || (filter === '退款售后' ? ['退款中', '已退款'].includes(o.status) : o.status === filter))
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
  }
})
