const store = require('../../utils/store.js')
const regionPicker = require('../../utils/region-picker.js')

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
    1: '/assets/event-local.webp',
    2: '/assets/event-travel.webp',
    3: '/assets/event-academy.webp',
    4: '/assets/event-benefit.webp',
    5: '/assets/event-benefit.webp'
  }
  const isProduct = activity.offeringType === 'product'
  const regionText = store.getActivityRegionNames(activity).join('、') || activity.city || '线上/全国'
  const firstSchedule = (activity.schedules || [])[0] || {}
  return {
    ...activity,
    isProduct,
    expired: isProduct ? false : store.isActivityExpired(activity),
    city: regionText,
    regionText,
    displayDate: isProduct ? '品质好物' : (firstSchedule.date || '长期有效'),
    displayTime: isProduct ? (activity.stock > 0 ? `库存${activity.stock}件` : '现货销售') : (firstSchedule.time || ''),
    art: store.assetUrl(activity.coverImage) || artByCategory[activity.category] || artByCategory[1]
  }
}

function decorateBanner(banner) {
  return {
    ...banner,
    mediaType: banner.mediaType === 'video' ? 'video' : 'image',
    mediaUrl: store.assetUrl(banner.mediaUrl || banner.imageUrl),
    linkUrl: String(banner.linkUrl || '')
  }
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
    cityLabel: '全部',
    regionOptions: [],
    regionPickerColumns: [[], [], []],
    regionPickerIndexes: [0, 0, 0],
    cityOpen: false,
    serviceOpen: false,
    assistant: {},
    homeAssistant: {},
    viewMode: 'recommend',
    brandEnglish: '',
    slogan: '',
    copy: {},
    filing: {},
    newsPosts: [],
    videoPosts: []
  },

  async onLoad() {
    await store.ready()
    const regionOptions = store.getRegions()
    const defaultRegion = regionOptions[0] || null
    const picker = regionPicker.buildRegionPicker(regionOptions, defaultRegion)
    const brand = store.getBrand()
    if (brand.chineseName) wx.setNavigationBarTitle({ title: brand.chineseName })
    this.setData({
      categories: this.buildCategories(),
      banners: (store.get().banners || []).map(decorateBanner),
      coupons: store.get().coupons,
      boundManager: store.get().boundManager,
      brandEnglish: brand.englishName,
      slogan: brand.slogan,
      copy: store.getCopy(),
      filing: store.getFiling(),
      assistant: store.getAssistant(),
      homeAssistant: store.getHomeAssistant(),
      regionOptions,
      regionPickerColumns: picker.columns,
      regionPickerIndexes: picker.indexes,
      city: defaultRegion ? String(defaultRegion.id) : '全部',
      cityLabel: defaultRegion ? (defaultRegion.district || defaultRegion.name) : '全部'
    })
    this.buildGroups()
    this.buildContent()
  },

  async onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0, hidden: false })
    }
    await store.ready()
    try {
      await store.refreshHome()
    } catch (e) {}
    const regionOptions = store.getRegions()
    const currentRegion = regionOptions.find((region) => String(region.id) === String(this.data.city)) || null
    const picker = regionPicker.buildRegionPicker(regionOptions, currentRegion)
    const brand = store.getBrand()
    if (brand.chineseName) wx.setNavigationBarTitle({ title: brand.chineseName })
    this.setData({
      categories: this.buildCategories(),
      banners: (store.get().banners || []).map(decorateBanner),
      coupons: store.get().coupons,
      boundManager: store.get().boundManager,
      brandEnglish: brand.englishName,
      slogan: brand.slogan,
      copy: store.getCopy(),
      filing: store.getFiling(),
      assistant: store.getAssistant(),
      homeAssistant: store.getHomeAssistant(),
      regionOptions,
      regionPickerColumns: picker.columns,
      regionPickerIndexes: picker.indexes,
      city: this.data.city === '全部' || currentRegion ? this.data.city : '全部',
      cityLabel: this.data.city === '全部' ? '全部' : (currentRegion ? (currentRegion.district || currentRegion.name) : '全部')
    })
    this.buildGroups()
    this.buildContent()
    this.checkPendingBind()
  },

  onHide() {
    this.setTabBarVisible(true)
    if (this.data.cityOpen || this.data.serviceOpen) {
      this.setData({ cityOpen: false, serviceOpen: false })
    }
  },

  buildCategories() {
    const cats = store.get().categories
    const icons = {
      1: '/assets/profile-icons/appointment.webp',
      2: '/assets/profile-icons/trip.webp',
      3: '/assets/profile-icons/courses.webp',
      4: '/assets/profile-icons/coupon.webp',
      5: '/assets/profile-icons/points.webp'
    }
    return Object.keys(cats).map((id) => ({ id: Number(id), ...cats[id], icon: icons[id] || icons[1] }))
  },

  buildGroups() {
    const city = this.data.city
    const viewMode = this.data.viewMode
    const cats = store.get().categories
    const allActivities = store.getActivities()
      .filter((item) => Number(item.status ?? 1) === 1)
      .map((item) => ({ ...item, offeringType: 'activity' }))
    const allOfferings = store.getCatalogItems().filter((item) => Number(item.status ?? 1) === 1)
    const visibleActivities = allActivities.filter((a) => store.activityInRegion(a, city))
    const featured = decorateActivity(visibleActivities.filter((activity) => !store.isActivityExpired(activity)).sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0))[0])
    const groups = Object.keys(cats)
      .map((id) => {
        const catId = Number(id)
        const configuredLimit = Number(cats[id].homeDisplayLimit)
        const homeDisplayLimit = Number.isInteger(configuredLimit) && configuredLimit >= 0 && configuredLimit <= 50 ? configuredLimit : 6
        const list = allOfferings
          .filter((a) => store.activityInRegion(a, city) && a.category === catId)
          .sort((a, b) => Number(store.isActivityExpired(a)) - Number(store.isActivityExpired(b))
            || (viewMode === 'latest' ? Number(b.id) - Number(a.id) : (b.soldCount || 0) - (a.soldCount || 0)))
          .slice(0, homeDisplayLimit)
          .map(decorateActivity)
        return { id: catId, name: cats[id].name, english: CATEGORY_ENGLISH[catId], activities: list }
      })
      .filter((g) => g.activities.length > 0)
    this.setData({ groups, featured })
  },

  buildContent() {
    const city = this.data.city
    const currentRegion = store.getRegions().find((region) => String(region.id) === String(city))
    const visible = store.getContentPosts().filter((item) => {
      const ids = Array.isArray(item.regionIds) ? item.regionIds.map(String) : []
      return city === '全部' || ids.length === 0 || (currentRegion && ids.includes(String(currentRegion.id)))
    })
    const display = store.getHomeDisplay()
    this.setData({
      newsPosts: visible.filter((item) => item.type === 'news' && item.featured).slice(0, display.newsLimit),
      videoPosts: visible.filter((item) => item.type === 'video' && item.featured).slice(0, display.videoLimit)
    })
  },

  setMode(e) {
    this.setData({ viewMode: e.currentTarget.dataset.mode }, () => this.buildGroups())
  },

  openCity() {
    const selected = this.data.regionOptions.find((region) => String(region.id) === String(this.data.city))
    const picker = regionPicker.buildRegionPicker(this.data.regionOptions, selected)
    this.setData({ cityOpen: true, regionPickerColumns: picker.columns, regionPickerIndexes: picker.indexes })
    this.setTabBarVisible(false)
  },

  closeCity() {
    this.setData({ cityOpen: false })
    this.setTabBarVisible(true)
  },

  setTabBarVisible(visible) {
    if (typeof this.getTabBar !== 'function') return
    const tabBar = this.getTabBar()
    if (tabBar) tabBar.setData({ hidden: !visible })
  },

  noop() {},

  onRegionColumnChange(e) {
    const picker = regionPicker.changeRegionPicker(this.data.regionOptions, {
      columns: this.data.regionPickerColumns,
      indexes: this.data.regionPickerIndexes
    }, Number(e.detail.column), Number(e.detail.value))
    this.setData({ regionPickerColumns: picker.columns, regionPickerIndexes: picker.indexes })
  },

  onRegionChange(e) {
    const indexes = e.detail.value.map(Number)
    const region = regionPicker.selectedRegion({ columns: this.data.regionPickerColumns }, indexes)
    if (!region) {
      wx.showToast({ title: '后台暂未配置可选地区', icon: 'none' })
      return
    }
    this.setData({
      city: String(region.id),
      cityLabel: region.district || region.name,
      regionPickerIndexes: indexes,
      cityOpen: false
    }, () => {
      this.buildGroups()
      this.buildContent()
    })
    this.setTabBarVisible(true)
  },

  selectAllRegions() {
    this.setData({ city: '全部', cityLabel: '全部', cityOpen: false }, () => {
      this.buildGroups()
      this.buildContent()
    })
    this.setTabBarVisible(true)
  },

  goContent(e) {
    wx.navigateTo({ url: `/pages/content-detail/content-detail?id=${e.currentTarget.dataset.id}` })
  },

  goContentList(e) {
    const type = e.currentTarget.dataset.type === 'video' ? 'video' : 'news'
    wx.navigateTo({ url: `/pages/content-list/content-list?type=${type}` })
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
      confirmColor: '#b98555',
      success: async (res) => {
        if (res.confirm) {
          try {
            await store.requireLogin()
            const bound = await store.confirmPendingBind()
            this.setData({ boundManager: bound })
            wx.showToast({ title: `已绑定${manager.name}`, icon: 'none' })
          } catch (error) {
            if (!error || error.code !== 'AUTH_REQUIRED') {
              wx.showToast({ title: error.message || '绑定失败，请稍后重试', icon: 'none' })
            }
          }
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
    const linkUrl = String(e.currentTarget.dataset.link || '')
    if (linkUrl.startsWith('https://')) {
      wx.navigateTo({ url: `/pages/webview/webview?url=${encodeURIComponent(linkUrl)}` })
      return
    }
    if (linkUrl.startsWith('/pages/')) {
      const path = linkUrl.split('?')[0]
      const tabPages = ['/pages/index/index', '/pages/list/list', '/pages/lives/lives', '/pages/profile/profile']
      if (path === '/pages/list/list') {
        const category = linkUrl.match(/[?&](?:category|cat)=([^&]+)/)
        if (category) wx.setStorageSync('pendingCat', Number(decodeURIComponent(category[1])))
      }
      if (tabPages.includes(path)) wx.switchTab({ url: path })
      else wx.navigateTo({ url: linkUrl })
      return
    }
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

  async goBooking(e) {
    const id = e.currentTarget.dataset.id
    const activity = store.getActivity(id)
    if (store.isActivityExpired(activity)) {
      wx.showToast({ title: '活动已过期，无法报名', icon: 'none' })
      return
    }
    try {
      await store.requireLogin()
    } catch (error) {
      return
    }
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
    this.setData({
      serviceOpen: true,
      assistant: store.getAssistant()
    })
    this.setTabBarVisible(false)
  },

  closeService() {
    this.setData({ serviceOpen: false })
    this.setTabBarVisible(true)
  },

  copyServiceContact(e) {
    const field = e.currentTarget.dataset.field
    const value = String(this.data.assistant[field] || '').trim()
    if (!value) {
      wx.showToast({ title: '暂无联系方式', icon: 'none' })
      return
    }
    const label = field === 'phone' ? '客服电话' : '微信号'
    wx.setClipboardData({
      data: value,
      success: () => wx.showToast({ title: `${label}已复制`, icon: 'success' })
    })
  }
})
