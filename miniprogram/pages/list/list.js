const store = require('../../utils/store.js')

const STATUS_LABEL = { open: '报名中', grouped: '已成团', full: '已满', ended: '已结束' }
const TIME_FILTERS = [
  { key: 'all', name: '全部时间' },
  { key: 'today', name: '今天' },
  { key: 'week', name: '本周' },
  { key: 'month', name: '本月' }
]
const STATUS_FILTERS = [
  { key: 'all', name: '全部状态' },
  { key: 'open', name: '报名中' },
  { key: 'grouped', name: '已成团' },
  { key: 'full', name: '已满' },
  { key: 'ended', name: '已结束' }
]

function todayStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function activityStatus(a) {
  const today = todayStr()
  const schedules = a.schedules || []
  if (schedules.length === 0) return 'open'
  const future = schedules.filter((s) => (s.full || '') >= today)
  if (future.length === 0) return 'ended'
  const hasRemain = future.some((s) => {
    const remain = s.remaining !== undefined ? s.remaining : (s.totalQuota - s.soldQuota)
    return remain > 0
  })
  if (!hasRemain) return 'full'
  if (a.minGroup > 0 && (a.soldCount || 0) >= a.minGroup) return 'grouped'
  return 'open'
}

function matchTime(a, tf) {
  if (tf === 'all') return true
  const today = todayStr()
  return (a.schedules || []).some((s) => {
    const full = s.full || ''
    if (tf === 'today') return full === today
    if (tf === 'week') {
      const t = new Date(`${today}T00:00:00`)
      const end = new Date(t.getTime() + 7 * 86400000)
      const d = new Date(`${full}T00:00:00`)
      return d >= t && d < end
    }
    if (tf === 'month') {
      const t = new Date(`${today}T00:00:00`)
      const d = new Date(`${full}T00:00:00`)
      return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d >= t
    }
    return true
  })
}

Page({
  data: {
    keyword: '',
    cat: 'all',
    region: 'all',
    timeFilter: 'all',
    statusFilter: 'all',
    activeFilter: '',
    categories: [],
    cities: [],
    timeFilters: TIME_FILTERS,
    statusFilters: STATUS_FILTERS,
    list: [],
    total: 0
  },

  async onLoad(options) {
    await store.ready()
    const cats = store.get().categories
    const categories = Object.keys(cats).map((id) => ({ id: Number(id), ...cats[id] }))
    this.setData({
      cat: options && options.cat ? String(options.cat) : 'all',
      categories,
      cities: this.buildCities()
    })
    this.refresh()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
    const pendingCat = wx.getStorageSync('pendingCat')
    if (pendingCat !== '') {
      this.setData({ cat: String(pendingCat) })
      wx.removeStorageSync('pendingCat')
    }
    this.setData({ cities: this.buildCities() })
    this.refresh()
  },

  buildCities() {
    const cities = []
    store.getActivities().forEach((a) => {
      if (a.city && !cities.includes(a.city)) cities.push(a.city)
    })
    return cities
  },

  refresh() {
    const { keyword, cat, region, timeFilter, statusFilter } = this.data
    const all = store.getActivities()
    const terms = String(keyword || '').trim().toLowerCase().split(/\s+/).filter(Boolean)
    const list = all
      .filter((a) => {
        const okCat = cat === 'all' || String(a.category) === String(cat)
        const okRegion = region === 'all' || a.city === region
        const okTime = matchTime(a, timeFilter)
        const status = activityStatus(a)
        const okStatus = statusFilter === 'all' || status === statusFilter
        const skuNames = (a.skus || []).map((s) => s.name).join(' ')
        const points = (a.points || []).join(' ')
        const text = [a.title, a.city, a.address, a.highlight, a.detail, points, skuNames]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        const okKey = terms.length === 0 || terms.every((t) => text.includes(t))
        return okCat && okRegion && okTime && okStatus && okKey
      })
      .map((a) => {
        const status = activityStatus(a)
        const s0 = (a.schedules && a.schedules[0]) || {}
        return {
          ...a,
          status,
          statusLabel: STATUS_LABEL[status],
          scheduleDate: s0.date || '',
          scheduleWeekday: s0.weekday || '',
          scheduleTime: s0.time || ''
        }
      })
    this.setData({ list, total: list.length })
  },

  onInput(e) {
    this.setData({ keyword: e.detail.value }, () => this.refresh())
  },

  setCat(e) {
    this.setData({ cat: String(e.currentTarget.dataset.id) }, () => this.refresh())
  },

  toggleFilter(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ activeFilter: this.data.activeFilter === key ? '' : key })
  },

  setRegion(e) {
    this.setData({ region: String(e.currentTarget.dataset.id), activeFilter: '' }, () => this.refresh())
  },

  setTimeFilter(e) {
    this.setData({ timeFilter: String(e.currentTarget.dataset.id), activeFilter: '' }, () => this.refresh())
  },

  setStatusFilter(e) {
    this.setData({ statusFilter: String(e.currentTarget.dataset.id), activeFilter: '' }, () => this.refresh())
  },

  clearFilter() {
    this.setData(
      { keyword: '', cat: 'all', region: 'all', timeFilter: 'all', statusFilter: 'all', activeFilter: '' },
      () => this.refresh()
    )
  },

  goDetail(e) {
    wx.navigateTo({ url: `/pages/detail/detail?id=${e.currentTarget.dataset.id}` })
  },

  goBooking(e) {
    wx.navigateTo({ url: `/pages/booking/booking?id=${e.currentTarget.dataset.id}` })
  }
})
