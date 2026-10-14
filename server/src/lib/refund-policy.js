function refundAmount(order, ratio) {
  return Number((Number(order.payAmount || 0) * ratio).toFixed(2))
}

export function scheduleDaysUntil(schedule, now = Date.now()) {
  if (!schedule || !schedule.full) return 999
  return Math.ceil((new Date(`${schedule.full}T00:00:00`).getTime() - Number(now)) / 86400000)
}

export function calculateRefund(order, activity, now = Date.now()) {
  if (!activity) return { can: false, ratio: 0, amount: 0, reason: '活动不存在' }
  if (['已核销', '待评价', '已完成', '已退款', '已取消', '退款中'].includes(order.status)) {
    return { can: false, ratio: 0, amount: 0, reason: '当前状态不可退款' }
  }

  const rule = activity.refundRule || {}
  if (rule.type === 'always') {
    return { can: true, ratio: 1, amount: refundAmount(order, 1), reason: '未核销前可随时全额退款' }
  }
  if (rule.type === 'never') {
    return { can: false, ratio: 0, amount: 0, reason: '该活动不支持退款' }
  }

  const days = scheduleDaysUntil(order.schedule, now)
  if (rule.type === 'ladder') {
    const ladder = (rule.ladder || []).slice().sort((a, b) => b.days - a.days)
    for (const rung of ladder) {
      if (days < rung.days) continue
      if (rung.rate <= 0) return { can: false, ratio: 0, amount: 0, reason: '已进入不可退时段' }
      return {
        can: true,
        ratio: rung.rate,
        amount: refundAmount(order, rung.rate),
        reason: `距出发${days}天，可退${Math.round(rung.rate * 100)}%`
      }
    }
    return { can: false, ratio: 0, amount: 0, reason: '已进入不可退时段' }
  }

  const fullDays = rule.fullDays || 0
  const partialDays = rule.partialDays || 0
  const partialRate = rule.partialRate || 0
  if (days >= fullDays) {
    return { can: true, ratio: 1, amount: refundAmount(order, 1), reason: `距开始${days}天，可全额退款` }
  }
  if (days >= partialDays && partialRate > 0) {
    return {
      can: true,
      ratio: partialRate,
      amount: refundAmount(order, partialRate),
      reason: `距开始不足${fullDays}天，可退${Math.round(partialRate * 100)}%`
    }
  }
  return { can: false, ratio: 0, amount: 0, reason: '距开始时间过近，不可退款' }
}
