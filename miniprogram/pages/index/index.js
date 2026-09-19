const store = require('../../utils/store.js')

Page({
  data: {
    largeMode: true,
    categories: [],
    groups: [],
    banners: [],
    coupons: [],
    boundManager: null,
    city: '北京',
    cities: ['全部', '北京', '大理', '敦煌'],
    cityOpen: false,
    viewMode: 'recommend'
  },

  async onLoad() {
    await store.ready()
    const cities = this.buildCities()
    this.setData({
      largeMode: store.get().largeMode,
      categories: this.buildCategories(),
      banners: store.get().banners,
      coupons: store.get().coupons,
      boundManager: store.get().boundManager,
      cities,
      city: cities.length > 1 ? cities[1] : (cities[0] || '全部')
    })
    this.buildGroups()
  },

  async onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
    await store.ready()
    this.setData({
      largeMode: store.get().largeMode,
      coupons: store.get().coupons,
      boundManager: store.get().boundManager
    })
    this.buildGroups()
    this.checkPendingBind()
  },

  buildCategories() {
    const cats = store.get().categories
    return Object.keys(cats).map((id) => ({ id: Number(id), ...cats[id] }))
  },

  buildCities() {
    const cities = ['全部']
    store.getActivities().forEach((a) => {
      if (a.city && a.city !== '线上' && a.city !== '全国' && !cities.includes(a.city)) {
        cities.push(a.city)
      }
    })
    return cities
  },

  buildGroups() {
    const city = this.data.city
    const viewMode = this.data.viewMode
    const cats = store.get().categories
    const groups = Object.keys(cats)
      .map((id) => {
        const catId = Number(id)
        const list = store.getActivities()
          .filter((a) => (city === '全部' || a.city === city || a.city === '全国' || a.city === '线上') && a.category === catId)
          .sort((a, b) => (viewMode === 'latest' ? Number(b.id) - Number(a.id) : (b.soldCount || 0) - (a.soldCount || 0)))
        return { id: catId, name: cats[id].name, emoji: cats[id].emoji, color: cats[id].color, activities: list }
      })
      .filter((g) => g.activities.length > 0)
    this.setData({ groups })
  },

  setMode(e) {
    this.setData({ viewMode: e.currentTarget.dataset.mode }, () => this.buildGroups())
  },

  openCity() {
    this.setData({ cityOpen: true })
  },

  closeCity() {
    this.setData({ cityOpen: false })
  },

  noop() {},

  selectCity(e) {
    this.setData({ city: e.currentTarget.dataset.city, cityOpen: false }, () => this.buildGroups())
  },

  checkPendingBind() {
    const managerId = store.getPendingBind()
    if (!managerId) return
    const manager = store.getManagers().find((m) => String(m.id) === String(managerId))
    if (!manager) {
      store.cancelPendingBind()
      return
    }
    if (store.get().boundManager) {
      store.cancelPendingBind()
      return
    }
    wx.showModal({
      title: '发现主理人推荐',
      content: `您将绑定 ${manager.name} 为专属服务主理人。绑定后，这位主理人可获得您后续消费的部分服务佣金。`,
      confirmText: '同意绑定',
      cancelText: '暂不绑定',
      confirmColor: '#c25e3d',
      success: (res) => {
        if (res.confirm) {
          store.confirmPendingBind().then((bound) => {
            this.setData({ boundManager: bound })
            wx.showToast({ title: `已绑定${manager.name}`, icon: 'none' })
          })
        } else {
          store.cancelPendingBind()
          wx.showToast({ title: '您仍可正常使用', icon: 'none' })
        }
      }
    })
  },

  goList() {
    wx.switchTab({ url: '/pages/list/list' })
  },

  goCategory(e) {
    const id = Number(e.currentTarget.dataset.id)
    wx.setStorageSync('pendingCat', id)
    wx.switchTab({ url: '/pages/list/list' })
  },

  goMore(e) {
    const id = Number(e.currentTarget.dataset.id)
    wx.setStorageSync('pendingCat', id)
    wx.switchTab({ url: '/pages/list/list' })
  },

  goBanner(e) {
    const cat = Number(e.currentTarget.dataset.cat)
    if (!cat) {
      wx.switchTab({ url: '/pages/profile/profile' })
      return
    }
    wx.setStorageSync('pendingCat', cat)
    wx.switchTab({ url: '/pages/list/list' })
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` })
  },

  goBooking(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/booking/booking?id=${id}` })
  },

  goProfile() {
    wx.switchTab({ url: '/pages/profile/profile' })
  },

  toggleLarge() {
    const largeMode = store.toggleLargeMode()
    this.setData({ largeMode })
    wx.showToast({ title: largeMode ? '已开启大字模式' : '已关闭大字模式', icon: 'none' })
  },

  showService() {
    wx.showModal({
      title: '需要帮忙吗？',
      content: '不会操作没关系，直接打电话，我们一步步教您。\n客服电话：400-800-6070\n\n或长按添加小助理微信：suiyueli6070',
      showCancel: false,
      confirmText: '我知道了'
    })
  }
})
