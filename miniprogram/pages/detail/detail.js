const store = require('../../utils/store.js')

const ART_BY_CATEGORY = {
  1: '/assets/event-local.webp',
  2: '/assets/event-travel.webp',
  3: '/assets/event-academy.webp',
  4: '/assets/event-benefit.webp',
  5: '/assets/home-hero.webp'
}
const GALLERY_BY_CATEGORY = {
  1: ['/assets/home-hero.webp', '/assets/event-local.webp'],
  2: ['/assets/event-travel.webp', '/assets/home-hero.webp'],
  3: ['/assets/event-academy.webp', '/assets/event-local.webp'],
  4: ['/assets/event-benefit.webp', '/assets/event-local.webp'],
  5: ['/assets/event-benefit.webp', '/assets/home-hero.webp']
}

function decorateOffering(item) {
  const art = store.assetUrl(item.coverImage) || ART_BY_CATEGORY[item.category] || '/assets/event-local.webp'
  return { ...item, art, regionText: store.getActivityRegionNames(item).join('、') || item.city || '线上/全国' }
}

function serviceTextOf(activity) {
  if (activity.serviceDescription) return activity.serviceDescription
  const labels = {
    checkin: '线下服务 · 凭订单签到核销',
    verify_code: '到店服务 · 凭核销码核销',
    online: '线上服务 · 无需现场核销',
    delivery: '支持配送 · 收货后可申请售后'
  }
  if (activity.serviceMode && labels[activity.serviceMode]) return labels[activity.serviceMode]
  if (activity.category === 5) return labels.delivery
  if (activity.city === '线上' || activity.address === '线上直播') return labels.online
  return activity.sellType === 'sku' ? '规格可选 · 下单后客服确认' : labels.checkin
}

Page({
  data: {
    id: null,
    activity: null,
    isGoods: false,
    contentName: '活动',
    detailTitle: '活动详情',
    category: {},
    merchant: null,
    assistant: {},
    copy: {},
    tab: 'product',
    reviews: [],
    recommend: [],
    rankLabel: '',
    skuOpen: false,
    cartIntent: false,
    selectedSkuId: '',
    selectedSku: null,
    venues: [],
    hasVenue: false,
    memberSaving: 0,
    serviceText: '',
    refundText: '',
    buyNowText: '立即购买',
    serviceOpen: false,
    reviewOpen: false,
    reviewRating: 5,
    reviewContent: '',
    reviewableOrderId: '',
    reviewSubmitting: false,
    buyersOpen: false,
    cartCount: 0,
    galleryIndex: 0,
    galleryHeight: 750,
    galleryHeights: []
  },

  async onLoad(options) {
    await store.ready()
    const id = options.id
    this.setData({ id })
    this.loadActivity(id)
  },

  async onShow() {
    await store.ready()
    try { await Promise.all([store.refreshHome(), store.refreshReviews()]) } catch (e) {}
    if (this.data.id) this.loadActivity(this.data.id)
  },

  loadActivity(id) {
    const source = store.getActivity(id)
    if (!source) {
      wx.showToast({ title: '活动不存在', icon: 'none' })
      return
    }
    const activity = decorateOffering({ ...source, skus: source.skus || [], schedules: source.schedules || [] })
    const isGoods = Number(activity.category) === 5
    const contentName = isGoods ? '商品' : '活动'
    const detailTitle = `${contentName}详情`
    wx.setNavigationBarTitle({ title: detailTitle })
    activity.expired = store.isActivityExpired(activity)
    if (!activity.images || !activity.images.length) {
      activity.images = [{ id: `img-${activity.id}-1`, src: activity.art, tone: activity.coverTone, emoji: activity.cover, label: '活动图片' }]
    }
    const galleryFallbacks = GALLERY_BY_CATEGORY[activity.category] || [activity.art]
    activity.images = activity.images.map((image, index) => ({
      ...image,
      src: store.assetUrl(image.src || galleryFallbacks[index % galleryFallbacks.length]),
      id: image.id || `gallery-${activity.id}-${index}`
    }))
    if (!activity.buyers) activity.buyers = []
    activity.detailBlocks = (activity.detailBlocks && activity.detailBlocks.length
      ? activity.detailBlocks
      : [{ type: 'text', text: activity.detail || '' }]
    ).map((b, i) => ({
      ...b,
      src: b.type === 'image' ? store.assetUrl(b.src) : b.src,
      url: b.type === 'video' ? store.assetUrl(b.url) : b.url,
      _key: `${activity.id}-${i}`
    }))
    const merchant = store.getManagers().find((m) => String(m.id) === String(activity.managerId)) || null
    const reviews = store.getReviews(id)
    const reviewableOrder = (store.get().orders || []).find((order) => String(order.activityId) === String(id) && order.status === '待评价') || null
    const allOfferings = [...store.getActivities(), ...(store.get().products || [])].filter((item) => String(item.id) !== String(id))
    const recommend = allOfferings
      .sort((a, b) => Number(store.isActivityExpired(a)) - Number(store.isActivityExpired(b))
        || Number(b.category === activity.category) - Number(a.category === activity.category)
        || (b.soldCount || 0) - (a.soldCount || 0))
      .slice(0, 6)
      .map((a, index) => ({ ...decorateOffering(a), rankLabel: index === 0 ? '本店销量榜第1' : '' }))
    const rank = [activity, ...allOfferings]
      .filter((a) => a.category === activity.category)
      .sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0))
    const rankLabel = rank.length && String(rank[0].id) === String(id) ? '本店销量榜第1' : ''
    const hasSku = activity.hasSku || activity.sellType === 'sku'
    const venues = (activity.skus || [])
      .filter((s) => s.address)
      .map((s) => ({ id: s.id, name: s.name, district: s.district || '', address: s.address }))
    const sameGallery = this.data.activity && String(this.data.activity.id) === String(activity.id)
    const galleryHeights = sameGallery ? this.data.galleryHeights : []
    const galleryHeight = galleryHeights[0] || 750
    this.setData({
      activity,
      isGoods,
      contentName,
      detailTitle,
      category: store.getCategory(activity.category),
      merchant,
      assistant: store.getAssistant(),
      copy: store.getCopy(),
      reviews,
      reviewableOrderId: reviewableOrder ? reviewableOrder.id : '',
      recommend,
      rankLabel,
      venues,
      hasVenue: venues.length > 0,
      memberSaving: Math.max(0, Number(activity.price || activity.originalPrice || 0) - Number(activity.memberPrice || 0)),
      serviceText: serviceTextOf(activity),
      refundText: store.refundRuleText(activity.refundRule),
      buyNowText: activity.expired ? (isGoods ? '商品已下架' : '活动已结束') : (isGoods ? '立即购买' : '立即报名'),
      cartCount: store.getCart().reduce((total, item) => total + Number(item.count || 1), 0),
      selectedSkuId: hasSku && activity.skus && activity.skus.length ? activity.skus[0].id : '',
      selectedSku: hasSku && activity.skus && activity.skus.length ? activity.skus[0] : null,
      galleryIndex: 0,
      galleryHeight,
      galleryHeights
    }, () => this.measureGalleryImages(activity.images))
  },

  onGalleryImageLoad(e) {
    const index = Number(e.currentTarget.dataset.index || 0)
    const width = Number(e.detail.width || 0)
    const height = Number(e.detail.height || 0)
    this.updateGalleryHeight(index, width, height)
  },

  measureGalleryImages(images) {
    const galleryImages = images || []
    galleryImages.forEach((image, index) => {
      if (!image || !image.src) return
      wx.getImageInfo({
        src: image.src,
        success: ({ width, height }) => this.updateGalleryHeight(index, Number(width), Number(height))
      })
    })
  },

  updateGalleryHeight(index, width, height) {
    if (!width || !height) return
    const galleryHeight = Math.max(1, Math.round(750 * height / width))
    const galleryHeights = [...this.data.galleryHeights]
    galleryHeights[index] = galleryHeight
    const next = { galleryHeights }
    if (index === this.data.galleryIndex) next.galleryHeight = galleryHeight
    this.setData(next)
  },

  onGalleryChange(e) {
    const galleryIndex = Number(e.detail.current || 0)
    const galleryHeight = this.data.galleryHeights[galleryIndex] || this.data.galleryHeight || 750
    this.setData({ galleryIndex, galleryHeight })
  },

  openReview() {
    if (!this.data.reviewableOrderId) {
      wx.showToast({ title: this.data.isGoods ? '购买并完成后可评价' : '参加并完成后可评价', icon: 'none' })
      return
    }
    this.setData({ reviewOpen: true, reviewRating: 5, reviewContent: '' })
  },

  closeReview() {
    if (!this.data.reviewSubmitting) this.setData({ reviewOpen: false })
  },

  openBuyers() {
    this.setData({ buyersOpen: true })
  },

  closeBuyers() {
    this.setData({ buyersOpen: false })
  },

  onReviewRating(e) {
    this.setData({ reviewRating: Number(e.currentTarget.dataset.rating) })
  },

  onReviewInput(e) {
    this.setData({ reviewContent: e.detail.value })
  },

  async submitDetailReview() {
    if (this.data.reviewSubmitting) return
    const content = String(this.data.reviewContent || '').trim()
    if (!content) {
      wx.showToast({ title: '请写下您的体验', icon: 'none' })
      return
    }
    this.setData({ reviewSubmitting: true })
    try {
      await store.submitReview(this.data.reviewableOrderId, {
        rating: this.data.reviewRating,
        content
      })
      this.setData({ reviewOpen: false, reviewContent: '', tab: 'review' })
      this.loadActivity(this.data.id)
      wx.showToast({ title: '评价成功', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: e.message || '评价提交失败', icon: 'none' })
    } finally {
      this.setData({ reviewSubmitting: false })
    }
  },

  goDetailFromRec(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` })
  },

  async toggleTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ tab })
    if (tab !== 'review') return
    try {
      await store.refreshReviews()
      if (this.data.id) this.loadActivity(this.data.id)
    } catch (error) {
      // 网络异常时保留当前缓存，不影响用户继续浏览。
    }
  },

  async openSku() {
    if (this.data.activity?.expired) {
      wx.showToast({ title: '活动已过期，无法报名', icon: 'none' })
      return
    }
    try {
      await store.requireLogin()
    } catch (error) {
      return
    }
    if (this.data.activity && (this.data.activity.hasSku || this.data.activity.sellType === 'sku')) {
      this.setData({ skuOpen: true, cartIntent: false })
    } else {
      this.goBooking()
    }
  },

  addToCart() {
    const activity = this.data.activity
    if (!activity) return
    if (activity.expired) {
      wx.showToast({ title: '活动已过期，无法报名', icon: 'none' })
      return
    }
    if (activity.hasSku || activity.sellType === 'sku') {
      this.setData({ skuOpen: true, cartIntent: true })
      return
    }
    this.saveToCart()
  },

  saveToCart() {
    try {
      store.addActivityToCart(this.data.activity, { skuId: this.data.selectedSkuId })
      this.setData({
        skuOpen: false,
        cartIntent: false,
        cartCount: store.getCart().reduce((total, item) => total + Number(item.count || 1), 0)
      })
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

  async goBooking() {
    if (this.data.activity?.expired) {
      wx.showToast({ title: '活动已过期，无法报名', icon: 'none' })
      return
    }
    try {
      await store.requireLogin()
    } catch (error) {
      return
    }
    const { id, activity, selectedSkuId } = this.data
    const hasSku = activity.hasSku || activity.sellType === 'sku'
    const query = hasSku ? `&sku=${selectedSkuId}` : ''
    wx.navigateTo({ url: `/pages/booking/booking?id=${id}${query}` })
  },

  goProfile() {
    wx.switchTab({ url: '/pages/profile/profile' })
  },

  showService() {
    this.setData({ serviceOpen: true })
  },

  closeService() {
    this.setData({ serviceOpen: false })
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
      title: activity ? activity.title : store.getBrand().chineseName,
      path: `/pages/detail/detail?id=${this.data.id}${ref}`
    }
  }
})
