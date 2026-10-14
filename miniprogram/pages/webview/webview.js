Page({
  data: { url: '' },

  onLoad(options) {
    const url = decodeURIComponent(String(options.url || ''))
    if (!url.startsWith('https://')) {
      wx.showToast({ title: '链接地址无效', icon: 'none' })
      this.backTimer = setTimeout(() => {
        const pages = getCurrentPages()
        const current = pages.length ? pages[pages.length - 1] : null
        if (current && current.route === 'pages/webview/webview') wx.navigateBack()
      }, 800)
      return
    }
    this.setData({ url })
  },

  onUnload() {
    if (this.backTimer) clearTimeout(this.backTimer)
    this.backTimer = null
  }
})
