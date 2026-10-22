const store = require('../../utils/store.js')

function decorateCourse(course) {
  const data = { ...course }
  const lessons = (Array.isArray(data.lessons) ? data.lessons : [])
    .filter((lesson) => Number(lesson.status) === 1)
    .map((lesson, index) => ({ ...lesson, order: index + 1, duration: lesson.duration || '时长待定' }))
  return {
    ...data,
    memberPrice: Number(data.memberPrice || 0),
    originalPrice: Number(data.originalPrice || data.memberPrice || 0),
    lessonCount: lessons.length || Number(data.lessonCount || 0),
    lessons,
    duration: data.duration || '',
    coverImage: data.coverImage || '',
    courseType: data.status === 'live' ? '直播课' : (data.status === 'scheduled' ? '即将开课' : '视频课')
  }
}

Page({
  data: {
    id: '',
    live: null,
    activity: null,
    countdown: '',
    playableUrl: '',
    purchased: false,
    lessons: [],
    selectedLesson: null,
    loading: true,
    copy: {}
  },

  async onLoad(options) {
    await store.ready()
    this.setData({ id: String(options.id || '') })
    await Promise.all([store.refreshLives().catch(() => {}), store.refreshConfig().catch(() => {})])
    this.loadCourse()
    this.timer = setInterval(() => this.updateCountdown(), 1000)
  },

  loadCourse() {
    const source = store.getLive(this.data.id)
    if (!source) {
      wx.showToast({ title: '课程不存在', icon: 'none' })
      this.setData({ live: null, loading: false })
      return
    }
    const live = decorateCourse(source)
    const activity = live.activityId ? store.getActivity(live.activityId) : null
    const lessons = live.lessons || []
    const purchased = store.isCoursePurchased(live.id)
    const selectedLesson = lessons.find((lesson) => (purchased || lesson.isPreview) && lesson.videoUrl) || null
    const courseUrl = live.status === 'live' ? live.streamUrl : live.replayUrl
    this.setData({
      live,
      activity,
      lessons,
      selectedLesson,
      playableUrl: selectedLesson ? selectedLesson.videoUrl : (purchased ? courseUrl : ''),
      purchased,
      loading: false,
      copy: store.getCopy()
    })
    this.updateCountdown()
  },

  async onShow() {
    try {
      await store.ready()
      await Promise.all([store.refreshLives(), store.refreshConfig()])
    } catch (e) {}
    if (this.data.id) this.loadCourse()
  },

  playLesson(event) {
    const lesson = this.data.lessons[Number(event.currentTarget.dataset.index)]
    if (!lesson) return
    if (!this.data.purchased && !lesson.isPreview) {
      wx.showToast({ title: '购买课程后可观看本节', icon: 'none' })
      return
    }
    if (!lesson.videoUrl) {
      wx.showToast({ title: '本节视频暂未上传', icon: 'none' })
      return
    }
    this.setData({ selectedLesson: lesson, playableUrl: lesson.videoUrl })
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

  async buyCourse() {
    const course = this.data.live
    try {
      await store.requireLogin()
    } catch (error) {
      return
    }
    wx.showModal({
      title: '确认购买课程',
      content: `${course.title}\n会员价 ¥${course.memberPrice}，购买后可永久回看。`,
      confirmText: '立即支付',
      confirmColor: '#b98555',
      success: (res) => {
        if (!res.confirm) return
        const balance = Number(store.get().user.balance || 0)
        if (balance > 0) {
          wx.showActionSheet({
            itemList: [`使用余额抵扣（可用 ¥${store.money(balance)}）`, '仅使用微信支付'],
            success: (choice) => this.payCourse(choice.tapIndex === 0)
          })
        } else {
          this.payCourse(false)
        }
      }
    })
  },

  async payCourse(useBalance) {
    try {
      await store.purchaseLive(this.data.live.id, useBalance)
      await store.refreshLives()
      this.loadCourse()
      wx.showToast({ title: '购买成功，已发放计次卡', icon: 'none' })
    } catch (e) {
      wx.showToast({ title: e.message || '购买失败', icon: 'none' })
    }
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
