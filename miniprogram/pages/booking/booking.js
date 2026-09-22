const store = require('../../utils/store.js')

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
    memberList: [],
    payOpen: false
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

    const isSkuOnly = activity.sellType === 'sku'
    const hasSku = activity.hasSku || isSkuOnly
    const skuId = options.sku || (hasSku && activity.skus && activity.skus.length ? activity.skus[0].id : '')
    const sku = hasSku ? (activity.skus || []).find((s) => s.id === skuId) || activity.skus[0] : null
    const memberPrice = sku ? sku.memberPrice : activity.memberPrice
    const firstParticipant = state.participants[0] || { id: null, name: '', phone: '', idCard: '' }

    this.setData({
      id,
      activity,
      isSkuOnly,
      skuId: skuId || '',
      scheduleId: !isSkuOnly && activity.schedules && activity.schedules.length ? activity.schedules[0].id : '',
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
      refundText: store.refundRuleText(activity.refundRule) || activity.refund || '',
      info: {
        participantId: firstParticipant.id,
        name: firstParticipant.name || '',
        phone: state.user.phone || '',
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
      participants: decorateParticipants(state.participants, this.data.info, this.data.memberList),
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
    const schedule = (this.data.activity.schedules || []).find((s) => s.id === scheduleId)
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
          phone: store.get().user.phone || '',
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
        // 账号手机号是脱敏存储的（如 138****6688）：未改动直接放行；
        // 用户主动修改过，则要求填 11 位全号且与账号脱敏号一致
        const accountPhone = store.get().user.phone
        if (info.phone !== accountPhone) {
          if (!/^1\d{10}$/.test(info.phone)) {
            wx.showToast({ title: '请填写正确的11位手机号', icon: 'none' })
            return
          }
          if (store.maskPhone(info.phone) !== accountPhone) {
            wx.showToast({ title: '手机号需与账号绑定手机一致', icon: 'none' })
            return
          }
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
    const { activity, scheduleId, count, info, couponId, isGoods, address, memberList } = this.data
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
        participants: isGoods ? `${address.name} ${address.phone}` : [info.name, ...memberList.map((m) => m.name)].join('、')
      })
      wx.hideLoading()
      if (!order) {
        wx.showToast({ title: '下单失败，请重试', icon: 'none' })
        return
      }
      wx.redirectTo({ url: `/pages/booking-success/booking-success?orderId=${order.id}&deferred=0` })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: e.message || '下单失败', icon: 'none' })
    }
  },

  async deferPay() {
    const { activity, scheduleId, count, info, couponId, isGoods, address, memberList } = this.data
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
    }
  },

  showService() {
    const a = store.getAssistant()
    wx.showModal({
      title: '报名遇到问题？',
      content: `客服电话：${a.phone}`,
      showCancel: false
    })
  }
})
