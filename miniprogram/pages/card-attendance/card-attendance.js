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
function dateText() {
  const now = new Date()
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  return `${now.getMonth() + 1}月${now.getDate()}日 星期${weekdays[now.getDay()]}`
}
const MOBILE = /^1\d{10}$/
function cardRecords(card) {
  return (card?.attendanceRecords || []).slice().sort((a, b) =>
    Number(b.status === 'checked') - Number(a.status === 'checked') ||
    String(b.checkedAt || b.date || '').localeCompare(String(a.checkedAt || a.date || ''))
  ).slice(0, 5).map((item) => ({
    ...item,
    displayDate: String(item.date || '').slice(5).replace('-', '/'),
    statusLabel: (STATUS[item.status] || STATUS.upcoming).label,
    statusCls: (STATUS[item.status] || STATUS.upcoming).cls,
    typeLabel: item.checkinType === 'makeup' ? '后台补签' : (item.checkinType === 'self' ? '本人签到' : '历史签到')
  }))
}

Page({
  data: {
    cards: [], activeCardId: '', currentCard: null,
    memberName: '', memberPhone: '', phoneDisplay: '', needsName: false, needsPhone: false,
    location: null, locationText: '点击选择签到地址', locating: false,
    submitting: false, canCheckIn: false, infoReady: false, stepsDone: 0, profileLoading: true, profileError: '',
    actionHint: '请先完善签到信息', successMessage: '',
    clock: '--:--:--', today: '', records: []
  },

  async onShow() {
    this.startClock()
    await this.refreshProfile()
  },
  async refreshProfile() {
    const owner = store.getCurrentUserId()
    if (this.owner && this.owner !== owner) {
      this.owner = ''
      this.updateForm({ cards: [], activeCardId: '', currentCard: null, records: [], location: null, locationText: '点击选择签到地址', memberName: '', memberPhone: '', successMessage: '' })
    }
    this.updateForm({ profileLoading: true, profileError: '' })
    try {
      const state = await store.refreshUserProfile()
      this.loadPage(state)
    } catch (e) {
      this.updateForm({ profileLoading: false, profileError: e.message || '会员课程资料读取失败' })
    }
  },
  onHide() { this.stopClock() },
  onUnload() { this.stopClock() },
  startClock() {
    this.stopClock()
    this.setData({ clock: clockText(), today: dateText() })
    this.clockTimer = setInterval(() => this.setData({ clock: clockText() }), 1000)
  },
  stopClock() {
    if (this.clockTimer) clearInterval(this.clockTimer)
    this.clockTimer = null
  },

  loadPage(state) {
    const user = state.user || {}
    const sameOwner = Boolean(user.id && this.owner === user.id)
    this.owner = user.id
    const savedName = String(user.name || '').trim()
    const needsName = !savedName || savedName === '微信用户'
    const savedPhone = store.normalizePhone(user.phone)
    const needsPhone = !MOBILE.test(savedPhone)
    const cards = state.cards || []
    const card = cards.find(item => item.id === this.data.activeCardId) || cards[0] || null
    this.updateForm({
      cards, activeCardId: card?.id || '', currentCard: card, records: cardRecords(card),
      needsName, needsPhone, phoneDisplay: needsPhone ? '' : store.formatPhoneDisplay(savedPhone),
      memberName: needsName ? (sameOwner ? this.data.memberName : '') : savedName,
      memberPhone: needsPhone ? (sameOwner ? this.data.memberPhone : '') : savedPhone,
      profileLoading: false, profileError: ''
    })
  },
  selectCard(e) {
    if (this.data.submitting) return
    const card = this.data.cards.find(item => String(item.id) === String(e.currentTarget.dataset.id))
    if (card) this.updateForm({ activeCardId: card.id, currentCard: card, records: cardRecords(card), successMessage: '' })
  },
  onNameInput(e) { this.updateForm({ memberName: e.detail.value }) },
  onPhoneInput(e) { this.updateForm({ memberPhone: String(e.detail.value || '').replace(/\D/g, '').slice(0, 11) }) },
  updateForm(patch) {
    const { currentCard, memberName, memberPhone, location, locating, submitting, profileLoading, profileError } = { ...this.data, ...patch }
    const infoReady = Boolean(memberName.trim() && MOBILE.test(memberPhone))
    const stepsDone = Number(infoReady) + Number(Boolean(location))
    const now = new Date()
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    const todaySession = (currentCard?.attendanceRecords || []).find(row => row.date === date)
    const checkedToday = todaySession?.status === 'checked'
    let reason = ''
    if (submitting) reason = '正在提交签到…'
    else if (profileLoading || profileError) reason = profileError || '正在读取课程资料…'
    else if (checkedToday) reason = '本课程今日已签到'
    else if (!currentCard || Number(currentCard.remain || 0) <= 0) reason = '本课程剩余签到次数不足'
    else if (!memberName.trim()) reason = '请填写签到人姓名'
    else if (!MOBILE.test(memberPhone)) reason = '请填写完整的 11 位手机号'
    else if (!location || locating) reason = '请先选择本次签到地址'
    this.setData({ ...patch, infoReady, stepsDone, canCheckIn: !reason, actionHint: reason || '信息已完成，可以签到' })
  },

  requestLocation() {
    if (this.data.locating || this.data.submitting) return
    this.updateForm({ locating: true, successMessage: '' })
    wx.chooseLocation({
      success: (result) => {
        const latitude = Number(result.latitude)
        const longitude = Number(result.longitude)
        const name = String(result.name || '').trim()
        const address = String(result.address || '').trim()
        const locationText = [address, name && !address.includes(name) ? name : ''].filter(Boolean).join(' · ')
        this.updateForm({ locating: false, location: { latitude, longitude, address: locationText }, locationText: locationText || '已选择签到地址' })
      },
      fail: (error) => {
        const cancelled = String(error && error.errMsg || '').includes('cancel')
        this.updateForm({ locating: false, locationText: this.data.location ? this.data.locationText : (cancelled ? '未选择地址，点击重新选择' : '定位失败，点击重新定位') })
        if (cancelled) return
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
    if (!this.data.canCheckIn) return
    const { currentCard, memberName, memberPhone, location } = this.data
    this.updateForm({ submitting: true })
    try {
      const card = await api.post(`/cards/${encodeURIComponent(currentCard.id)}/checkin`, {
        memberName: memberName.trim(), memberPhone, latitude: location.latitude,
        longitude: location.longitude, location: location.address
      })
      const cards = this.data.cards.map(item => item.id === card.id ? card : item)
      this.updateForm({ cards, currentCard: card, records: cardRecords(card), successMessage: `签到成功 · ${clockText()}` })
      wx.showToast({ title: '签到成功', icon: 'success' })
      await store.refreshUserProfile().catch(() => {})
    } catch (e) {
      wx.showToast({ title: e.message || '签到失败，请重试', icon: 'none' })
    } finally {
      this.updateForm({ submitting: false })
    }
  }
})
