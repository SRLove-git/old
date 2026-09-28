const store = require('../../utils/store.js')

Page({
  data: {
    loading: true,
    user: {},
    products: [],
    orders: [],
    addresses: [],
    selectedProduct: null,
    selectedAddressId: '',
    submitting: false
  },

  async onShow() {
    await this.load()
  },

  async onPullDownRefresh() {
    await this.load()
    wx.stopPullDownRefresh()
  },

  async load() {
    this.setData({ loading: true })
    try {
      await store.ready()
      await Promise.all([store.refreshUserProfile(), store.refreshPointMall()])
      const state = store.get()
      const addresses = state.addresses || []
      const selectedAddressId = this.data.selectedAddressId || String((addresses.find((item) => item.isDefault) || addresses[0] || {}).id || '')
      this.setData({
        user: state.user || {},
        products: (state.pointProducts || []).map((item) => ({ ...item, coverUrl: store.assetUrl(item.coverImage) || '/assets/product-tumbler-v2.jpg' })),
        orders: (state.pointOrders || []).map((item) => ({ ...item, coverUrl: store.assetUrl(item.coverImage) || '/assets/product-tumbler-v2.jpg' })),
        addresses,
        selectedAddressId
      })
    } catch (e) {
      wx.showToast({ title: e.message || '积分商城加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  openRedeem(e) {
    const product = this.data.products.find((item) => String(item.id) === String(e.currentTarget.dataset.id))
    if (!product) return
    if (!this.data.addresses.length) {
      wx.showModal({
        title: '请先添加收货地址',
        content: '积分商品需要配送地址，添加后即可兑换。',
        confirmText: '去添加',
        success: (res) => { if (res.confirm) wx.navigateTo({ url: '/pages/addresses/addresses' }) }
      })
      return
    }
    this.setData({ selectedProduct: product })
  },

  closeRedeem() {
    if (!this.data.submitting) this.setData({ selectedProduct: null })
  },

  noop() {},

  selectAddress(e) {
    this.setData({ selectedAddressId: String(e.currentTarget.dataset.id) })
  },

  goAddresses() {
    wx.navigateTo({ url: '/pages/addresses/addresses' })
  },

  async confirmRedeem() {
    const product = this.data.selectedProduct
    if (!product || this.data.submitting) return
    if (!this.data.selectedAddressId) {
      wx.showToast({ title: '请选择收货地址', icon: 'none' })
      return
    }
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '确认兑换',
        content: `将使用 ${product.pointsCost} 积分兑换“${product.title}”，确认后积分将立即扣除。`,
        confirmText: '确认兑换',
        success: (res) => resolve(res.confirm),
        fail: () => resolve(false)
      })
    })
    if (!confirmed) return
    this.setData({ submitting: true })
    try {
      await store.redeemPointProduct(product.id, this.data.selectedAddressId, 1)
      this.setData({ selectedProduct: null })
      await this.load()
      wx.showToast({ title: '兑换成功', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: e.message || '兑换失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
