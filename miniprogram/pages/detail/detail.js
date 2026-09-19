const store = require('../../utils/store.js')

const ART_BY_CATEGORY = {
  1: '/assets/event-local.jpg',
  2: '/assets/event-travel.jpg',
  3: '/assets/event-academy.jpg',
  4: '/assets/event-benefit.jpg',
  5: '/assets/home-hero.jpg'
}
const GALLERY_BY_CATEGORY = {
  1: ['/assets/home-hero.jpg', '/assets/event-local.jpg'],
  2: ['/assets/event-travel.jpg', '/assets/home-hero.jpg'],
  3: ['/assets/event-academy.jpg', '/assets/event-local.jpg'],
  4: ['/assets/event-benefit.jpg', '/assets/event-local.jpg'],
  5: ['/assets/event-benefit.jpg', '/assets/home-hero.jpg']
}

function decorateOffering(item) {
  const art = item.coverImage || ART_BY_CATEGORY[item.category] || '/assets/event-local.jpg'
  return { ...item, art, regionText: store.getActivityRegionNames(item).join('、') || item.city || '线上/全国' }
}

Page({
  data: {
    id: null,
    activity: null,
    category: {},
    merchant: null,
    assistant: {},
    tab: 'product',
    reviews: [],
    recommend: [],
    rankLabel: '',
    skuOpen: false,
    cartIntent: false,
    selectedSkuId: '',
    selectedSku: null,
    memberSaving: 0,
    serviceText: '',
    buyNowText: '立即购买'
  },

  async onLoad(options) {
    await store.ready()
    const id = options.id
    this.setData({ id })
    wx.setNavigationBarTitle({ title: '商品详情' })
    this.loadActivity(id)
  },

  async onShow() {
    await store.ready()
    if (this.data.id) this.loadActivity(this.data.id)
  },

  loadActivity(id) {
    const source = store.getActivity(id)
    if (!source) {
      wx.showToast({ title: '活动不存在', icon: 'none' })
      return
    }
    const activity = decorateOffering({ ...source, skus: source.skus || [], schedules: source.schedules || [] })
    if (!activity.images || !activity.images.length) {
      activity.images = [{ id: `img-${activity.id}-1`, tone: activity.coverTone, emoji: activity.cover, label: '活动图片' }]
    }
    const galleryFallbacks = GALLERY_BY_CATEGORY[activity.category] || [activity.art]
    activity.images = activity.images.map((image, index) => ({ ...image, src: image.src || galleryFallbacks[index % galleryFallbacks.length], id: image.id || `gallery-${activity.id}-${index}` }))
    if (!activity.buyers) activity.buyers = []
    activity.detailBlocks = (activity.detailBlocks && activity.detailBlocks.length
      ? activity.detailBlocks
      : [{ type: 'text', text: activity.detail || '' }]
    ).map((b, i) => ({ ...b, _key: `${activity.id}-${i}` }))
    const merchant = store.getManagers().find((m) => String(m.id) === String(activity.managerId)) || null
    const reviews = store.getReviews(id)
    const allOfferings = [...store.getActivities(), ...(store.get().products || [])].filter((item) => String(item.id) !== String(id))
    const recommend = allOfferings
      .sort((a, b) => Number(b.category === activity.category) - Number(a.category === activity.category) || (b.soldCount || 0) - (a.soldCount || 0))
      .slice(0, 6)
      .map((a, index) => ({ ...decorateOffering(a), rankLabel: index === 0 ? '本店销量榜第1' : '' }))
    const rank = [activity, ...allOfferings]
      .filter((a) => a.category === activity.category)
      .sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0))
    const rankLabel = rank.length && String(rank[0].id) === String(id) ? '本店销量榜第1' : ''
    const hasSku = activity.hasSku || activity.sellType === 'sku'
    this.setData({
      activity,
      category: store.getCategory(activity.category),
      merchant,
      assistant: store.getAssistant(),
      reviews,
      recommend,
      rankLabel,
      memberSaving: Math.max(0, Number(activity.price || activity.originalPrice || 0) - Number(activity.memberPrice || 0)),
      serviceText: activity.category === 5 ? '支持配送 · 收货后可申请售后' : (activity.sellType === 'sku' ? '规格可选 · 下单后客服确认' : '线下服务 · 凭订单签到核销'),
      buyNowText: activity.category === 5 ? '立即购买' : '立即报名',
      selectedSkuId: hasSku && activity.skus && activity.skus.length ? activity.skus[0].id : '',
      selectedSku: hasSku && activity.skus && activity.skus.length ? activity.skus[0] : null
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
    if (this.data.activity && (this.data.activity.hasSku || this.data.activity.sellType === 'sku')) {
      this.setData({ skuOpen: true })
    } else {
      this.goBooking()
    }
  },

  addToCart() {
    const activity = this.data.activity
    if (!activity) return
    if (activity.hasSku || activity.sellType === 'sku') {
      this.setData({ skuOpen: true, cartIntent: true })
      return
    }
    this.saveToCart()
  },

  saveToCart() {
    try {
      store.addActivityToCart(this.data.activity, { skuId: this.data.selectedSkuId })
      this.setData({ skuOpen: false, cartIntent: false })
      wx.showToast({ title: '已加入购物车', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: e.message || '加入失败', icon: 'none' })
    }
  },

  goCart() {
    wx.navigateTo({ url: '/pages/cart/cart' })
  },

  goShop() {
    if (this.data.merchant) {
      wx.navigateTo({ url: `/pages/merchant-shop/merchant-shop?id=${this.data.merchant.id}` })
    }
  },

  closeSku() {
    this.setData({ skuOpen: false, cartIntent: false })
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
    if (this.data.cartIntent) {
      this.saveToCart()
      return
    }
    this.setData({ skuOpen: false })
    wx.navigateTo({ url: `/pages/booking/booking?id=${id}&sku=${selectedSkuId}` })
  },

  goBooking() {
    const { id, activity, selectedSkuId } = this.data
    const hasSku = activity.hasSku || activity.sellType === 'sku'
    const query = hasSku ? `&sku=${selectedSkuId}` : ''
    wx.navigateTo({ url: `/pages/booking/booking?id=${id}${query}` })
  },

  goProfile() {
    wx.switchTab({ url: '/pages/profile/profile' })
  },

  showService() {
    const a = store.getAssistant()
    wx.showModal({
      title: '报名后请添加客服小助理',
      content: `微信号：${a.wechat}\n客服电话：${a.phone}`,
      showCancel: false,
      confirmText: '我知道了'
    })
  },

  copyAssistantWechat() {
    const a = store.getAssistant()
    wx.setClipboardData({
      data: a.wechat,
      success: () => wx.showToast({ title: '助理微信号已复制', icon: 'none' })
    })
  },

  onShareAppMessage() {
    const activity = this.data.activity
    const ref = activity && activity.managerId ? `&ref=${activity.managerId}` : ''
    return {
      title: activity ? activity.title : '岁悦里',
      path: `/pages/detail/detail?id=${this.data.id}${ref}`
    }
  }
})
