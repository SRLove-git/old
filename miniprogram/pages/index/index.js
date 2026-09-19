const store = require('../../utils/store.js')

const CATEGORY_ENGLISH = {
  1: 'LOCAL EVENTS',
  2: 'STUDY TOURS & TRIPS',
  3: 'SUIYUELI ACADEMY',
  4: 'MEMBER BENEFITS',
  5: 'POINTS & CREATIVE'
}

function decorateActivity(activity) {
  if (!activity) return null
  const artByCategory = {
    1: '/assets/event-local.jpg',
    2: '/assets/event-travel.jpg',
    3: '/assets/event-academy.jpg',
    4: '/assets/event-benefit.jpg',
    5: '/assets/event-benefit.jpg'
  }
  const regionText = store.getActivityRegionNames(activity).join('、') || activity.city || '线上/全国'
  return { ...activity, city: regionText, regionText, art: artByCategory[activity.category] || artByCategory[1] }
}

Page({
  data: {
    categories: [],
    groups: [],
    featured: null,
    banners: [],
    coupons: [],
    boundManager: null,
    city: '全部',
    cities: ['全部'],
    cityOpen: false,
    viewMode: 'recommend',
    slogan: '',
    filing: {},
    newsPosts: [],
    videoPosts: []
  },

  async onLoad() {
    await store.ready()
    const cities = this.buildCities()
    this.setData({
      categories: this.buildCategories(),
      banners: store.get().banners,
      coupons: store.get().coupons,
      boundManager: store.get().boundManager,
      slogan: store.getBrand().slogan,
      filing: store.getFiling(),
      cities,
      city: cities.length > 1 ? cities[1] : (cities[0] || '全部')
    })
    this.buildGroups()
    this.buildContent()
  },

  async onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
    await store.ready()
    this.setData({
      coupons: store.get().coupons,
      boundManager: store.get().boundManager,
      slogan: store.getBrand().slogan,
      filing: store.getFiling()
    })
    this.buildGroups()
    this.buildContent()
    this.checkPendingBind()
  },

  buildCategories() {
    const cats = store.get().categories
    return Object.keys(cats).map((id) => ({ id: Number(id), ...cats[id] }))
  },

  buildCities() {
    return ['全部', ...store.getRegions().map((region) => region.name)]
  },

  buildGroups() {
    const city = this.data.city
    const viewMode = this.data.viewMode
    const cats = store.get().categories
    const allActivities = store.getActivities()
    const visibleActivities = allActivities.filter((a) => store.activityInRegion(a, city))
    const featured = decorateActivity(visibleActivities.slice().sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0))[0])
    const groups = Object.keys(cats)
      .map((id) => {
        const catId = Number(id)
        const list = allActivities
          .filter((a) => store.activityInRegion(a, city) && a.category === catId)
          .sort((a, b) => (viewMode === 'latest' ? Number(b.id) - Number(a.id) : (b.soldCount || 0) - (a.soldCount || 0)))
          .slice(0, 6)
          .map(decorateActivity)
        return { id: catId, name: cats[id].name, english: CATEGORY_ENGLISH[catId], activities: list }
      })
      .filter((g) => g.activities.length > 0)
    this.setData({ groups, featured })
  },

  buildContent() {
    const city = this.data.city
    const currentRegion = store.getRegions().find((region) => region.name === city)
    const visible = store.getContentPosts().filter((item) => {
      const ids = Array.isArray(item.regionIds) ? item.regionIds.map(String) : []
      return city === '全部' || ids.length === 0 || (currentRegion && ids.includes(String(currentRegion.id)))
    })
    this.setData({
      newsPosts: visible.filter((item) => item.type === 'news' && item.featured).slice(0, 3),
      videoPosts: visible.filter((item) => item.type === 'video' && item.featured).slice(0, 3)
    })
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
    this.setData({ city: e.currentTarget.dataset.city, cityOpen: false }, () => {
      this.buildGroups()
      this.buildContent()
    })
  },

  goContent(e) {
    wx.navigateTo({ url: `/pages/content-detail/content-detail?id=${e.currentTarget.dataset.id}` })
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
    if (id === 3) {
      wx.switchTab({ url: '/pages/lives/lives' })
      return
    }
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

  addCart(e) {
    const activity = store.getActivity(e.currentTarget.dataset.id)
    try {
      store.addActivityToCart(activity)
      wx.showToast({ title: '已加入购物车', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: err.message || '加入失败', icon: 'none' })
    }
  },

  goProfile() {
    wx.switchTab({ url: '/pages/profile/profile' })
  },

  showService() {
    const a = store.getAssistant()
    wx.showModal({
      title: '需要帮忙吗？',
      content: `不会操作没关系，直接打电话，我们一步步教您。\n客服电话：${a.phone}\n\n或长按添加小助理微信：${a.wechat}`,
      showCancel: false,
      confirmText: '我知道了'
    })
  }
})
