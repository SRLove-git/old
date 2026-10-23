const store = require('../../utils/store.js')
const regionPicker = require('../../utils/region-picker.js')

function selectedParticipantIds(info, memberList) {
  return [info, ...(memberList || [])]
    .map((item) => item && item.participantId)
    .filter((id) => id !== null && id !== undefined && id !== '')
    .map(String)
}

function decorateParticipants(participants, info, memberList) {
  const selected = new Set(selectedParticipantIds(info, memberList))
  return (participants || []).map((item) => ({
    ...item,
    selected: selected.has(String(item.id))
  }))
}

Page({
  data: {
    id: null,
    activity: null,
    submittingPayment: false,
    step: 1,
    scheduleId: '',
    count: 1,
    participants: [],
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
    skuAddress: '',
    isSkuOnly: false,
    hasVenue: false,
    memberPrice: 0,
    discount: 0,
    total: 0,
    balance: 0,
    useBalance: false,
    balanceDeduction: 0,
    wechatAmount: 0,
    needIdCard: false,
    needDiscount: false,
    isGoods: false,
    address: null,
    addressOpen: false,
    addressForm: {},
    regionOptions: [],
    regionPickerColumns: [[], [], []],
    regionPickerIndexes: [0, 0, 0],
    showAll: false,
    visibleSchedules: [],
    hasMore: false,
    selectedSchedule: null,
    coverImageUrl: '',
    categoryName: '',
    bookingTitle: '',
    refundText: '',
    memberList: [],
    payOpen: false,
    serviceOpen: false
  },

  async onLoad(options) {
    await store.ready()
    try { await store.refreshRegions() } catch (e) {}
    const id = options.id
    const state = store.get()
    const activity = store.getActivity(id)
    if (!activity) {
      wx.showToast({ title: '活动不存在', icon: 'none' })
      return
    }
    if (store.isActivityExpired(activity)) {
      wx.showModal({
        title: '活动已过期',
        content: '该活动已结束，无法继续报名或付款。',
        showCancel: false,
        success: () => wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/index/index' }) })
      })
      return
    }

    const isSkuOnly = activity.sellType === 'sku'
    const hasSku = activity.hasSku || isSkuOnly
    const skuId = options.sku || (hasSku && activity.skus && activity.skus.length ? activity.skus[0].id : '')
    const sku = hasSku ? (activity.skus || []).find((s) => s.id === skuId) || activity.skus[0] : null
    const memberPrice = sku ? sku.memberPrice : activity.memberPrice
    const firstParticipant = state.participants[0] || { id: null, name: '', phone: '', idCard: '' }

    const regionOptions = store.getRegions()
    const picker = regionPicker.buildRegionPicker(regionOptions)
    const schedules = activity.schedules || []
    const firstAvailableSchedule = schedules.find((item) => Number(item.remaining) > 0) || schedules[0] || null
    const categoryName = store.getCategory(activity.category).name
    this.setData({
      id,
      activity,
      isSkuOnly,
      skuId: skuId || '',
      scheduleId: !isSkuOnly && firstAvailableSchedule ? firstAvailableSchedule.id : '',
      selectedSchedule: !isSkuOnly ? firstAvailableSchedule : null,
      coverImageUrl: store.assetUrl(activity.coverImage) || ({ 1: '/assets/event-local.webp', 2: '/assets/event-travel.webp', 3: '/assets/event-academy.webp', 4: '/assets/event-benefit.webp', 5: '/assets/product-tumbler-v2.webp' })[activity.category] || '/assets/event-local.webp',
      categoryName,
      bookingTitle: activity.title || activity.name || (sku && sku.name) || `${categoryName}报名`,
      participants: decorateParticipants(state.participants, { participantId: firstParticipant.id }, []),
      coupons: state.coupons,
      skuName: sku ? sku.name : '',
      skuAddress: (sku && sku.address) || activity.address || '',
      hasVenue: (activity.skus || []).some((s) => s.address),
      memberPrice,
      needIdCard: !!(activity.participantFields && activity.participantFields.idCard),
      needDiscount: !!(activity.participantFields && activity.participantFields.discount),
      isGoods: activity.category === 5,
      address: activity.category === 5 ? store.getDefaultAddress() : null,
      regionOptions,
      regionPickerColumns: picker.columns,
      regionPickerIndexes: picker.indexes,
      refundText: store.refundRuleText(activity.refundRule) || activity.refund || '',
      info: {
        participantId: firstParticipant.id,
        name: firstParticipant.name || '',
        phone: /^1\d{10}$/.test(state.user.phone || '') ? state.user.phone : '',
        idCard: firstParticipant.idCard || '',
        discount: ''
      }
    })
    this.updateSchedules()
    this.recalc()
  },

  async onShow() {
    await store.ready()
    try { await Promise.all([store.refreshHome(), store.refreshRegions()]) } catch (e) {}
    const state = store.get()
    const activity = store.getActivity(this.data.id)
    if (!activity || Number(activity.status ?? 1) === 0) {
      wx.showToast({ title: '该活动或商品已下架', icon: 'none' })
      return
    }
    const hasSku = activity.hasSku || activity.sellType === 'sku'
    const sku = hasSku
      ? (activity.skus || []).find((item) => String(item.id) === String(this.data.skuId)) || (activity.skus || [])[0] || null
      : null
    const schedules = activity.schedules || []
    const selectedSchedule = activity.sellType === 'sku'
      ? null
      : schedules.find((item) => String(item.id) === String(this.data.scheduleId) && Number(item.remaining) > 0)
        || schedules.find((item) => Number(item.remaining) > 0)
        || null
    const regionOptions = store.getRegions()
    const picker = regionPicker.buildRegionPicker(regionOptions, this.data.address)
    this.setData({
      participants: decorateParticipants(state.participants, this.data.info, this.data.memberList),
      coupons: state.coupons,
      balance: Number(state.user.balance || 0),
      activity,
      skuId: sku ? sku.id : '',
      skuName: sku ? sku.name : '',
      memberPrice: sku ? sku.memberPrice : activity.memberPrice,
      scheduleId: selectedSchedule ? selectedSchedule.id : '',
      selectedSchedule,
      coverImageUrl: store.assetUrl(activity.coverImage) || ({ 1: '/assets/event-local.webp', 2: '/assets/event-travel.webp', 3: '/assets/event-academy.webp', 4: '/assets/event-benefit.webp', 5: '/assets/product-tumbler-v2.webp' })[activity.category] || '/assets/event-local.webp',
      regionOptions,
      regionPickerColumns: picker.columns,
      regionPickerIndexes: picker.indexes
    })
    this.updateSchedules()
    this.recalc()
  },

  recalc() {
    const { count, memberPrice, couponId, coupons, activity, balance, useBalance } = this.data
    const subtotal = Number((Number(memberPrice || 0) * Number(count || 1)).toFixed(2))
    let couponValue = 0
    if (couponId) {
      const coupon = coupons.find((c) => c.id === couponId)
      if (coupon && store.couponApplicable(coupon, activity, memberPrice * count)) {
        couponValue = Number(coupon.value || 0)
      }
    }
    const total = Number(Math.max(0.01, subtotal - couponValue).toFixed(2))
    const discount = Number(Math.max(0, subtotal - total).toFixed(2))
    const balanceDeduction = useBalance ? Number(Math.min(Number(balance || 0), total).toFixed(2)) : 0
    const wechatAmount = Number(Math.max(0, total - balanceDeduction).toFixed(2))
    const couponList = coupons.map((c) => ({
      ...c,
      usable: store.couponApplicable(c, activity, memberPrice * count)
    }))
    this.setData({
      discount,
      total,
      balanceDeduction,
      wechatAmount,
      couponList
    })
  },

  toggleBalance(e) {
    this.setData({ useBalance: Boolean(e.detail.value) }, () => this.recalc())
  },

  selectSchedule(e) {
    const scheduleId = e.currentTarget.dataset.id
    const schedule = (this.data.activity.schedules || []).find((s) => s.id === scheduleId)
    if (schedule && schedule.remaining <= 0) {
      wx.showToast({ title: '该时间段已满', icon: 'none' })
      return
    }
    this.setData({ scheduleId, selectedSchedule: schedule })
  },

  selectSku(e) {
    const id = e.currentTarget.dataset.id
    const sku = this.data.activity.skus.find((s) => s.id === id)
    if (!sku) return
    this.setData(
      { skuId: id, skuName: sku.name, skuAddress: sku.address || this.data.activity.address || '', memberPrice: sku.memberPrice },
      () => this.recalc()
    )
  },

  changeCount(e) {
    const delta = Number(e.currentTarget.dataset.delta)
    const activity = this.data.activity
    const schedules = activity.schedules || []
    const schedule = schedules.find((s) => s.id === this.data.scheduleId) || schedules[0]
    const limit = Math.min(activity.limitPerUser || 99, schedule ? schedule.remaining : 99)
    const next = this.data.count + delta
    const count = Math.min(limit, Math.max(1, next))
    if (count === this.data.count) {
      wx.showToast({ title: `最多可报名${limit}人`, icon: 'none' })
      return
    }
    const memberList = this.data.memberList.slice(0, count - 1)
    while (memberList.length < count - 1) memberList.push({ participantId: null, name: '', idCard: '' })
    const participants = decorateParticipants(this.data.participants, this.data.info, memberList)
    this.setData({ count, memberList, participants }, () => this.recalc())
  },

  selectParticipant(e) {
    const id = e.currentTarget.dataset.id
    if (id === 'manage') {
      wx.navigateTo({ url: '/pages/participants/participants' })
      return
    }
    const participant = this.data.participants.find((p) => String(p.id) === String(id))
    if (!participant) return

    let info = { ...this.data.info }
    const memberList = this.data.memberList.map((member) => ({ ...member }))
    const normalizedId = String(id)

    if (String(info.participantId) === normalizedId) {
      info = { ...info, participantId: null, name: '', idCard: '', discount: '' }
    } else {
      const selectedMemberIndex = memberList.findIndex((member) => String(member.participantId) === normalizedId)
      if (selectedMemberIndex >= 0) {
        memberList[selectedMemberIndex] = { participantId: null, name: '', idCard: '' }
      } else if (info.participantId === null || info.participantId === undefined || info.participantId === '') {
        info = {
          ...info,
          participantId: participant.id,
          name: participant.name,
          phone: /^1\d{10}$/.test(store.get().user.phone || '') ? store.get().user.phone : '',
          idCard: participant.idCard || '',
          discount: ''
        }
      } else {
        const emptyIndex = memberList.findIndex((member) => (
          member.participantId === null || member.participantId === undefined || member.participantId === ''
        ))
        if (emptyIndex < 0) {
          wx.showToast({ title: `当前最多选择${this.data.count}人`, icon: 'none' })
          return
        }
        memberList[emptyIndex] = {
          participantId: participant.id,
          name: participant.name,
          idCard: participant.idCard || ''
        }
      }
    }

    this.setData({
      info,
      memberList,
      participants: decorateParticipants(this.data.participants, info, memberList)
    })
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    const changes = { [`info.${field}`]: e.detail.value }
    if (field === 'name' || field === 'idCard') changes['info.participantId'] = null
    this.setData(changes, () => {
      if (field === 'name' || field === 'idCard') {
        this.setData({ participants: decorateParticipants(this.data.participants, this.data.info, this.data.memberList) })
      }
    })
  },

  onMemberInput(e) {
    const index = Number(e.currentTarget.dataset.index)
    const field = e.currentTarget.dataset.field
    this.setData({
      [`memberList[${index}].${field}`]: e.detail.value,
      [`memberList[${index}].participantId`]: null
    }, () => {
      this.setData({ participants: decorateParticipants(this.data.participants, this.data.info, this.data.memberList) })
    })
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
    const { step, info, needIdCard, needDiscount, scheduleId, skuId, isSkuOnly, isGoods, address } = this.data
    if (step === 1) {
      if (isSkuOnly) {
        if (!skuId) {
          wx.showToast({ title: '请选择规格', icon: 'none' })
          return
        }
      } else {
        if (!scheduleId) {
          wx.showToast({ title: '请选择报名时间', icon: 'none' })
          return
        }
      }
      this.setData({ step: 2 })
    } else if (step === 2) {
      if (isGoods) {
        if (!address || !address.name || !address.phone || !address.detail) {
          wx.showToast({ title: '请填写完整收货信息', icon: 'none' })
          return
        }
        if (!/^1\d{10}$/.test(address.phone)) {
          wx.showToast({ title: '请填写正确的11位手机号', icon: 'none' })
          return
        }
      } else {
        if (!info.name) {
          wx.showToast({ title: '请填写姓名', icon: 'none' })
          return
        }
        if (!info.phone) {
          wx.showToast({ title: '请填写手机号码', icon: 'none' })
          return
        }
        if (!/^1\d{10}$/.test(info.phone)) {
          wx.showToast({ title: '请填写正确的11位手机号', icon: 'none' })
          return
        }
        if ((needIdCard && !info.idCard) || (needDiscount && !info.discount)) {
          wx.showToast({ title: '请先填写完整报名信息', icon: 'none' })
          return
        }
        for (let i = 0; i < this.data.memberList.length; i++) {
          const member = this.data.memberList[i]
          if (!member.name || (needIdCard && !member.idCard)) {
            wx.showToast({ title: `请填写第${i + 2}位报名人信息`, icon: 'none' })
            return
          }
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
    const picker = regionPicker.buildRegionPicker(this.data.regionOptions, addr)
    this.setData({
      addressOpen: true,
      regionPickerColumns: picker.columns,
      regionPickerIndexes: picker.indexes,
      addressForm: {
        name: addr.name || '',
        phone: addr.phone || '',
        regionText: regionPicker.regionText(addr),
        regionId: picker.selected ? String(picker.selected.id) : '',
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

  onAddressRegionColumnChange(e) {
    const picker = regionPicker.changeRegionPicker(this.data.regionOptions, {
      columns: this.data.regionPickerColumns,
      indexes: this.data.regionPickerIndexes
    }, Number(e.detail.column), Number(e.detail.value))
    this.setData({ regionPickerColumns: picker.columns, regionPickerIndexes: picker.indexes })
  },

  onAddressRegionChange(e) {
    const indexes = e.detail.value.map(Number)
    const region = regionPicker.selectedRegion({ columns: this.data.regionPickerColumns }, indexes)
    this.setData({
      regionPickerIndexes: indexes,
      'addressForm.regionText': regionPicker.regionText(region),
      'addressForm.regionId': region ? String(region.id) : ''
    })
  },

  async saveAddressNow() {
    const { addressForm } = this.data
    if (!addressForm.name || !addressForm.phone || !addressForm.regionId || !addressForm.detail) {
      wx.showToast({ title: '请填写完整收货信息', icon: 'none' })
      return
    }
    if (!/^1\d{10}$/.test(addressForm.phone)) {
      wx.showToast({ title: '请填写正确的11位手机号', icon: 'none' })
      return
    }
    const region = this.data.regionOptions.find((item) => String(item.id) === String(addressForm.regionId))
    if (!region || region.enabled === false) {
      wx.showToast({ title: '请选择后台已启用地区', icon: 'none' })
      return
    }
    const payload = {
      name: addressForm.name,
      phone: addressForm.phone,
      province: region.province,
      city: region.city,
      district: region.district,
      regionId: region.id,
      regionCode: region.districtCode || region.code || '',
      detail: addressForm.detail,
      isDefault: true
    }
    const addr = this.data.address && this.data.address.id
      ? await store.updateAddress(this.data.address.id, payload)
      : await store.saveAddress(payload)
    this.setData({ address: addr, addressOpen: false })
    wx.showToast({ title: '收货地址已保存', icon: 'none' })
  },

  async confirmPay() {
    if (this.data.submittingPayment) return
    this.setData({ submittingPayment: true })
    const { activity, scheduleId, count, info, couponId, isGoods, address, memberList, useBalance } = this.data
    wx.showLoading({ title: '提交中', mask: true })
    try {
      const order = await store.createOrder({
        activityId: activity.id,
        skuId: this.data.skuId,
        scheduleId,
        count,
        couponId,
        useBalance,
        deferred: true,
        address: isGoods ? address : null,
        participants: isGoods ? `${address.name} ${address.phone}` : [info.name, ...memberList.map((m) => m.name)].join('、')
      })
      wx.hideLoading()
      if (!order) {
        wx.showToast({ title: '下单失败，请重试', icon: 'none' })
        return
      }
      if (order.status === '待付款') await store.payOrder(order.id)
      wx.redirectTo({ url: `/pages/booking-success/booking-success?orderId=${order.id}&deferred=0` })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: e.message || '下单失败', icon: 'none' })
    } finally {
      this.setData({ submittingPayment: false })
    }
  },

  async deferPay() {
    if (this.data.submittingPayment) return
    this.setData({ submittingPayment: true })
    const { activity, scheduleId, count, info, couponId, isGoods, address, memberList, useBalance } = this.data
    wx.showLoading({ title: '提交中', mask: true })
    try {
      const order = await store.createOrder({
        activityId: activity.id,
        skuId: this.data.skuId,
        scheduleId,
        count,
        couponId,
        useBalance,
        deferred: true,
        address: isGoods ? address : null,
        participants: isGoods ? `${address.name} ${address.phone}` : [info.name, ...memberList.map((m) => m.name)].join('、')
      })
      wx.hideLoading()
      if (!order) {
        wx.showToast({ title: '下单失败，请重试', icon: 'none' })
        return
      }
      wx.redirectTo({ url: `/pages/booking-success/booking-success?orderId=${order.id}&deferred=1` })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: e.message || '下单失败', icon: 'none' })
    } finally {
      this.setData({ submittingPayment: false })
    }
  },

  showService() {
    this.setData({ serviceOpen: true })
  },

  closeService() {
    this.setData({ serviceOpen: false })
  }
})
