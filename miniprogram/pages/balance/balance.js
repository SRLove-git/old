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
    await store.ready()
    const user = store.get().user || {}
    const [transactions, config] = await Promise.all([
      store.getBalanceTransactions().catch(() => []),
      store.refreshConfig().catch(() => store.get().config || {})
    ])
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
    this.setData({ charging: true })
    try {
      await store.rechargeBalance(amount)
      const user = store.get().user || {}
      const transactions = await store.getBalanceTransactions()
      this.setData({
        balanceText: store.money(user.balance),
        transactions: formatTransactions(transactions)
      })
      wx.showToast({ title: '充值成功', icon: 'success' })
    } catch (error) {
      wx.showToast({ title: error.message || '充值未完成', icon: 'none' })
    } finally {
      this.setData({ charging: false })
    }
  },

  showService() {
    this.setData({ serviceOpen: true })
  },

  closeService() {
    this.setData({ serviceOpen: false })
  }
})
