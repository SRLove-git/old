const store = require('../../utils/store.js')

Page({
  data: {
    type: 'news',
    title: '政策资讯',
    posts: []
  },

  async onLoad(options) {
    await store.ready()
    const type = options && options.type === 'video' ? 'video' : 'news'
    const title = type === 'video' ? '视频推荐' : '政策资讯'
    const posts = store.getContentPosts()
      .filter((item) => item.type === type)
      .sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')))
    this.setData({ type, title, posts })
    wx.setNavigationBarTitle({ title })
  },

  goDetail(e) {
    wx.navigateTo({ url: `/pages/content-detail/content-detail?id=${e.currentTarget.dataset.id}` })
  }
})
