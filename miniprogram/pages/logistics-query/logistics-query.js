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
    this.invalidateQuery()
    this.setData({ query: e.detail.value, searched: false, errorText: '' })
  },

  clearQuery() {
    this.invalidateQuery()
    this.setData({ query: '', searched: false, order: null, logistics: null, events: [], errorText: '' })
  },

  invalidateQuery() {
    this.queryVersion = (this.queryVersion || 0) + 1
    this.setData({ loading: false })
  },

  onUnload() {
    this.queryVersion = (this.queryVersion || 0) + 1
  },

  pasteQuery() {
    wx.getClipboardData({
      success: (result) => {
        const query = this.normalizeQuery(result.data)
        if (!query) {
          wx.showToast({ title: '剪贴板中没有订单号', icon: 'none' })
          return
        }
        this.invalidateQuery()
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

    const version = this.queryVersion = (this.queryVersion || 0) + 1
    const isCurrent = () => version === this.queryVersion
    this.setData({ query, loading: true, searched: false, order: null, logistics: null, events: [], errorText: '' })
    try {
      await store.requireLogin()
      // 后台发货会修改运单号和订单状态，不能用首次进入小程序时的订单缓存。
      const orders = await store.refreshOrders()
      if (!isCurrent()) return
      const key = query.toUpperCase()
      const order = (orders || []).find((item) => {
        return String(item.id || '').toUpperCase() === key || String(item.trackingNo || '').toUpperCase() === key
      })

      if (!order) {
        const logistics = await store.queryLogistics(query)
        if (!isCurrent()) return
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

      let logistics = await store.getOrderLogistics(order.id)
      if (!isCurrent()) return
      let refreshError = null
      const lastUpdate = Math.max(...['lastSyncedAt', 'lastQueryAt'].map((key) => {
        const time = Date.parse(String(logistics && logistics[key] || '').replace(' ', 'T'))
        return Number.isFinite(time) ? time : 0
      }))
      // 最近查询/推送的轨迹可直接使用；旧轨迹由服务端向快递鸟刷新。
      if (!lastUpdate || Date.now() - lastUpdate >= 30000) {
        try {
          logistics = await store.refreshOrderLogistics(order.id) || logistics
        } catch (error) {
          if (error.code === 'AUTH_REQUIRED' || [401, 403].includes(error.statusCode)) throw error
          refreshError = error
          // 另一端可能刚刷新过；限流时只重读缓存，不连续调用快递查询接口。
          if (error.statusCode === 429) {
            logistics = await store.getOrderLogistics(order.id).catch(() => null) || logistics
          }
        }
      }
      if (!isCurrent()) return
      const events = [...((logistics && logistics.events) || [])].reverse()
      const errorText = refreshError
        ? (logistics ? (refreshError.statusCode === 429 ? '刷新较频繁，已显示最近一次物流，请稍后再试' : '暂时无法更新物流，已显示最近一次记录') : (refreshError.message || '物流信息正在同步，请稍后再试'))
        : (logistics ? logistics.subscriptionError || '' : '物流信息正在同步，请稍后再试')
      this.setData({
        searched: true,
        order,
        logistics,
        events,
        errorText
      })
    } catch (error) {
      if (!isCurrent() || (error && error.code === 'AUTH_REQUIRED')) return
      this.setData({ searched: true, errorText: error.message || '查询失败，请稍后重试' })
    } finally {
      if (isCurrent()) this.setData({ loading: false })
    }
  },

  goOrderDetail() {
    if (!this.data.order) return
    wx.navigateTo({ url: `/pages/order-detail/order-detail?id=${this.data.order.id}` })
  }
})
