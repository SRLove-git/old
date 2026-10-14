const store = require('../../utils/store.js')

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false,
      observer(value) {
        if (value) this.syncAssistant()
      }
    }
  },

  data: {
    assistant: {}
  },

  lifetimes: {
    attached() {
      this.setData({ assistant: store.getAssistant() })
    }
  },

  methods: {
    async syncAssistant() {
      this.setData({ assistant: store.getAssistant() })
      try {
        await store.refreshConfig()
        if (this.data.visible) this.setData({ assistant: store.getAssistant() })
      } catch (e) {
        // 网络异常时保留上一次成功同步的客服信息。
      }
    },

    noop() {},

    close() {
      this.triggerEvent('close')
    },

    copyContact(e) {
      const field = e.currentTarget.dataset.field
      const value = String(this.data.assistant[field] || '').trim()
      if (!value) {
        wx.showToast({ title: '暂无联系方式', icon: 'none' })
        return
      }
      const label = field === 'phone' ? '客服电话' : '微信号'
      wx.setClipboardData({
        data: value,
        success: () => wx.showToast({ title: `${label}已复制`, icon: 'success' })
      })
    }
  }
})
