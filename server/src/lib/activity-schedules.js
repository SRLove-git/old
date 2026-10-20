import { badRequest, nowText } from './domain-values.js'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function validateActivityScheduleDates(activity, today = nowText().slice(0, 10)) {
  if (activity?.sellType !== 'date') return

  const schedules = Array.isArray(activity.schedules) ? activity.schedules : []
  schedules.forEach((schedule, index) => {
    const full = String(schedule?.full || '').trim()
    if (!DATE_PATTERN.test(full)) throw badRequest(`请填写第 ${index + 1} 个场次的有效日期`)
    if (full < today) throw badRequest(`第 ${index + 1} 个场次只能选择今天或未来日期`)
  })
}
