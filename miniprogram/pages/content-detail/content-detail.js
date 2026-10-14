const store = require('../../utils/store.js')

Page({
  data: { post: null, brandName: '' },

  async onLoad(options) {
    await store.ready()
    await store.refreshConfig().catch(() => {})
    const post = store.getContentPost(options.id)
    if (!post) {
      wx.showToast({ title: '内容不存在或已下架', icon: 'none' })
      return
    }
    const contentBlocks = Array.isArray(post.contentBlocks) && post.contentBlocks.length
      ? post.contentBlocks.map((block, index) => ({ ...block, _key: `${block.type}-${index}` }))
      : (post.content ? [{ type: 'text', text: post.content, _key: 'legacy-text' }] : [])
    this.setData({ post: { ...post, contentBlocks }, brandName: store.getBrand().chineseName })
    wx.setNavigationBarTitle({ title: post.type === 'video' ? '视频详情' : '政策资讯' })
  },

  async onShow() {
    try {
      await store.refreshConfig()
      this.setData({ brandName: store.getBrand().chineseName })
    } catch (e) {}
  },

  copyOriginal() {
    const url = this.data.post && this.data.post.originalUrl
    if (!url) {
      wx.showToast({ title: '暂未填写原文链接', icon: 'none' })
      return
    }
    wx.setClipboardData({ data: url })
  },

  openContentLink(e) {
    const url = String(e.currentTarget.dataset.url || '').trim()
    if (!url) return
    if (/^https:\/\//.test(url)) {
      wx.navigateTo({ url: `/pages/webview/webview?url=${encodeURIComponent(url)}` })
      return
    }
    if (url.startsWith('/pages/')) {
      const pagePath = url.split('?')[0]
      const tabPages = ['/pages/index/index', '/pages/list/list', '/pages/lives/lives', '/pages/profile/profile']
      if (tabPages.includes(pagePath)) wx.switchTab({ url: pagePath })
      else wx.navigateTo({ url })
    }
  },

  onShareAppMessage() {
    const post = this.data.post || {}
    return { title: post.title || `${this.data.brandName}资讯`, path: `/pages/content-detail/content-detail?id=${post.id || ''}` }
  }
})
