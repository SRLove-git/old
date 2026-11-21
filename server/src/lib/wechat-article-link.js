export function articleLink(raw) {
  if (!raw) return ''
  try {
    const url = new URL(raw)
    if (!['http:', 'https:'].includes(url.protocol) || url.host !== 'mp.weixin.qq.com' || url.username || url.password) return ''
    url.protocol = 'https:'
    url.hash = ''
    const identity = ['__biz', 'mid', 'idx', 'sn']
    const tracking = ['scene', 'from', 'isappinstalled', 'mpshare', 'srcid', 'sharer_shareinfo',
      'sharer_shareinfo_first', 'sharer_sharetime', 'sharer_shareid', 'subscene', 'clicktime',
      'enterid', 'chksm', 'sessionid', 'ascene', 'lang', 'version', 'devicetype']
    if ([...url.searchParams.keys()].some(key => !identity.includes(key) && !tracking.includes(key))) return ''
    if (/^\/s\/[\w-]+\/?$/.test(url.pathname)) {
      url.pathname = url.pathname.replace(/\/$/, '')
      url.search = ''
    } else if (url.pathname === '/s' && url.searchParams.get('__biz') && /^\d+$/.test(url.searchParams.get('mid'))) {
      if (identity.some(key => url.searchParams.getAll(key).length > 1) ||
          (url.searchParams.has('idx') && !/^[1-9]\d*$/.test(url.searchParams.get('idx')))) return ''
      for (const key of [...url.searchParams.keys()]) {
        if (!identity.includes(key)) url.searchParams.delete(key)
      }
      url.searchParams.sort()
    } else return ''
    return url.href
  } catch {
    return ''
  }
}

export function articleKeys(raw) {
  const link = articleLink(raw)
  if (!link) return []
  const { pathname, searchParams } = new URL(link)
  if (pathname !== '/s') return [link]
  const identity = [searchParams.get('__biz'), searchParams.get('mid'), searchParams.get('idx') || '1']
  return [link, 'article-url|' + identity.map(encodeURIComponent).join('|')]
}
