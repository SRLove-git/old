Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/index/index', text: '首页', emoji: '⌂' },
      { pagePath: '/pages/list/list', text: '全部活动', emoji: '☆' },
      { pagePath: '/pages/lives/lives', text: '线上学堂', emoji: '▣' },
      { pagePath: '/pages/profile/profile', text: '个人中心', emoji: '◎' }
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
