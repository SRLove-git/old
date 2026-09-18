const store = require('../../utils/store.js')

Page({
  data: {
    id: null,
    activity: null,
    category: {},
    tab: 'detail',
    reviews: [],
    recommend: [],
    rankLabel: '',
    skuOpen: false,
    selectedSkuId: '',
    selectedSku: null
  },

  async onLoad(options) {
    await store.ready()
    const id = options.id
    this.setData({ id })
    this.loadActivity(id)
  },

  async onShow() {
    await store.ready()
    if (this.data.id) this.loadActivity(this.data.id)
  },

  loadActivity(id) {
    const activity = store.getActivity(id)
    if (!activity) {
      wx.showToast({ title: '活动不存在', icon: 'none' })
      return
    }
    const reviews = store.getReviews(id)
    const sameCat = store.getActivities().filter(
      (a) => String(a.id) !== String(id) && a.category === activity.category
    )
    const recommend = [...sameCat]
      .sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0))
      .slice(0, 4)
    const rank = store.getActivities()
      .filter((a) => a.category === activity.category)
      .sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0))
    const rankLabel = rank.length && String(rank[0].id) === String(id) ? '本店销量榜第1' : ''
    this.setData({
      activity,
      category: store.getCategory(activity.category),
      reviews,
      recommend,
      rankLabel,
      selectedSkuId: activity.hasSku && activity.skus && activity.skus.length ? activity.skus[0].id : '',
      selectedSku: activity.hasSku && activity.skus && activity.skus.length ? activity.skus[0] : null
    })
  },

  goDetailFromRec(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` })
  },

  toggleTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab })
  },

  openSku() {
    if (this.data.activity && this.data.activity.hasSku) {
      this.setData({ skuOpen: true })
    } else {
      this.goBooking()
    }
  },

  closeSku() {
    this.setData({ skuOpen: false })
  },

  noop() {},

  selectSku(e) {
    const id = e.currentTarget.dataset.id
    const activity = this.data.activity
    const selectedSku = activity.skus.find((s) => s.id === id) || null
    this.setData({ selectedSkuId: id, selectedSku })
  },

  confirmSku() {
    const { id, selectedSkuId } = this.data
    this.setData({ skuOpen: false })
    wx.navigateTo({ url: `/pages/booking/booking?id=${id}&sku=${selectedSkuId}` })
  },

  goBooking() {
    const { id, activity, selectedSkuId } = this.data
    const query = activity.hasSku ? `&sku=${selectedSkuId}` : ''
    wx.navigateTo({ url: `/pages/booking/booking?id=${id}${query}` })
  },

  goProfile() {
    wx.switchTab({ url: '/pages/profile/profile' })
  },

  showService() {
    wx.showModal({
      title: '报名后请添加客服小助理',
      content: '微信号：suiyueli6070\n客服电话：400-800-6070',
      showCancel: false,
      confirmText: '我知道了'
    })
  },

  copyAssistantWechat() {
    wx.setClipboardData({
      data: 'suiyueli6070',
      success: () => wx.showToast({ title: '助理微信号已复制', icon: 'none' })
    })
  },

  onShareAppMessage() {
    const state = store.get()
    const activity = this.data.activity
    const suffix = state.boundManager ? `&ref=${state.boundManager.id}` : ''
    return {
      title: activity ? activity.title : '岁悦里俱乐部',
      path: `/pages/detail/detail?id=${this.data.id}${suffix}`
    }
  }
})
