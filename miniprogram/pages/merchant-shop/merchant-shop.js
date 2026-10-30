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
    managerId: '',
    manager: null,
    allOfferings: [],
    list: [],
    filter: 'all',
    stats: {},
    categoryCounts: { all: 0, service: 0, product: 0 },
    cartCount: 0
  },

  async onLoad(options) {
    await store.ready()
    this.setData({ managerId: String(options.id || '') })
    await Promise.all([store.refreshHome().catch(() => {}), store.refreshManagers().catch(() => {})])
    this.applyShop()
  },

  applyShop() {
    const manager = store.getManagers().find((item) => String(item.id) === String(this.data.managerId))
    if (!manager) {
      wx.showToast({ title: '店铺不存在', icon: 'none' })
      return
    }
    const allOfferings = store.getOfferings(manager.id).map((item) => ({
      ...item,
      art: store.assetUrl(item.coverImage) || ART[item.category] || ART[4],
      offerType: item.category === 5 ? 'product' : 'service',
      typeLabel: item.category === 5 ? '商品' : '服务'
    }))
    const decoratedManager = {
      ...manager,
      initial: String(manager.name || '店').slice(0, 1),
      shopName: manager.shopName || `${manager.name}的服务小店`,
      shopIntro: manager.shopIntro || store.getCopy().defaultShopIntro || ''
    }
    this.setData({
      manager: decoratedManager,
      allOfferings,
      list: allOfferings,
      categoryCounts: {
        all: allOfferings.length,
        service: allOfferings.filter((item) => item.offerType === 'service').length,
        product: allOfferings.filter((item) => item.offerType === 'product').length
      },
      cartCount: this.getCartCount(),
      stats: {
        count: allOfferings.length,
        sales: allOfferings.reduce((sum, item) => sum + Number(item.soldCount || 0), 0),
        rating: '4.9'
      }
    })
    wx.setNavigationBarTitle({ title: decoratedManager.shopName })
  },

  async onShow() {
    try {
      await store.ready()
      await Promise.all([store.refreshHome(), store.refreshManagers()])
    } catch (e) {}
    if (this.data.managerId) this.applyShop()
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
      this.setData({ cartCount: this.getCartCount() })
      wx.showToast({ title: '已加入购物车', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: err.message || '加入失败', icon: 'none' })
    }
  },

  goCart() {
    wx.navigateTo({ url: '/pages/cart/cart' })
  },

  getCartCount() {
    return store.getCart().reduce((total, item) => total + Number(item.count || 1), 0)
  },

  callMerchant() {
    const phone = String(this.data.manager.phone || '').replace(/\*/g, '')
    if (/^1\d{10}$/.test(phone)) wx.makePhoneCall({ phoneNumber: phone })
    else wx.showToast({ title: '请通过平台客服联系商家', icon: 'none' })
  }
})
