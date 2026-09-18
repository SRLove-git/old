const store = require('../../utils/store.js')

Page({
  data: {
    keyword: '',
    cat: 'all',
    categories: [],
    list: [],
    total: 0
  },

  async onLoad(options) {
    await store.ready()
    const cats = store.get().categories
    const categories = Object.keys(cats).map((id) => ({ id: Number(id), ...cats[id] }))
    this.setData({ cat: options && options.cat ? String(options.cat) : 'all', categories })
    this.refresh()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
    const pendingCat = wx.getStorageSync('pendingCat')
    if (pendingCat !== '') {
      this.setData({ cat: String(pendingCat) })
      wx.removeStorageSync('pendingCat')
    }
    this.refresh()
  },

  refresh() {
    const { keyword, cat } = this.data
    const all = store.getActivities()
    const list = all.filter((a) => {
      const okCat = cat === 'all' || String(a.category) === String(cat)
      const text = `${a.title}${a.city}${a.highlight}`
      const okKey = !keyword || text.includes(keyword)
      return okCat && okKey
    })
    this.setData({ list, total: list.length })
  },

  onInput(e) {
    this.setData({ keyword: e.detail.value }, () => this.refresh())
  },

  setCat(e) {
    this.setData({ cat: String(e.currentTarget.dataset.id) }, () => this.refresh())
  },

  clearFilter() {
    this.setData({ keyword: '', cat: 'all' }, () => this.refresh())
  },

  goDetail(e) {
    wx.navigateTo({ url: `/pages/detail/detail?id=${e.currentTarget.dataset.id}` })
  },

  goBooking(e) {
    wx.navigateTo({ url: `/pages/booking/booking?id=${e.currentTarget.dataset.id}` })
  }
})
