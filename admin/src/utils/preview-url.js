export function resolvePreviewUrl(value, options = {}) {
  const url = String(value || '').trim()
  if (!url || /^(https?:|data:|blob:)/.test(url)) return url

  const legacyAssetUrl = options.legacyAssets && options.legacyAssets[url]
  if (legacyAssetUrl) return legacyAssetUrl

  if (options.production && url.startsWith('/api/')) return `/admin${url}`
  return url.startsWith('/') ? url : `/${url}`
}
