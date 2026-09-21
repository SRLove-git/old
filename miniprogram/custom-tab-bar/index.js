Component({
  data: {
    selected: 0,
    hidden: false,
    list: [
      { pagePath: '/pages/index/index', text: '首页', icon: 'home' },
      { pagePath: '/pages/list/list', text: '全部活动', icon: 'activities' },
      { pagePath: '/pages/lives/lives', text: '线上学堂', icon: 'academy' },
      { pagePath: '/pages/profile/profile', text: '个人中心', icon: 'user' }
    ]
  },
  methods: {
    switchTab(e) {
      const index = Number(e.currentTarget.dataset.index)
      const item = this.data.list[index]
      if (item) {
        if (index === 1) wx.setStorageSync('pendingCat', 'all')
        wx.switchTab({ url: item.pagePath })
      }
    }
  }
})
