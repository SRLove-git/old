const store = require('../../utils/store.js')

function decorate(item) {
  const regions = store.getActivityRegionNames(item)
  const schedules = Array.isArray(item.schedules) ? item.schedules : []
  const next = schedules
    .slice()
    .sort((a, b) => String(a.full || '').localeCompare(String(b.full || '')))
    .find((schedule) => String(schedule.full || '') >= new Date().toISOString().slice(0, 10)) || schedules[0] || {}

  return {
    ...item,
    art: item.coverImage || '/assets/event-benefit.jpg',
    regionText: regions.join('、') || item.city || '线上/全国',
    scheduleText: next.full
      ? `${next.date || next.full} ${next.weekday || ''} ${next.time || ''}`.trim()
      : (item.time || '长期有效')
  }
}

Page({
  data: {
    list: [],
    loading: true
  },

  async onShow() {
    this.setData({ loading: true })
    try {
      await store.ready()
      await store.refresh()
    } catch (e) {
      // 网络波动时继续使用最近一次成功加载的数据。
    }
    const list = store.getActivities()
      .filter((item) => String(item.category) === '4' && item.status !== 0)
      .map(decorate)
    this.setData({ list, loading: false })
  },

  goDetail(e) {
    wx.navigateTo({ url: `/pages/detail/detail?id=${e.currentTarget.dataset.id}` })
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' })
  }
})
