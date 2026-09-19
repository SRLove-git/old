const store = require('../../utils/store.js')

Page({
  data: {
    largeMode: true,
    live: null,
    activity: null,
    countdown: '',
    loading: true
  },

  async onLoad(options) {
    await store.ready()
    const live = store.getLive(options.id)
    if (!live) {
      wx.showToast({ title: '直播不存在或无权查看', icon: 'none' })
      this.setData({ loading: false })
      return
    }
    const activity = live.activityId ? store.getActivity(live.activityId) : null
    this.setData({
      largeMode: store.get().largeMode,
      live,
      activity,
      loading: false
    })
    this.updateCountdown()
    this.timer = setInterval(() => this.updateCountdown(), 1000)
  },

  onUnload() {
    if (this.timer) clearInterval(this.timer)
  },

  updateCountdown() {
    const live = this.data.live
    if (!live || live.status !== 'scheduled' || !live.startAt) {
      this.setData({ countdown: '' })
      return
    }
    const target = new Date(live.startAt.replace(/-/g, '/')).getTime()
    const diff = target - Date.now()
    if (diff <= 0) {
      this.setData({ countdown: '即将开播' })
      return
    }
    const d = Math.floor(diff / 86400000)
    const h = Math.floor(diff / 3600000) % 24
    const m = Math.floor(diff / 60000) % 60
    const s = Math.floor(diff / 1000) % 60
    this.setData({ countdown: `${d}天 ${h}时 ${m}分 ${s}秒` })
  },

  remind() {
    wx.showToast({ title: '已预约，开播前提醒你', icon: 'none' })
  },

  goActivity() {
    if (this.data.activity) {
      wx.navigateTo({ url: `/pages/detail/detail?id=${this.data.activity.id}` })
    }
  }
})
