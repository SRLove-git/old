function openContentLink(e) {
  const url = String(e.currentTarget.dataset.url || '').trim()
  if (!url) return
  if (/^https:\/\/mp\.weixin\.qq\.com\/s(?:\/|\?)/.test(url)) {
    const offerCopy = () => wx.showModal({
      title: '当前微信无法打开这篇文章',
      content: '可以复制原文链接，在微信中打开。',
      confirmText: '复制链接',
      success: result => { if (result.confirm) wx.setClipboardData({ data: url }) }
    })
    if (typeof wx.openOfficialAccountArticle === 'function') wx.openOfficialAccountArticle({ url, fail: offerCopy })
    else offerCopy()
    return
  }
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
}

module.exports = { openContentLink }
