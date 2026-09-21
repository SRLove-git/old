const store = require('../../utils/store.js')
const { api } = require('../../utils/request.js')

const STATUS = {
  checked: { label: '已签到', cls: 'checked' },
  absent: { label: '缺勤', cls: 'absent' },
  upcoming: { label: '待上课', cls: 'upcoming' }
}

function pad(value) { return String(value).padStart(2, '0') }
function clockText() {
  const now = new Date()
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}
function maskPhone(value) {
  const phone = String(value || '').replace(/\D/g, '')
  return phone.length === 11 ? `${phone.slice(0, 3)} **** ${phone.slice(7)}` : phone
}

Page({
  data: {
    cards: [], activeCardId: '', currentCard: null,
    memberName: '', memberPhone: '', phoneDisplay: '', needsName: false, needsPhone: false,
    location: null, locationText: '正在获取当前位置…', locating: false,
    submitting: false, canCheckIn: false, clock: '--:--:--', records: []
  },

  async onShow() {
    this.startClock()
    try { await store.refresh() } catch (e) { await store.ready() }
    this.loadPage()
    if (!this.data.location && !this.data.locating) this.requestLocation()
  },
  onHide() { this.stopClock() },
  onUnload() { this.stopClock() },
  startClock() {
    this.stopClock()
    this.setData({ clock: clockText() })
    this.clockTimer = setInterval(() => this.setData({ clock: clockText() }), 1000)
  },
  stopClock() {
    if (this.clockTimer) clearInterval(this.clockTimer)
    this.clockTimer = null
  },

  loadPage() {
    const state = store.get()
    const user = state.user || {}
    const cards = (state.cards || []).map((card) => ({ ...card, remainText: `${Number(card.remain || 0)} / ${Number(card.total || 0)} 次` }))
    const activeCardId = this.data.activeCardId || (cards[0] && cards[0].id) || ''
    const memberName = user.name && user.name !== '微信用户' ? user.name : ''
    const memberPhone = String(user.phone || '')
    this.setData({
      cards, activeCardId, memberName, memberPhone, phoneDisplay: maskPhone(memberPhone),
      needsName: !memberName, needsPhone: !/^1\d{10}$/.test(memberPhone)
    }, () => this.buildCurrent())
  },
  selectCard(e) { this.setData({ activeCardId: e.currentTarget.dataset.id }, () => this.buildCurrent()) },
  buildCurrent() {
    const currentCard = this.data.cards.find((item) => String(item.id) === String(this.data.activeCardId)) || null
    const records = currentCard ? (currentCard.attendanceRecords || []).map((item) => ({
      ...item,
      displayDate: String(item.date || '').slice(5).replace('-', '/'),
      statusLabel: (STATUS[item.status] || STATUS.upcoming).label,
      statusCls: (STATUS[item.status] || STATUS.upcoming).cls,
      typeLabel: item.checkinType === 'makeup' ? '后台补签' : (item.checkinType === 'self' ? '本人签到' : '历史签到')
    })) : []
    this.setData({ currentCard, records: records.slice(0, 5) }, () => this.updateCanCheckIn())
  },
  onNameInput(e) { this.setData({ memberName: String(e.detail.value || '').trim() }, () => this.updateCanCheckIn()) },
  onPhoneInput(e) {
    const memberPhone = String(e.detail.value || '').replace(/\D/g, '').slice(0, 11)
    this.setData({ memberPhone, phoneDisplay: maskPhone(memberPhone) }, () => this.updateCanCheckIn())
  },
  updateCanCheckIn() {
    const { currentCard, memberName, memberPhone, location, submitting } = this.data
    this.setData({ canCheckIn: Boolean(currentCard && Number(currentCard.remain || 0) > 0 && memberName && /^1\d{10}$/.test(memberPhone) && location && !submitting) })
  },

  requestLocation() {
    if (this.data.locating) return
    this.setData({ locating: true, locationText: '正在获取当前位置…' })
    wx.getLocation({
      type: 'gcj02', isHighAccuracy: true, highAccuracyExpireTime: 5000,
      success: (result) => {
        const latitude = Number(result.latitude)
        const longitude = Number(result.longitude)
        const accuracy = Math.round(Number(result.accuracy || 0))
        this.setData({
          locating: false,
          location: { latitude, longitude, accuracy },
          locationText: `定位成功 · ${latitude.toFixed(5)}, ${longitude.toFixed(5)}${accuracy ? ` · 约 ${accuracy} 米` : ''}`
        }, () => this.updateCanCheckIn())
      },
      fail: () => {
        this.setData({ locating: false, location: null, locationText: '定位失败，点击重新定位' }, () => this.updateCanCheckIn())
        wx.getSetting({
          success: (setting) => {
            if (setting.authSetting['scope.userLocation'] !== false) return
            wx.showModal({
              title: '需要位置权限',
              content: '课程签到需要确认到场位置，请在设置中允许使用位置信息。',
              confirmText: '去设置',
              success: (modal) => {
                if (!modal.confirm) return
                wx.openSetting({ success: (opened) => { if (opened.authSetting['scope.userLocation']) this.requestLocation() } })
              }
            })
          }
        })
      }
    })
  },

  async submitCheckIn() {
    if (this.data.submitting) return
    if (!this.data.memberName) return wx.showToast({ title: '请填写姓名', icon: 'none' })
    if (!/^1\d{10}$/.test(this.data.memberPhone)) return wx.showToast({ title: '请填写正确手机号', icon: 'none' })
    if (!this.data.location) {
      this.requestLocation()
      return wx.showToast({ title: '请先完成定位', icon: 'none' })
    }
    if (!this.data.currentCard || Number(this.data.currentCard.remain || 0) <= 0) return
    this.setData({ submitting: true, canCheckIn: false })
    try {
      await api.post(`/cards/${this.data.currentCard.id}/checkin`, {
        memberName: this.data.memberName, memberPhone: this.data.memberPhone,
        latitude: this.data.location.latitude, longitude: this.data.location.longitude, accuracy: this.data.location.accuracy
      })
      wx.showToast({ title: '签到成功', icon: 'success' })
      await store.refresh()
      this.loadPage()
    } catch (e) {
      wx.showToast({ title: e.message || '签到失败，请重试', icon: 'none' })
    } finally {
      this.setData({ submitting: false }, () => this.updateCanCheckIn())
    }
  }
})
