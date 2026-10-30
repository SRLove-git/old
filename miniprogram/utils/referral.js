function normalizeManagerId(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return ''
  const id = String(value).trim()
  return /^[1-9]\d{0,19}$/.test(id) ? id : ''
}

function parseReferral(query = {}) {
  if (!query || typeof query !== 'object') return null
  if (Object.prototype.hasOwnProperty.call(query, 'ref')) {
    const managerId = normalizeManagerId(query.ref)
    return managerId ? { managerId, source: 2 } : null
  }
  if (typeof query.scene !== 'string' || query.scene.length > 512) return null
  let scene
  try {
    scene = decodeURIComponent(query.scene)
  } catch (error) {
    return null
  }
  const referrals = scene.split('&').filter((part) => part.startsWith('ref='))
  if (referrals.length !== 1) return null
  const managerId = normalizeManagerId(referrals[0].slice(4))
  return managerId ? { managerId, source: 1 } : null
}

module.exports = { normalizeManagerId, parseReferral }
