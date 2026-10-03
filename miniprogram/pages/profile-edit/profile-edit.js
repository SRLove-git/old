const store = require('../../utils/store.js')

Page({
  data: {
    name: '',
    originalName: '',
    saving: false,
    loading: true
  },

  async onLoad() {
    try {
      await store.ready()
      await store.refreshUserProfile()
      const name = String(store.get().user.name || '')
      this.setData({ name, originalName: name, loading: false })
    } catch (error) {
      this.setData({ loading: false })
      if (error && error.code === 'AUTH_REQUIRED') {
        wx.navigateBack()
        return
      }
      wx.showToast({ title: error.message || '加载失败', icon: 'none' })
    }
  },

  onUnload() {
    if (this.backTimer) clearTimeout(this.backTimer)
    this.backTimer = null
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value })
  },

  clearName() {
    if (!this.data.saving) this.setData({ name: '' })
  },

  async save() {
    if (this.data.saving || this.data.loading) return
    const name = String(this.data.name || '').trim()
    if (!name) return wx.showToast({ title: '请输入用户名', icon: 'none' })
    if (name.length > 20) return wx.showToast({ title: '用户名最多20个字符', icon: 'none' })
    if (name === this.data.originalName) {
      wx.navigateBack()
      return
    }

    this.setData({ saving: true })
    try {
      await store.updateUserName(name)
      wx.showToast({ title: '保存成功', icon: 'success' })
      this.backTimer = setTimeout(() => wx.navigateBack(), 500)
    } catch (error) {
      this.setData({ saving: false })
      wx.showToast({ title: error.message || '保存失败', icon: 'none' })
    }
  }
})
