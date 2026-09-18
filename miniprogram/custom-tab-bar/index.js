Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/index/index', text: '首页', emoji: '🏠' },
      { pagePath: '/pages/list/list', text: '找活动', emoji: '🔍' },
      { pagePath: '/pages/appointments/appointments', text: '我的预约', emoji: '📋' },
      { pagePath: '/pages/profile/profile', text: '我的', emoji: '👤' }
    ]
  },
  methods: {
    switchTab(e) {
      const index = Number(e.currentTarget.dataset.index)
      const item = this.data.list[index]
      if (item) {
        wx.switchTab({ url: item.pagePath })
      }
    }
  }
})
