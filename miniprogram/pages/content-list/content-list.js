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
    await store.refreshConfig().catch(() => {})
    const type = options && options.type === 'video' ? 'video' : 'news'
    const title = type === 'video' ? '视频推荐' : '政策资讯'
    const posts = store.getContentPosts()
      .filter((item) => item.type === type)
      .sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')))
    this.setData({ type, title, posts, brandName: store.getBrand().chineseName })
    wx.setNavigationBarTitle({ title })
  },

  async onShow() {
    try {
      await store.refreshConfig()
      this.setData({ brandName: store.getBrand().chineseName })
    } catch (e) {}
  },

  goDetail(e) {
    wx.navigateTo({ url: `/pages/content-detail/content-detail?id=${e.currentTarget.dataset.id}` })
  }
})
