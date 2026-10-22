const store = require('../../utils/store.js')

Page({
  data: {
    type: 'news',
    title: '政策资讯',
    posts: [],
    brandName: ''
  },

  async onLoad(options) {
    await store.ready()
    const type = options && options.type === 'video' ? 'video' : 'news'
    const title = type === 'video' ? '视频推荐' : '政策资讯'
    this.setData({ type, title })
    this.loadPosts()
    wx.setNavigationBarTitle({ title })
  },

  loadPosts() {
    const type = this.data.type
    const posts = store.getContentPosts()
      .filter((item) => item.type === type)
      .sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')))
    this.setData({ posts, brandName: store.getBrand().chineseName })
  },

  async onShow() {
    try {
      await store.ready()
      await store.refreshHome()
    } catch (e) {}
    this.loadPosts()
  },

  goDetail(e) {
    wx.navigateTo({ url: `/pages/content-detail/content-detail?id=${e.currentTarget.dataset.id}` })
  }
})
