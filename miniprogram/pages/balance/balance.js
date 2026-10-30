const store = require('../../utils/store.js')

const DEFAULT_RECHARGE_AMOUNTS = [50, 100, 200, 500]

const TRANSACTION_META = {
  recharge: { title: '余额充值', icon: '充', tone: 'recharge' },
  'order-payment': { title: '余额消费', icon: '支', tone: 'payment' },
  'order-refund': { title: '退款到账', icon: '退', tone: 'refund' }
}

function formatTransactions(transactions = []) {
  return transactions.map((item) => {
    const amount = Number(item.amount || 0)
    const meta = TRANSACTION_META[item.type] || {
      title: amount >= 0 ? '余额到账' : '余额支出',
      icon: amount >= 0 ? '收' : '支',
      tone: amount >= 0 ? 'recharge' : 'payment'
    }
    return {
      ...item,
      displayTitle: item.description || meta.title,
      displayType: meta.title,
      icon: meta.icon,
      tone: meta.tone,
      amountText: `${amount >= 0 ? '+' : '-'}¥${store.money(Math.abs(amount))}`,
      balanceAfterText: store.money(item.balanceAfter)
    }
  })
}

function configuredRechargeAmounts(config = {}) {
  if (!Array.isArray(config.balanceRechargeAmounts)) return DEFAULT_RECHARGE_AMOUNTS
  const amounts = config.balanceRechargeAmounts
    .map(Number)
    .filter((amount) => Number.isFinite(amount) && amount >= 1 && amount <= 50000)
    .slice(0, 8)
  return amounts.length ? [...new Set(amounts)] : DEFAULT_RECHARGE_AMOUNTS
}

Page({
  data: {
    balanceText: '0.00',
    points: 0,
    amounts: [50, 100, 200, 500],
    selectedAmount: 100,
    rechargeAmountText: '100.00',
    customAmount: '',
    transactions: [],
    charging: false,
    serviceOpen: false
  },

  async onShow() {
    try {
      await this.refreshBalance()
    } catch (error) {
      if (error.code !== 'AUTH_REQUIRED') wx.showToast({ title: error.message || '余额信息刷新失败，请稍后重试', icon: 'none' })
    }
  },

  onUnload() {
    this.unloaded = true
    this.balanceVersion = (this.balanceVersion || 0) + 1
  },

  async refreshBalance() {
    const version = this.balanceVersion = (this.balanceVersion || 0) + 1
    let user, transactions, config
    try {
      await store.ready()
      ;[user, transactions, config] = await Promise.all([
        store.refreshUserProfile().then(() => ({ ...(store.get().user || {}) })),
        store.getBalanceTransactions(),
        store.refreshConfig().catch(() => store.get().config || {})
      ])
    } catch (error) {
      if (version !== this.balanceVersion || this.unloaded) return false
      throw error
    }
    if (version !== this.balanceVersion || this.unloaded) return false
    // 余额与流水都成功后一起展示，失败时保留上一组数据，不伪装成空流水。
    const amounts = configuredRechargeAmounts(config)
    const hasCustomAmount = Boolean(this.data.customAmount)
    let selectedAmount = 0
    if (!hasCustomAmount) {
      selectedAmount = amounts.includes(Number(this.data.selectedAmount))
        ? Number(this.data.selectedAmount)
        : amounts[0]
    }
    this.setData({
      balanceText: store.money(user.balance),
      points: Number(user.points || 0),
      amounts,
      selectedAmount,
      rechargeAmountText: this.data.customAmount
        ? this.data.rechargeAmountText
        : store.money(selectedAmount),
      transactions: formatTransactions(transactions)
    })
    return true
  },

  selectAmount(e) {
    const amount = Number(e.currentTarget.dataset.amount)
    this.setData({ selectedAmount: amount, rechargeAmountText: store.money(amount), customAmount: '' })
  },

  inputAmount(e) {
    const value = e.detail.value
    const amount = Number(value)
    this.setData({
      customAmount: value,
      selectedAmount: 0,
      rechargeAmountText: Number.isFinite(amount) && amount > 0 ? store.money(amount) : '0.00'
    })
  },

  async recharge() {
    if (this.data.charging) return
    const amount = Number(this.data.customAmount || this.data.selectedAmount)
    if (!Number.isFinite(amount) || amount < 1 || amount > 50000) {
      wx.showToast({ title: '请输入1至50000元', icon: 'none' })
      return
    }
    // 支付完成前发出的页面刷新不能覆盖到账后的余额。
    this.balanceVersion = (this.balanceVersion || 0) + 1
    this.setData({ charging: true })
    try {
      await store.rechargeBalance(amount)
      if (this.unloaded) return
      try {
        if (await this.refreshBalance()) wx.showToast({ title: '充值成功', icon: 'success' })
      } catch (error) {
        wx.showToast({ title: '充值已到账，余额信息刷新失败，请稍后重试', icon: 'none' })
      }
    } catch (error) {
      if (!this.unloaded) wx.showToast({ title: error.message || '充值未完成', icon: 'none' })
    } finally {
      if (!this.unloaded) this.setData({ charging: false })
    }
  },

  showService() {
    this.setData({ serviceOpen: true })
  },

  closeService() {
    this.setData({ serviceOpen: false })
  }
})
