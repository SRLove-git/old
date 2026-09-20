const store = require('../../utils/store.js')

const STATUS = {
  checked: { label: '已签到', cls: 'green' },
  absent: { label: '缺勤', cls: 'red' },
  upcoming: { label: '待上课', cls: 'gray' }
}

Page({
  data: {
    cards: [],
    records: []
  },

  async onShow() {
    await store.ready()
    this.load()
  },

  load() {
    const cards = store.get().cards || []
    const records = []
    cards.forEach((card) => {
      ;(card.attendanceRecords || []).forEach((record) => {
        const status = STATUS[record.status] || STATUS.upcoming
        records.push({
          ...record,
          cardTitle: card.title,
          statusLabel: status.label,
          statusCls: status.cls
        })
      })
    })
    records.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    this.setData({ cards, records })
  },

  goAcademy() {
    wx.switchTab({ url: '/pages/lives/lives' })
  }
})
