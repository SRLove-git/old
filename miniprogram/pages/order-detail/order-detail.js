const store = require('../../utils/store.js')

Page({
  data: {
    id: null,
    order: null,
    refundOpen: false,
    refundReason: '临时有事去不了',
    refundIndex: 0,
    reasons: ['临时有事去不了', '身体不舒服', '想换其他活动', '其他'],
    refundInfo: { can: false, amount: 0, reason: '' },
    reviewOpen: false,
    reviewRating: 5,
    reviewContent: '',
    displayStatus: '',
    statusSub: '',
    statusIcon: '✓',
    actionLabel: '',
    payRemain: ''
  },

  onLoad(options) {
    this.setData({ id: options.id })
  },

  async onShow() {
    await store.ready()
    if (this.data.id) this.loadOrder()
  },

  loadOrder() {
    const order = store.get().orders.find((o) => o.id === this.data.id)
    if (!order) return
    const refundInfo = store.calcRefund(order)
    const timeText = order.schedule && order.schedule.date ? `${order.schedule.date} ${order.schedule.weekday || ''} ${order.schedule.time || ''}` : (order.skuName || '无需预约')
    this.setData({
      order,
      timeText,
      refundInfo,
      displayStatus: store.displayStatus(order),
      statusSub: this.statusSubText(order, refundInfo),
      statusIcon: this.statusIconText(order),
      statusTone: this.statusTone(order),
      actionLabel: this.actionLabel(order),
      payRemain: order.payDeadline ? this.payRemainText(order.payDeadline) : '',
      payAmountText: store.money(order.payAmount),
      refundAmountText: store.money(order.refundAmount || 0)
    })
  },

  statusTone(order) {
    if (order.status === '待付款') return 'pay'
    if (order.status === '待发货' || order.status === '待收货') return 'ship'
    if (order.status === '退款中' || order.status === '已退款') return 'refund'
    if (order.status === '已取消') return 'cancel'
    return 'done'
  },

  statusSubText(order, refundInfo) {
    if (order.status === '退款中') return '退款申请审核中，通过后原路退回'
    if (order.status === '已退款') return `已退款 ¥${store.money(order.refundAmount || 0)}`
    if (order.refundRejected) return `退款申请未通过：${order.refundRejected}`
    if (order.trackingNo) return `${order.carrier} ${order.trackingNo}`
    return (refundInfo && refundInfo.reason) || '请按时参加活动'
  },

  statusIconText(order) {
    const icons = {
      待付款: '⏰',
      待发货: '📦',
      待收货: '🚚',
      已核销: '✅',
      待评价: '⭐',
      已完成: '🏅',
      退款中: '↩️',
      已退款: '💸',
      已取消: '🚫'
    }
    return icons[order.status] || '✓'
  },

  payRemainText(deadline) {
    const remain = Math.max(0, deadline - Date.now())
    const minutes = Math.floor(remain / 60000)
    const seconds = Math.floor((remain % 60000) / 1000)
    return `${minutes}分${seconds}秒`
  },

  actionLabel(order) {
    if (order.status === '待付款') return '去支付'
    if (order.status === '待发货') return ''
    if (order.status === '待收货') return '确认收货'
    if (order.status === '已核销') return '确认完成'
    if (order.status === '待评价') return '去评价'
    return ''
  },

  openRefund() {
    const refundInfo = store.calcRefund(this.data.order)
    if (!refundInfo.can) {
      wx.showToast({ title: refundInfo.reason || '当前不可退款', icon: 'none' })
      return
    }
    this.setData({ refundOpen: true, refundInfo })
  },

  closeRefund() {
    this.setData({ refundOpen: false })
  },

  noop() {},

  onReason(e) {
    const refundIndex = Number(e.detail.value)
    this.setData({ refundIndex, refundReason: this.data.reasons[refundIndex] })
  },

  async submitRefund() {
    const result = await store.refundOrder(this.data.id, this.data.refundReason)
    if (!result || !result.order) {
      wx.showToast({ title: '申请失败', icon: 'none' })
      return
    }
    if (result.error) {
      wx.showToast({ title: result.error, icon: 'none' })
      this.setData({ refundOpen: false })
      return
    }
    if (result.pending || result.order.status === '退款中') {
      // 需要运营审核：提交后进入「退款中」，金额与规则在审核通过后执行
      this.setData({ refundOpen: false, order: result.order })
      this.loadOrder()
      wx.showToast({ title: '退款申请已提交，等待审核', icon: 'none' })
      return
    }
    this.setData({ refundOpen: false, order: result.order })
    this.loadOrder()
    wx.showToast({ title: '退款成功', icon: 'success' })
  },

  async payNow() {
    const order = await store.payOrder(this.data.id)
    if (!order) {
      wx.showToast({ title: '订单已超时，请重新下单', icon: 'none' })
      return
    }
    this.loadOrder()
    wx.showToast({ title: '支付成功', icon: 'success' })
  },

  cancelNow() {
    wx.showModal({
      title: '取消订单',
      content: '取消后名额将释放，确定取消吗？',
      confirmColor: '#f53f3f',
      success: (res) => {
        if (!res.confirm) return
        store.cancelOrder(this.data.id).then((order) => {
          if (!order) {
            wx.showToast({ title: '取消失败', icon: 'none' })
            return
          }
          this.loadOrder()
        })
      }
    })
  },

  async advance() {
    const order = await store.advanceOrder(this.data.id)
    if (!order) return
    this.loadOrder()
    if (order.status === '待评价') {
      wx.showToast({ title: '已确认，可去评价', icon: 'none' })
    }
  },

  openReview() {
    this.setData({ reviewOpen: true, reviewRating: 5, reviewContent: '' })
  },

  closeReview() {
    this.setData({ reviewOpen: false })
  },

  onRating(e) {
    this.setData({ reviewRating: Number(e.currentTarget.dataset.rating) })
  },

  onReviewInput(e) {
    this.setData({ reviewContent: e.detail.value })
  },

  async submitReview() {
    const order = await store.submitReview(this.data.id, {
      rating: this.data.reviewRating,
      content: this.data.reviewContent
    })
    if (!order) return
    this.setData({ reviewOpen: false, order })
    wx.showToast({ title: '评价成功', icon: 'success' })
  },

  contact() {
    const a = store.getAssistant()
    wx.showModal({
      title: '联系客服',
      content: `客服电话：${a.phone}`,
      showCancel: false
    })
  },

  copyTracking() {
    const order = this.data.order || {}
    const text = [order.carrier, order.trackingNo].filter(Boolean).join(' ')
    if (!text) return
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '快递单号已复制', icon: 'none' })
    })
  }
})
