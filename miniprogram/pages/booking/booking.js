const store = require('../../utils/store.js')

Page({
  data: {
    id: null,
    activity: null,
    step: 1,
    scheduleId: '',
    count: 1,
    participants: [],
    selectedParticipantId: null,
    coupons: [],
    couponList: [],
    couponId: null,
    info: {
      name: '',
      phone: '',
      idCard: '',
      discount: ''
    },
    skuName: '',
    skuId: '',
    memberPrice: 0,
    discount: 0,
    total: 0,
    needIdCard: false,
    needDiscount: false,
    isGoods: false,
    address: null,
    addressOpen: false,
    addressForm: {},
    showAll: false,
    visibleSchedules: [],
    hasMore: false,
    refundText: '',
    payOpen: false,
    payDone: false
  },

  async onLoad(options) {
    await store.ready()
    const id = options.id
    const state = store.get()
    const activity = store.getActivity(id)
    if (!activity) {
      wx.showToast({ title: '活动不存在', icon: 'none' })
      return
    }

    const skuId = options.sku || (activity.hasSku && activity.skus.length ? activity.skus[0].id : '')
    const sku = activity.hasSku ? activity.skus.find((s) => s.id === skuId) || activity.skus[0] : null
    const memberPrice = sku ? sku.memberPrice : activity.memberPrice
    const firstParticipant = state.participants[0] || { id: null, name: '', phone: '', idCard: '' }

    this.setData({
      id,
      activity,
      skuId: skuId || '',
      scheduleId: activity.schedules && activity.schedules.length ? activity.schedules[0].id : '',
      participants: state.participants,
      selectedParticipantId: firstParticipant.id,
      coupons: state.coupons,
      skuName: sku ? sku.name : '',
      memberPrice,
      needIdCard: !!(activity.participantFields && activity.participantFields.idCard),
      needDiscount: !!(activity.participantFields && activity.participantFields.discount),
      isGoods: activity.category === 5,
      address: activity.category === 5 ? store.getDefaultAddress() : null,
      refundText: activity.refund || '',
      info: {
        name: firstParticipant.name || '',
        phone: firstParticipant.phone || '',
        idCard: firstParticipant.idCard || '',
        discount: ''
      }
    })
    this.updateSchedules()
    this.recalc()
  },

  async onShow() {
    await store.ready()
    const state = store.get()
    this.setData({
      participants: state.participants,
      coupons: state.coupons
    })
  },

  recalc() {
    const { count, memberPrice, couponId, coupons, activity } = this.data
    let discount = 0
    if (couponId) {
      const coupon = coupons.find((c) => c.id === couponId)
      if (coupon && store.couponApplicable(coupon, activity, memberPrice * count)) {
        discount = coupon.value
      }
    }
    const couponList = coupons.map((c) => ({
      ...c,
      usable: store.couponApplicable(c, activity, memberPrice * count)
    }))
    this.setData({
      discount,
      total: Math.max(0, memberPrice * count - discount),
      couponList
    })
  },

  selectSchedule(e) {
    const scheduleId = e.currentTarget.dataset.id
    const schedule = this.data.activity.schedules.find((s) => s.id === scheduleId)
    if (schedule && schedule.remaining <= 0) {
      wx.showToast({ title: '该时间段已满', icon: 'none' })
      return
    }
    this.setData({ scheduleId })
  },

  selectSku(e) {
    const id = e.currentTarget.dataset.id
    const sku = this.data.activity.skus.find((s) => s.id === id)
    if (!sku) return
    this.setData(
      { skuId: id, skuName: sku.name, memberPrice: sku.memberPrice },
      () => this.recalc()
    )
  },

  changeCount(e) {
    const delta = Number(e.currentTarget.dataset.delta)
    const activity = this.data.activity
    const schedule = activity.schedules.find((s) => s.id === this.data.scheduleId) || activity.schedules[0]
    const limit = Math.min(activity.limitPerUser || 99, schedule ? schedule.remaining : 99)
    const next = this.data.count + delta
    const count = Math.min(limit, Math.max(1, next))
    if (count === this.data.count) {
      wx.showToast({ title: `最多可报名${limit}人`, icon: 'none' })
      return
    }
    this.setData({ count }, () => this.recalc())
  },

  selectParticipant(e) {
    const id = e.currentTarget.dataset.id
    if (id === 'manage') {
      wx.navigateTo({ url: '/pages/participants/participants' })
      return
    }
    const participant = this.data.participants.find((p) => String(p.id) === String(id))
    this.setData({
      selectedParticipantId: id,
      info: {
        name: participant.name,
        phone: participant.phone,
        idCard: participant.idCard || '',
        discount: ''
      }
    })
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`info.${field}`]: e.detail.value })
  },

  selectCoupon(e) {
    const id = e.currentTarget.dataset.id
    const { coupons, activity, memberPrice, count } = this.data
    if (id !== '') {
      const coupon = coupons.find((c) => c.id === id)
      if (!coupon || coupon.used || !store.couponApplicable(coupon, activity, memberPrice * count)) {
        wx.showToast({ title: '该优惠券当前不可用', icon: 'none' })
        return
      }
    }
    const couponId = this.data.couponId === id ? null : id
    this.setData({ couponId }, () => this.recalc())
  },

  toggleMore() {
    this.setData({ showAll: !this.data.showAll }, () => this.updateSchedules())
  },

  updateSchedules() {
    const schedules = (this.data.activity && this.data.activity.schedules) || []
    this.setData({
      visibleSchedules: this.data.showAll ? schedules : schedules.slice(0, 3),
      hasMore: schedules.length > 3
    })
  },

  nextStep() {
    const { step, info, needIdCard, needDiscount, scheduleId, isGoods, address } = this.data
    if (step === 1) {
      if (!scheduleId) {
        wx.showToast({ title: '请选择报名时间', icon: 'none' })
        return
      }
      this.setData({ step: 2 })
    } else if (step === 2) {
      if (isGoods) {
        if (!address || !address.name || !address.detail) {
          wx.showToast({ title: '请填写收货地址', icon: 'none' })
          return
        }
      } else {
        if (!info.name || !info.phone || (needIdCard && !info.idCard) || (needDiscount && !info.discount)) {
          wx.showToast({ title: '请先填写完整报名信息', icon: 'none' })
          return
        }
      }
      this.setData({ step: 3 })
    } else {
      this.setData({ payOpen: true })
    }
  },

  prevStep() {
    if (this.data.step > 1) {
      this.setData({ step: this.data.step - 1 })
    }
  },

  closePay() {
    this.setData({ payOpen: false })
  },

  noop() {},

  openAddress() {
    const addr = this.data.address || store.getDefaultAddress() || {}
    this.setData({
      addressOpen: true,
      addressForm: {
        name: addr.name || '',
        phone: addr.phone || '',
        region: `${addr.province || ''}${addr.city || ''}${addr.district || ''}`,
        detail: addr.detail || ''
      }
    })
  },

  closeAddress() {
    this.setData({ addressOpen: false })
  },

  onAddressInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`addressForm.${field}`]: e.detail.value })
  },

  async saveAddressNow() {
    const { addressForm } = this.data
    if (!addressForm.name || !addressForm.phone || !addressForm.detail) {
      wx.showToast({ title: '请填写完整收货信息', icon: 'none' })
      return
    }
    const addr = await store.saveAddress({
      id: this.data.address ? this.data.address.id : null,
      name: addressForm.name,
      phone: addressForm.phone,
      province: '',
      city: '',
      district: addressForm.region || '',
      detail: addressForm.detail,
      isDefault: true
    })
    this.setData({ address: addr, addressOpen: false })
    wx.showToast({ title: '收货地址已保存', icon: 'none' })
  },

  async confirmPay() {
    const { activity, scheduleId, count, info, couponId, isGoods, address } = this.data
    wx.showLoading({ title: '提交中', mask: true })
    try {
      const order = await store.createOrder({
        activityId: activity.id,
        skuId: this.data.skuId,
        scheduleId,
        count,
        couponId,
        deferred: false,
        address: isGoods ? address : null,
        participants: isGoods ? `${address.name} ${address.phone}` : `${info.name}${count > 1 ? `等${count}人` : ''}`
      })
      wx.hideLoading()
      if (!order) {
        wx.showToast({ title: '下单失败，请重试', icon: 'none' })
        return
      }
      this.setData({ payOpen: false, payDone: true })
      setTimeout(() => {
        wx.switchTab({ url: '/pages/appointments/appointments' })
      }, 800)
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: e.message || '下单失败', icon: 'none' })
    }
  },

  async deferPay() {
    const { activity, scheduleId, count, info, couponId, isGoods, address } = this.data
    wx.showLoading({ title: '提交中', mask: true })
    try {
      const order = await store.createOrder({
        activityId: activity.id,
        skuId: this.data.skuId,
        scheduleId,
        count,
        couponId,
        deferred: true,
        address: isGoods ? address : null,
        participants: isGoods ? `${address.name} ${address.phone}` : `${info.name}${count > 1 ? `等${count}人` : ''}`
      })
      wx.hideLoading()
      if (!order) {
        wx.showToast({ title: '下单失败，请重试', icon: 'none' })
        return
      }
      this.setData({ payOpen: false, payDone: true })
      setTimeout(() => {
        wx.switchTab({ url: '/pages/orders/orders' })
      }, 800)
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: e.message || '下单失败', icon: 'none' })
    }
  },

  showService() {
    wx.showModal({
      title: '报名遇到问题？',
      content: '客服电话：400-800-6070',
      showCancel: false
    })
  },

  goAppointments() {
    wx.switchTab({ url: '/pages/appointments/appointments' })
  }
})
