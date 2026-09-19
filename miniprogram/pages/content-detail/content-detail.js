const store = require('../../utils/store.js')

Page({
  data: { post: null },

  async onLoad(options) {
    await store.ready()
    const post = store.getContentPost(options.id)
    if (!post) {
      wx.showToast({ title: '内容不存在或已下架', icon: 'none' })
      return
    }
    this.setData({ post })
    wx.setNavigationBarTitle({ title: post.type === 'video' ? '视频详情' : '政策资讯' })
  },

  copyOriginal() {
    const url = this.data.post && this.data.post.originalUrl
    if (!url) {
      wx.showToast({ title: '暂未填写原文链接', icon: 'none' })
      return
    }
    wx.setClipboardData({ data: url })
  },

  onShareAppMessage() {
    const post = this.data.post || {}
    return { title: post.title || '岁悦里资讯', path: `/pages/content-detail/content-detail?id=${post.id || ''}` }
  }
})
