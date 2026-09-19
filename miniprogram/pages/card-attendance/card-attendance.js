const store = require('../../utils/store.js')

const STATUS = {
  checked: { label: '已签到', cls: 'checked' },
  absent: { label: '缺勤', cls: 'absent' },
  upcoming: { label: '待上课', cls: 'upcoming' }
}

Page({
  data: {
    cards: [],
    activeCardId: '',
    currentCard: null,
    summary: {},
    filter: 'all',
    filters: [
      { key: 'all', label: '全部' },
      { key: 'checked', label: '已签到' },
      { key: 'absent', label: '缺勤' },
      { key: 'upcoming', label: '待上课' }
    ],
    records: []
  },

  async onShow() {
    try {
      await store.refresh()
    } catch (e) {
      await store.ready()
    }
    this.loadCards()
  },

  loadCards() {
    const cards = (store.get().cards || []).map((card) => ({
      ...card,
      used: Math.max(0, Number(card.total || 0) - Number(card.remain || 0))
    }))
    const activeCardId = this.data.activeCardId || (cards[0] && cards[0].id) || ''
    this.setData({ cards, activeCardId }, () => this.buildCurrent())
  },

  selectCard(e) {
    this.setData({ activeCardId: e.currentTarget.dataset.id, filter: 'all' }, () => this.buildCurrent())
  },

  buildCurrent() {
    const currentCard = this.data.cards.find((item) => String(item.id) === String(this.data.activeCardId)) || null
    if (!currentCard) {
      this.setData({ currentCard: null, summary: {}, records: [] })
      return
    }
    const rawRecords = (currentCard.attendanceRecords || []).map((item) => ({
      ...item,
      displayDate: String(item.date || '').slice(5),
      statusLabel: (STATUS[item.status] || STATUS.upcoming).label,
      statusCls: (STATUS[item.status] || STATUS.upcoming).cls
    }))
    const checked = rawRecords.filter((item) => item.status === 'checked').length
    const absent = rawRecords.filter((item) => item.status === 'absent').length
    const completed = checked + absent
    const total = Number(currentCard.total || 0)
    const remain = Number(currentCard.remain || 0)
    const used = Math.max(0, total - remain)
    const summary = {
      total,
      used,
      remain,
      checked,
      absent,
      attendanceRate: completed ? Math.round(checked / completed * 100) : 0,
      useRate: total ? Math.min(100, Math.round(used / total * 100)) : 0
    }
    this.setData({ currentCard, summary }, () => this.applyFilter(rawRecords))
  },

  setFilter(e) {
    this.setData({ filter: e.currentTarget.dataset.key }, () => {
      const rawRecords = (this.data.currentCard.attendanceRecords || []).map((item) => ({
        ...item,
        displayDate: String(item.date || '').slice(5),
        statusLabel: (STATUS[item.status] || STATUS.upcoming).label,
        statusCls: (STATUS[item.status] || STATUS.upcoming).cls
      }))
      this.applyFilter(rawRecords)
    })
  },

  applyFilter(records) {
    const filter = this.data.filter
    this.setData({ records: filter === 'all' ? records : records.filter((item) => item.status === filter) })
  },

  goMemberCode() {
    wx.navigateTo({ url: '/pages/member-code/member-code' })
  }
})
