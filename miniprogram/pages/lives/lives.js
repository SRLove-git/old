const store = require('../../utils/store.js')

const COURSE_DEFAULTS = {
  live1: { memberPrice: 99, originalPrice: 159, lessonCount: 12, duration: '约240分钟', category: '手机摄影', coverImage: '/assets/event-academy.jpg' },
  live2: { memberPrice: 69, originalPrice: 99, lessonCount: 8, duration: '约160分钟', category: '健康生活', coverImage: '/assets/event-benefit.jpg' },
  live3: { memberPrice: 129, originalPrice: 199, lessonCount: 10, duration: '约210分钟', category: '文化旅行', coverImage: '/assets/event-travel.jpg' },
  live4: { memberPrice: 79, originalPrice: 129, lessonCount: 9, duration: '约180分钟', category: '智能生活', coverImage: '/assets/home-hero.jpg' }
}

function decorateCourse(course) {
  const fallback = COURSE_DEFAULTS[course.id] || COURSE_DEFAULTS.live1
  const data = { ...fallback, ...course }
  return {
    ...data,
    coverImage: data.coverImage || fallback.coverImage,
    memberPrice: Number(data.memberPrice || fallback.memberPrice),
    originalPrice: Number(data.originalPrice || fallback.originalPrice),
    lessonCount: Number(data.lessonCount || fallback.lessonCount),
    duration: data.duration || fallback.duration,
    courseType: data.status === 'live' ? '直播课' : (data.status === 'scheduled' ? '即将开课' : '视频课'),
    purchased: store.isCoursePurchased(data.id)
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
