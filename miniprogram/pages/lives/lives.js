const store = require('../../utils/store.js')

function decorateCourse(course) {
  const data = { ...course }
  return {
    ...data,
    coverImage: data.coverImage || '',
    memberPrice: Number(data.memberPrice || 0),
    originalPrice: Number(data.originalPrice || data.memberPrice || 0),
    lessonCount: Number(data.lessonCount || 0),
    duration: data.duration || '',
    courseType: data.status === 'live' ? '直播课' : (data.status === 'scheduled' ? '即将开课' : '视频课'),
    purchased: typeof data.purchased === 'boolean' ? data.purchased : store.isCoursePurchased(data.id)
  }
}

Page({
  data: {
    activeTab: 'all',
    allCourses: [],
    list: []
  },

  async onLoad() {
    await store.ready()
    this.refresh()
  },

  async onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    await store.ready()
    await Promise.all([store.refreshLives().catch(() => {}), store.refreshConfig().catch(() => {})])
    const pendingTab = wx.getStorageSync('academyTab')
    if (pendingTab) {
      this.setData({ activeTab: pendingTab })
      wx.removeStorageSync('academyTab')
    }
    this.refresh()
  },

  refresh() {
    const allCourses = store.getLives().map(decorateCourse)
    const list = this.data.activeTab === 'mine' ? allCourses.filter((item) => item.purchased) : allCourses
    this.setData({ allCourses, list })
  },

  setTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab }, () => this.refresh())
  },

  addCourseCart(e) {
    const course = this.data.allCourses.find((item) => String(item.id) === String(e.currentTarget.dataset.id))
    try {
      store.addCourseToCart(course)
      wx.showToast({ title: '已加入购物车', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: err.message || '加入失败', icon: 'none' })
    }
  },

  goRoom(e) {
    wx.navigateTo({ url: `/pages/live-room/live-room?id=${e.currentTarget.dataset.id}` })
  }
})
