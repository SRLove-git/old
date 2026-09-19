const store = require('../../utils/store.js')

const ART = {
  1: '/assets/event-local.jpg',
  2: '/assets/event-travel.jpg',
  3: '/assets/event-academy.jpg',
  4: '/assets/event-benefit.jpg',
  5: '/assets/event-benefit.jpg'
}

Page({
  data: {
    manager: null,
    allOfferings: [],
    list: [],
    filter: 'all',
    stats: {}
  },

  async onLoad(options) {
    await store.ready()
    const manager = store.getManagers().find((item) => String(item.id) === String(options.id))
    if (!manager) {
      wx.showToast({ title: '店铺不存在', icon: 'none' })
      return
    }
    const allOfferings = store.getOfferings(manager.id).map((item) => ({
      ...item,
      art: ART[item.category] || ART[4],
      offerType: item.category === 5 ? 'product' : 'service',
      typeLabel: item.category === 5 ? '商品' : '服务'
    }))
    const decoratedManager = {
      ...manager,
      initial: String(manager.name || '店').slice(0, 1),
      shopName: manager.shopName || `${manager.name}的服务小店`,
      shopIntro: manager.shopIntro || '用心挑选适合岁悦里会员的产品与服务。'
    }
    this.setData({
      manager: decoratedManager,
      allOfferings,
      list: allOfferings,
      stats: {
        count: allOfferings.length,
        sales: allOfferings.reduce((sum, item) => sum + Number(item.soldCount || 0), 0),
        rating: '4.9'
      }
    })
    wx.setNavigationBarTitle({ title: decoratedManager.shopName })
  },

  setFilter(e) {
    const filter = e.currentTarget.dataset.filter
    const list = filter === 'all' ? this.data.allOfferings : this.data.allOfferings.filter((item) => item.offerType === filter)
    this.setData({ filter, list })
  },

  goDetail(e) {
    wx.navigateTo({ url: `/pages/detail/detail?id=${e.currentTarget.dataset.id}` })
  },

  addCart(e) {
    const item = store.getActivity(e.currentTarget.dataset.id)
    try {
      store.addActivityToCart(item)
      wx.showToast({ title: '已加入购物车', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: err.message || '加入失败', icon: 'none' })
    }
  },

  goCart() {
    wx.navigateTo({ url: '/pages/cart/cart' })
  },

  callMerchant() {
    const phone = String(this.data.manager.phone || '').replace(/\*/g, '')
    if (/^1\d{10}$/.test(phone)) wx.makePhoneCall({ phoneNumber: phone })
    else wx.showToast({ title: '请通过平台客服联系商家', icon: 'none' })
  }
})
