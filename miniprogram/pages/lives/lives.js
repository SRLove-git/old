const store = require('../../utils/store.js')

const STATUS = {
  live: { label: '直播中', cls: 'live' },
  scheduled: { label: '预告', cls: 'scheduled' },
  ended: { label: '已结束', cls: 'ended' }
}

Page({
  data: {
    largeMode: true,
    list: []
  },

  async onLoad() {
    await store.ready()
    this.refresh()
  },

  async onShow() {
    await store.ready()
    this.refresh()
  },

  refresh() {
    const order = { live: 0, scheduled: 1, ended: 2 }
    const list = store.getLives()
      .map((l) => {
        const st = STATUS[l.status] || { label: l.status, cls: '' }
        return {
          ...l,
          statusLabel: st.label,
          statusCls: st.cls
        }
      })
      .sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3))
    this.setData({
      largeMode: store.get().largeMode,
      list
    })
  },

  goRoom(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/live-room/live-room?id=${id}` })
  }
})
