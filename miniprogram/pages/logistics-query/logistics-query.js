const store = require('../../utils/store.js')

Page({
  data: {
    query: '',
    loading: false,
    searched: false,
    order: null,
    logistics: null,
    events: [],
    errorText: '',
    brandName: ''
  },

  async onLoad(options) {
    await store.ready()
    await store.refreshConfig().catch(() => {})
    this.setData({ brandName: store.getBrand().chineseName })
    const query = this.normalizeQuery(options.query || '')
    if (query) {
      this.setData({ query })
      this.queryLogistics()
    }
  },

  async onShow() {
    try {
      await store.refreshConfig()
      this.setData({ brandName: store.getBrand().chineseName })
    } catch (e) {}
  },

  normalizeQuery(value) {
    return String(value || '').replace(/\s+/g, '').trim()
  },

  onInput(e) {
    this.setData({ query: e.detail.value, searched: false, errorText: '' })
  },

  clearQuery() {
    this.setData({ query: '', searched: false, order: null, logistics: null, events: [], errorText: '' })
  },

  pasteQuery() {
    wx.getClipboardData({
      success: (result) => {
        const query = this.normalizeQuery(result.data)
        if (!query) {
          wx.showToast({ title: '剪贴板中没有订单号', icon: 'none' })
          return
        }
        this.setData({ query, searched: false, errorText: '' })
      },
      fail: () => wx.showToast({ title: '读取剪贴板失败，请手动输入', icon: 'none' })
    })
  },

  async queryLogistics() {
    if (this.data.loading) return
    const query = this.normalizeQuery(this.data.query)
    if (!query) {
      wx.showToast({ title: '请输入订单号', icon: 'none' })
      return
    }

    this.setData({ query, loading: true, searched: false, order: null, logistics: null, events: [], errorText: '' })
    try {
      await store.requireLogin()
      await store.refreshUserProfile()
      const key = query.toUpperCase()
      const order = (store.get().orders || []).find((item) => {
        return String(item.id || '').toUpperCase() === key || String(item.trackingNo || '').toUpperCase() === key
      })

      if (!order) {
        const logistics = await store.queryLogistics(query)
        const events = (logistics && logistics.events) || []
        this.setData({
          searched: true,
          order: {
            id: '',
            title: '快递物流',
            trackingNo: logistics.trackingNo || query,
            carrier: logistics.carrier || '自动识别',
            external: true
          },
          logistics: {
            ...logistics,
            lastSyncedAt: logistics.queriedAt || ''
          },
          events,
          errorText: events.length ? '' : (logistics.reason || '暂未获取到物流轨迹，请稍后再试')
        })
        return
      }

      if (!order.trackingNo && !order.logisticsShipmentId) {
        this.setData({
          searched: true,
          order,
          errorText: order.status === '待发货' ? '订单正在等待商家发货，发货后即可查询物流' : '该订单暂无物流信息'
        })
        return
      }

      let logistics = null
      try {
        logistics = await store.getOrderLogistics(order.id)
      } catch (error) {
        logistics = null
      }
      const events = [...((logistics && logistics.events) || [])].reverse()
      this.setData({
        searched: true,
        order,
        logistics,
        events,
        errorText: logistics ? '' : '物流信息正在同步，请稍后再试'
      })
    } catch (error) {
      if (error && error.code === 'AUTH_REQUIRED') return
      this.setData({ searched: true, errorText: error.message || '查询失败，请稍后重试' })
    } finally {
      this.setData({ loading: false })
    }
  },

  goOrderDetail() {
    if (!this.data.order) return
    wx.navigateTo({ url: `/pages/order-detail/order-detail?id=${this.data.order.id}` })
  }
})
