const store = require('../../utils/store.js')

const COURSE_DEFAULTS = {
  live1: { memberPrice: 99, originalPrice: 159, lessonCount: 12, duration: '约240分钟', coverImage: '/assets/event-academy.jpg' },
  live2: { memberPrice: 69, originalPrice: 99, lessonCount: 8, duration: '约160分钟', coverImage: '/assets/event-benefit.jpg' },
  live3: { memberPrice: 129, originalPrice: 199, lessonCount: 10, duration: '约210分钟', coverImage: '/assets/event-travel.jpg' },
  live4: { memberPrice: 79, originalPrice: 129, lessonCount: 9, duration: '约180分钟', coverImage: '/assets/home-hero.jpg' }
}

function decorateCourse(course) {
  const fallback = COURSE_DEFAULTS[course.id] || COURSE_DEFAULTS.live1
  const data = { ...fallback, ...course }
  return {
    ...data,
    memberPrice: Number(data.memberPrice || fallback.memberPrice),
    originalPrice: Number(data.originalPrice || fallback.originalPrice),
    lessonCount: Number(data.lessonCount || fallback.lessonCount),
    duration: data.duration || fallback.duration,
    coverImage: data.coverImage || fallback.coverImage,
    courseType: data.status === 'live' ? '直播课' : (data.status === 'scheduled' ? '即将开课' : '视频课')
  }
}

Page({
  data: {
    live: null,
    activity: null,
    countdown: '',
    playableUrl: '',
    purchased: false,
    lessons: [],
    loading: true
  },

  async onLoad(options) {
    await store.ready()
    const source = store.getLive(options.id)
    if (!source) {
      wx.showToast({ title: '课程不存在', icon: 'none' })
      this.setData({ loading: false })
      return
    }
    const live = decorateCourse(source)
    const activity = live.activityId ? store.getActivity(live.activityId) : null
    const lessons = [
      { title: '课程导学：先了解学习方法', duration: '08:30 · 可试看' },
      { title: '核心技巧：老师分步骤演示', duration: '18:40' },
      { title: '跟练课堂：常见问题讲解', duration: '22:15' },
      { title: '进阶练习：把知识用起来', duration: '16:50' }
    ]
    this.setData({
      live,
      activity,
      lessons,
      playableUrl: live.status === 'live' ? live.streamUrl : live.replayUrl,
      purchased: store.isCoursePurchased(live.id),
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
    if (!live || live.status !== 'scheduled' || !live.startAt) return
    const target = new Date(live.startAt.replace(/-/g, '/')).getTime()
    const diff = target - Date.now()
    if (diff <= 0) {
      this.setData({ countdown: '即将开播' })
      return
    }
    const d = Math.floor(diff / 86400000)
    const h = Math.floor(diff / 3600000) % 24
    const m = Math.floor(diff / 60000) % 60
    this.setData({ countdown: `${d}天 ${h}小时 ${m}分钟` })
  },

  buyCourse() {
    const course = this.data.live
    wx.showModal({
      title: '确认购买课程',
      content: `${course.title}\n会员价 ¥${course.memberPrice}，购买后可永久回看。`,
      confirmText: '立即支付',
      confirmColor: '#b98555',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await store.purchaseLive(course.id)
          this.setData({ purchased: true })
          wx.showToast({ title: '购买成功，已发放计次卡', icon: 'none' })
          store.refresh().catch(() => {})
        } catch (e) {
          wx.showToast({ title: e.message || '购买失败', icon: 'none' })
        }
      }
    })
  },

  addCart() {
    try {
      store.addCourseToCart(this.data.live)
      wx.showToast({ title: '已加入购物车', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: e.message || '加入失败', icon: 'none' })
    }
  },

  remind() {
    const live = this.data.live
    if (!live || !live.id) return
    const key = `suiyueli_live_remind_${live.id}`
    if (wx.getStorageSync(key)) {
      wx.showToast({ title: '已预约过开播提醒', icon: 'none' })
      return
    }
    wx.setStorageSync(key, { title: live.title, startAt: live.startAt, remindedAt: Date.now() })
    wx.showToast({ title: '已预约开播提醒', icon: 'none' })
  },

  goActivity() {
    if (this.data.activity) wx.navigateTo({ url: `/pages/detail/detail?id=${this.data.activity.id}` })
  }
})
