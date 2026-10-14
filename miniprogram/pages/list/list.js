const store = require('../../utils/store.js')

const STATUS_LABEL = { open: '即将开始', grouped: '报名中', full: '已满', ended: '已过期' }
const TIME_FILTERS = [
  { key: 'all', name: '全部时间', shortName: '时间' },
  { key: 'today', name: '今天', shortName: '今天' },
  { key: 'week', name: '本周', shortName: '本周' },
  { key: 'month', name: '本月', shortName: '本月' }
]
const STATUS_FILTERS = [
  { key: 'all', name: '全部状态', shortName: '状态' },
  { key: 'open', name: '即将开始', shortName: '即将开始' },
  { key: 'grouped', name: '报名中', shortName: '报名中' },
  { key: 'full', name: '已满' },
  { key: 'ended', name: '已过期' }
]

function todayStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function activityStatus(a) {
  if (a.offeringType === 'product') return Number(a.stock || 0) > 0 ? 'open' : 'full'
  if (store.isActivityExpired(a)) return 'ended'
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
  if (a.offeringType === 'product') return tf === 'all'
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

function nextSchedule(activity) {
  const schedules = (activity.schedules || []).slice().sort((a, b) => String(a.full || '').localeCompare(String(b.full || '')))
  return schedules.find((schedule) => (schedule.full || '') >= todayStr()) || schedules[schedules.length - 1] || {}
}

function dateGroupLabel(schedule) {
  if (!schedule.full) return '长期有效'
  const parts = schedule.full.split('-')
  const weekday = String(schedule.weekday || '').replace('周', '星期')
  return `${parts[1]}月${parts[2]}日 ${weekday}`
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
    groups: [],
    regionName: '地区',
    timeName: '时间',
    statusName: '状态',
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

  async onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
    const pendingCat = wx.getStorageSync('pendingCat')
    if (pendingCat !== '') {
      this.setData({ cat: String(pendingCat) })
      wx.removeStorageSync('pendingCat')
    }
    try {
      await store.refreshHome()
    } catch (e) {
      await store.ready()
    }
    const cats = store.get().categories
    this.setData({
      categories: Object.keys(cats).map((id) => ({ id: Number(id), ...cats[id] })),
      cities: this.buildCities()
    })
    this.refresh()
  },

  buildCities() {
    return store.getRegions().map((region) => ({ id: region.id, name: region.name }))
  },

  refresh() {
    const { keyword, cat, region, timeFilter, statusFilter } = this.data
    const all = store.getCatalogItems().filter((item) => Number(item.status ?? 1) === 1)
    const terms = String(keyword || '').trim().toLowerCase().split(/\s+/).filter(Boolean)
    const list = all
      .filter((a) => {
        const isOnline = a.city === '线上' || a.address === '线上直播'
        const okCat = cat === 'all' || String(a.category) === String(cat)
        const okRegion = store.activityInRegion(a, region)
        const okTime = matchTime(a, timeFilter)
        const status = activityStatus(a)
        const okStatus = statusFilter === 'all' || status === statusFilter
        const skuNames = (a.skus || []).map((s) => s.name).join(' ')
        const points = (a.points || []).join(' ')
        const text = [a.title, a.city, store.getActivityRegionNames(a).join(' '), a.address, a.highlight, a.detail, points, skuNames]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        const okKey = terms.length === 0 || terms.every((t) => text.includes(t))
        return !isOnline && okCat && okRegion && okTime && okStatus && okKey
      })
      .map((a) => {
        const status = activityStatus(a)
        const s0 = nextSchedule(a)
        return {
          ...a,
          isProduct: a.offeringType === 'product',
          city: store.getActivityRegionNames(a).join('、') || a.city || '线上/全国',
          art: store.assetUrl(a.coverImage) || ({ 1: '/assets/event-local.jpg', 2: '/assets/event-travel.jpg', 3: '/assets/event-academy.jpg', 4: '/assets/event-benefit.jpg', 5: '/assets/event-benefit.jpg' })[a.category] || '/assets/event-local.jpg',
          status,
          statusLabel: a.offeringType === 'product' ? (status === 'full' ? '售罄' : '在售') : STATUS_LABEL[status],
          scheduleFull: s0.full || '',
          scheduleDate: s0.date || '',
          scheduleWeekday: s0.weekday || '',
          scheduleTime: s0.time || '',
          scheduleLine: a.offeringType === 'product' ? '商品文创 · 支持配送' : (s0.full ? `${s0.date}(${s0.weekday || ''}) ${s0.time || ''}` : (a.time || '长期有效')),
          soldText: a.offeringType === 'product' ? `${a.soldCount || 0}人已购买` : `${a.soldCount || 0}人已报名`,
          actionText: a.offeringType === 'product' ? '立即购买' : '立即报名',
          buyerAvatars: (a.buyers || []).slice(0, 3)
        }
      })
      .sort((a, b) => Number(a.status === 'ended') - Number(b.status === 'ended')
        || String(a.scheduleFull || '9999').localeCompare(String(b.scheduleFull || '9999')))
    const grouped = new Map()
    list.forEach((item) => {
      const key = item.isProduct ? 'products' : (item.scheduleFull || 'ongoing')
      if (!grouped.has(key)) grouped.set(key, {
        key,
        label: item.isProduct ? '品质好物' : dateGroupLabel({ full: item.scheduleFull, weekday: item.scheduleWeekday }),
        countUnit: item.isProduct ? '件商品' : '场活动',
        items: []
      })
      grouped.get(key).items.push(item)
    })
    this.setData({ list, groups: [...grouped.values()], total: list.length })
  },

  onInput(e) {
    this.setData({ keyword: e.detail.value }, () => this.refresh())
  },

  clearKeyword() {
    this.setData({ keyword: '' }, () => this.refresh())
  },

  setCat(e) {
    this.setData({ cat: String(e.currentTarget.dataset.id) }, () => this.refresh())
  },

  toggleFilter(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ activeFilter: this.data.activeFilter === key ? '' : key })
  },

  setRegion(e) {
    this.setData({ region: String(e.currentTarget.dataset.id), regionName: e.currentTarget.dataset.name || '地区', activeFilter: '' }, () => this.refresh())
  },

  setTimeFilter(e) {
    this.setData({ timeFilter: String(e.currentTarget.dataset.id), timeName: e.currentTarget.dataset.name || '时间', activeFilter: '' }, () => this.refresh())
  },

  setStatusFilter(e) {
    this.setData({ statusFilter: String(e.currentTarget.dataset.id), statusName: e.currentTarget.dataset.name || '状态', activeFilter: '' }, () => this.refresh())
  },

  clearFilter() {
    this.setData(
      { keyword: '', cat: 'all', region: 'all', timeFilter: 'all', statusFilter: 'all', activeFilter: '', regionName: '地区', timeName: '时间', statusName: '状态' },
      () => this.refresh()
    )
  },

  goDetail(e) {
    wx.navigateTo({ url: `/pages/detail/detail?id=${e.currentTarget.dataset.id}` })
  },

  async goBooking(e) {
    const activity = store.getActivity(e.currentTarget.dataset.id)
    if (store.isActivityExpired(activity)) {
      wx.showToast({ title: '活动已过期，无法报名', icon: 'none' })
      return
    }
    try {
      await store.requireLogin()
    } catch (error) {
      return
    }
    wx.navigateTo({ url: `/pages/booking/booking?id=${e.currentTarget.dataset.id}` })
  },

  addCart(e) {
    const activity = store.getActivity(e.currentTarget.dataset.id)
    try {
      store.addActivityToCart(activity)
      wx.showToast({ title: '已加入购物车', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: err.message || '加入失败', icon: 'none' })
    }
  },

  onShareAppMessage() {
    return { title: store.getCopy().shareActivityTitle || '', path: '/pages/list/list' }
  }
})
