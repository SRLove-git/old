const { openContentLink } = require('../../utils/content-link.js')
const store = require('../../utils/store.js')

Page({
  data: { id: '', post: null, brandName: '', bodyLoading: false },

  async onLoad(options) {
    await store.ready()
    this.setData({ id: String(options.id || '') })
    this.loadPost()
    this.loadBody()
  },

  applyPost(post) {
    if (!post) {
      this.setData({ post: null, bodyLoading: false })
      return
    }
    const contentBlocks = Array.isArray(post.contentBlocks) && post.contentBlocks.length
      ? post.contentBlocks.map((block, index) => ({ ...block, _key: `${block.type}-${index}` }))
      : (post.content ? [{ type: 'text', text: post.content, _key: 'legacy-text' }] : [])
    this.setData({ post: { ...post, contentBlocks }, brandName: store.getBrand().chineseName, bodyLoading: false })
    wx.setNavigationBarTitle({ title: post.type === 'video' ? '视频详情' : '政策资讯' })
  },

  loadPost() {
    const post = store.getContentPost(this.data.id)
    if (post) this.applyPost(post)
    return post
  },

  // 首页接口只返回卡片信息，正文在这里按需拉取；拉取过就会进缓存，再次进入秒开。
  async loadBody() {
    const id = this.data.id
    if (!id) return
    this.setData({ bodyLoading: true })
    let post = null
    let failed = false
    try {
      post = await store.fetchContentPost(id)
    } catch (error) {
      failed = true
    }
    if (this.data.id !== id) return
    if (post) {
      this.applyPost(post)
      return
    }
    if (this.data.post) {
      this.setData({ bodyLoading: false })
      return
    }
    this.setData({ post: null, bodyLoading: false })
    wx.showToast({ title: failed ? '内容加载失败，请稍后重试' : '内容不存在或已下架', icon: 'none' })
  },

  async onShow() {
    try {
      await store.ready()
      await store.refreshHome()
    } catch (e) {}
    if (this.data.id) this.loadPost()
  },

  copyOriginal() {
    const url = this.data.post && this.data.post.originalUrl
    if (!url) {
      wx.showToast({ title: '暂未填写原文链接', icon: 'none' })
      return
    }
    wx.setClipboardData({ data: url })
  },

  openContentLink,

  onShareAppMessage() {
    const post = this.data.post || {}
    return { title: post.title || `${this.data.brandName}资讯`, path: `/pages/content-detail/content-detail?id=${post.id || ''}` }
  }
})
