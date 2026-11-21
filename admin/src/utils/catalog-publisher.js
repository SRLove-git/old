export function isPlatformPublisher(record) {
  return record.publisherType === 'platform' || (!record.publisherType && !record.managerId)
}

export function isOrphanedMerchantPublisher(record) {
  return record.publisherType === 'merchant' && !record.managerId
}

export function matchesPublisher(record, selected) {
  if (selected === 'platform') return isPlatformPublisher(record)
  if (selected === 'orphaned') return isOrphanedMerchantPublisher(record)
  return !isPlatformPublisher(record) && String(selected) === String(record.managerId)
}
