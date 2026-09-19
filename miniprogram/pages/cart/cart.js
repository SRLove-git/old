const store = require('../../utils/store.js')

Page({
  data: {
    cart: [],
    selectedCount: 0,
    total: '0.00',
    allSelected: false,
    paying: false
  },

  async onShow() {
    await store.ready()
    this.loadCart()
  },

  loadCart() {
    const cart = store.getCart().map((item) => ({
      ...item,
      subtotal: (Number(item.price || 0) * Number(item.count || 1)).toFixed(2)
    }))
    const selected = cart.filter((item) => item.selected)
    this.setData({
      cart,
      selectedCount: selected.length,
      total: selected.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.count || 1), 0).toFixed(2),
      allSelected: cart.length > 0 && selected.length === cart.length
    })
  },

  toggleItem(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.cart.find((row) => String(row.id) === String(id))
    if (!item) return
    store.updateCartItem(id, { selected: !item.selected })
    this.loadCart()
  },

  toggleAll() {
    const selected = !this.data.allSelected
    this.data.cart.forEach((item) => store.updateCartItem(item.id, { selected }))
    this.loadCart()
  },

  changeCount(e) {
    const id = e.currentTarget.dataset.id
    const delta = Number(e.currentTarget.dataset.delta)
    const item = this.data.cart.find((row) => String(row.id) === String(id))
    if (!item || item.kind === 'course') return
    const count = Math.max(1, Math.min(Number(item.maxCount || 99), Number(item.count || 1) + delta))
    if (count === item.count) {
      wx.showToast({ title: `最多可购买${item.maxCount || 99}份`, icon: 'none' })
      return
    }
    store.updateCartItem(id, { count })
    this.loadCart()
  },

  removeItem(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '移出购物车',
      content: '确定移除这个项目吗？',
      confirmColor: '#d36151',
      success: (res) => {
        if (!res.confirm) return
        store.removeCartItems([id])
        this.loadCart()
      }
    })
  },

  goItem(e) {
    const item = this.data.cart.find((row) => String(row.id) === String(e.currentTarget.dataset.id))
    if (!item) return
    const url = item.kind === 'course'
      ? `/pages/live-room/live-room?id=${item.targetId}`
      : `/pages/detail/detail?id=${item.targetId}`
    wx.navigateTo({ url })
  },

  goBrowse() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  checkout() {
    const selected = this.data.cart.filter((item) => item.selected)
    if (!selected.length || this.data.paying) {
      if (!selected.length) wx.showToast({ title: '请先选择结算项目', icon: 'none' })
      return
    }
    wx.showModal({
      title: `合并付款（${selected.length}项）`,
      content: `本次共需支付 ¥${this.data.total}。活动将使用最近一期排班和默认报名人。`,
      confirmText: '确认付款',
      confirmColor: '#293633',
      success: (res) => {
        if (res.confirm) this.paySelected(selected)
      }
    })
  },

  async paySelected(selected) {
    this.setData({ paying: true })
    wx.showLoading({ title: '正在付款', mask: true })
    const completedIds = []
    let hasOrder = false
    try {
      const state = store.get()
      const participant = state.participants[0] || { name: state.user.name || '报名人', phone: state.user.phone || '' }
      for (const item of selected) {
        if (item.kind === 'course') {
          const course = store.getLive(item.targetId) || { id: item.targetId, title: item.title, memberPrice: item.price }
          if (!store.isCoursePurchased(item.targetId)) store.purchaseCourse(course)
        } else {
          const activity = store.getActivity(item.targetId)
          if (!activity) throw new Error(`${item.title} 已下架`)
          const isGoods = activity.category === 5
          const address = isGoods ? store.getDefaultAddress() : null
          if (isGoods && !address) throw new Error(`${item.title} 需要先设置收货地址`)
          await store.createOrder({
            activityId: activity.id,
            skuId: item.skuId,
            scheduleId: item.scheduleId,
            count: Number(item.count || 1),
            couponId: null,
            deferred: false,
            address,
            participants: isGoods ? `${address.name} ${address.phone}` : `${participant.name}${item.count > 1 ? `等${item.count}人` : ''}`
          })
          hasOrder = true
        }
        completedIds.push(item.id)
      }
      store.removeCartItems(completedIds)
      wx.hideLoading()
      this.setData({ paying: false })
      wx.showModal({
        title: '付款成功',
        content: `已完成 ${completedIds.length} 个项目的合并付款。`,
        showCancel: false,
        confirmText: hasOrder ? '查看订单' : '开始学习',
        success: () => {
          if (hasOrder) wx.redirectTo({ url: '/pages/orders/orders' })
          else {
            wx.setStorageSync('academyTab', 'mine')
            wx.switchTab({ url: '/pages/lives/lives' })
          }
        }
      })
    } catch (e) {
      if (completedIds.length) store.removeCartItems(completedIds)
      wx.hideLoading()
      this.setData({ paying: false })
      this.loadCart()
      wx.showModal({ title: '部分项目未完成', content: e.message || '请稍后重试', showCancel: false })
    }
  }
})
