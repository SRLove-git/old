export function serviceModeOfOffering(offering) {
  if (offering?.serviceMode) return offering.serviceMode
  if (Number(offering?.category) === 5) return 'delivery'
  if (offering?.city === '线上' || offering?.address === '线上直播') return 'online'
  if (Number(offering?.category) === 4) return 'verify_code'
  return 'checkin'
}

export function pendingStatusForMode(mode) {
  if (mode === 'delivery') return '待发货'
  if (mode === 'online') return '待使用'
  if (mode === 'verify_code') return '待核销'
  return '待签到'
}
