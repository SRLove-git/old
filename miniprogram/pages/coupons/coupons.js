const store = require('../../utils/store.js')

const TABS = [
  { key: 'available', label: '可使用' },
  { key: 'history', label: '使用记录' },
  { key: 'invalid', label: '已失效' }
]

function shortDate(value) {
  return String(value || '').slice(0, 10)
}

function money(value) {
  const amount = Number(value || 0)
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

function normalizeCoupon(coupon) {
  const status = String(coupon.status || 'unused')
  const available = status === 'unused' && coupon.templateStatus !== 0
  const history = status === 'used' || status === 'locked'
  const category = coupon.scopeCategory ? store.getCategory(coupon.scopeCategory) : null
  const activity = coupon.scopeProductId ? store.getActivity(coupon.scopeProductId) : null
  let scopeLabel = '全场活动可用'
  if (Number(coupon.type) === 3) scopeLabel = category?.name ? `限${category.name}使用` : '限指定分类使用'
  if (Number(coupon.type) === 4) scopeLabel = activity?.title ? `限${activity.title}使用` : '限指定活动使用'

  return {
    ...coupon,
    valueText: money(coupon.value),
    thresholdText: Number(coupon.minAmount || 0) > 0 ? `满 ¥${money(coupon.minAmount)} 可用` : '无门槛',
    scopeLabel,
    validText: coupon.expireAt ? `${shortDate(coupon.expireAt)} 到期` : '长期有效',
    claimedText: shortDate(coupon.claimedAt) || '—',
    usedText: shortDate(coupon.usedAt || coupon.lockedAt),
    tabKey: available ? 'available' : history ? 'history' : 'invalid',
    stateClass: available ? 'is-available' : status === 'locked' ? 'is-locked' : status === 'used' ? 'is-used' : 'is-invalid',
    statusLabel: coupon.statusLabel || (available ? '可使用' : history ? '已使用' : '已失效'),
    available
  }
}

Page({
  data: {
    activeTab: 'available',
    tabs: TABS.map((item) => ({ ...item, count: 0 })),
    coupons: [],
    visibleCoupons: [],
    availableCount: 0,
    loading: true
  },

  async onShow() {
    await this.loadCoupons()
  },

  async onPullDownRefresh() {
    try {
      await store.refreshUserProfile()
      await this.loadCoupons(false)
    } finally {
      wx.stopPullDownRefresh()
    }
  },

  async loadCoupons(waitReady = true) {
    try {
      if (waitReady) await store.ready()
      const coupons = (store.get().coupons || []).map(normalizeCoupon)
      coupons.sort((left, right) => {
        if (left.available !== right.available) return left.available ? -1 : 1
        return String(left.expireAt || '9999-12-31').localeCompare(String(right.expireAt || '9999-12-31'))
      })
      const tabs = TABS.map((item) => ({
        ...item,
        count: coupons.filter((coupon) => coupon.tabKey === item.key).length
      }))
      this.setData({ coupons, tabs, availableCount: tabs[0].count, loading: false }, () => this.applyFilter())
    } catch (error) {
      this.setData({ loading: false })
      wx.showToast({ title: error.message || '优惠券加载失败', icon: 'none' })
    }
  },

  switchTab(event) {
    const activeTab = event.currentTarget.dataset.key
    if (!activeTab || activeTab === this.data.activeTab) return
    this.setData({ activeTab }, () => this.applyFilter())
  },

  applyFilter() {
    const visibleCoupons = this.data.coupons.filter((coupon) => coupon.tabKey === this.data.activeTab)
    this.setData({ visibleCoupons })
  },

  goList() {
    wx.switchTab({ url: '/pages/list/list' })
  }
})
