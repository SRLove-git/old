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
    payRemain: '',
    serviceOpen: false,
    logistics: null,
    logisticsLoading: false
  },

  onLoad(options) {
    this.setData({ id: options.id })
  },

  async onShow() {
    await store.ready()
    try { await store.refreshOrders() } catch (e) {}
    if (this.data.id) await this.loadOrder()
  },

  async loadOrder() {
    const order = store.get().orders.find((o) => o.id === this.data.id)
    if (!order) return
    const refundInfo = store.calcRefund(order)
    const timeText = order.schedule && order.schedule.date ? `${order.schedule.date} ${order.schedule.weekday || ''} ${order.schedule.time || ''}` : (order.skuName || '无需预约')
    const payAmount = Math.max(0, Number(order.payAmount || 0))
    const memberPrice = Number(order.memberPrice)
    const count = Number(order.count)
    const fallbackAmount = Number.isFinite(memberPrice) && Number.isFinite(count) ? memberPrice * count : payAmount
    const sourceAmount = Number(order.discountedAmount ?? fallbackAmount)
    const goodsAmount = Math.max(payAmount, Number.isFinite(sourceAmount) ? sourceAmount : payAmount)
    const couponDiscount = Math.max(0, Math.min(goodsAmount, Number(order.couponDiscountAmount ?? (goodsAmount - payAmount)) || 0))
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
      goodsAmountText: store.money(goodsAmount),
      couponDiscountText: store.money(couponDiscount),
      hasCouponDiscount: couponDiscount > 0,
      payAmountText: store.money(payAmount),
      balancePaidText: store.money(order.balancePaidAmount || 0),
      wechatPayText: store.money(order.wechatPayAmount ?? payAmount),
      refundAmountText: store.money(order.refundAmount || 0)
    })
    if (order.trackingNo || order.logisticsShipmentId) await this.loadLogistics()
  },

  async loadLogistics(refresh = false) {
    if (this.data.logisticsLoading) return
    this.setData({ logisticsLoading: true })
    try {
      const result = refresh
        ? await store.refreshOrderLogistics(this.data.id)
        : await store.getOrderLogistics(this.data.id)
      if (result) result.events = [...(result.events || [])].reverse()
      this.setData({ logistics: result || null })
      if (refresh) wx.showToast({ title: '物流已更新', icon: 'success' })
    } catch (error) {
      if (refresh) wx.showToast({ title: error.message || '物流刷新失败', icon: 'none' })
    } finally {
      this.setData({ logisticsLoading: false })
    }
  },

  refreshLogistics() {
    return this.loadLogistics(true)
  },

  statusTone(order) {
    if (order.status === '待付款') return 'pay'
    if (['待发货', '待收货', '待签到', '待核销', '待使用'].includes(order.status)) return 'ship'
    if (order.status === '退款中' || order.status === '已退款') return 'refund'
    if (order.status === '已取消') return 'cancel'
    return 'done'
  },

  statusSubText(order, refundInfo) {
    if (order.status === '退款中') return '退款申请审核中，通过后原路退回'
    if (order.status === '已退款') return `已退款 ¥${store.money(order.refundAmount || 0)}`
    if (order.refundRejected) return `退款申请未通过：${order.refundRejected}`
    if (order.trackingNo) return `${order.carrier} ${order.trackingNo}`
    if (order.status === '待签到') return '报名成功，请按预约时间到场签到'
    if (order.status === '待核销') return '到店后请向工作人员出示核销码'
    if (order.status === '待使用') return '服务完成后可确认使用并进行评价'
    return (refundInfo && refundInfo.reason) || '请按时参加活动'
  },

  statusIconText(order) {
    const icons = {
      待付款: '⏰',
      待发货: '📦',
      待收货: '🚚',
      待签到: '✓',
      待核销: '✓',
      待使用: '✓',
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
    if (order.status === '待使用') return '确认使用'
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
    if (this.data.paying) return
    this.setData({ paying: true })
    try {
      const order = await store.payOrder(this.data.id)
      if (!order) {
        wx.showToast({ title: '订单已超时，请重新下单', icon: 'none' })
        return
      }
      await this.loadOrder()
      wx.showToast({ title: '支付成功', icon: 'success' })
    } catch (error) {
      wx.showToast({ title: error.message || '微信支付未完成', icon: 'none' })
      await this.loadOrder()
    } finally {
      this.setData({ paying: false })
    }
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
    this.setData({ serviceOpen: true })
  },

  closeService() {
    this.setData({ serviceOpen: false })
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
