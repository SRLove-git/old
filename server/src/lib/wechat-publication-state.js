import { articleKeys, articleLink } from './wechat-article-link.js'

export const officialAccountName = '岁悦里文化科技'

export function isImported(state) {
  return Boolean(state?.importKey || state?.importUrl || state?.sourceVerification)
}

export function withdrawn(record, keys) {
  return [5, 6].includes(record.publishStatus) || recordKeys(record).some(key => keys.has(key))
}

// 本后台每次发一篇。微信历史多图文则按 article_id 和从 1 开始的篇次区分。
export function recordKeys(record) {
  if (!record) return []
  if (isImported(record)) return [record.importKey, ...articleKeys(record.importUrl), ...articleKeys(record.listLink)].filter(Boolean)
  return [record.articleId && `${record.articleId}:1`, record.publicationKey,
    ...(record.articleUrls || []).flatMap(articleKeys)].filter(Boolean)
}

export function attempts(state) {
  return state ? [state, ...(state.history || []).slice().reverse()] : []
}

export function publicationGroups(posts) {
  // 一篇可能同时有历史导入 ID、后台 ID 和已分享的链接。先归组，再看主记录的上下架状态。
  const byKey = new Map()
  const groups = new Set()
  for (const post of posts) {
    const keys = attempts(post.wechat).flatMap(recordKeys)
    const matches = new Set(keys.map(key => byKey.get(key)).filter(Boolean))
    const group = matches.values().next().value || { posts: [], keys: new Set() }
    for (const other of matches) {
      if (other === group) continue
      group.posts.push(...other.posts)
      for (const key of other.keys) { group.keys.add(key); byKey.set(key, group) }
      groups.delete(other)
    }
    group.posts.push(post)
    for (const key of keys) { group.keys.add(key); byKey.set(key, group) }
    groups.add(group)
  }
  for (const group of groups) {
    group.primary = group.posts.find(post => !isImported(post.wechat)) ||
      group.posts.find(post => post.wechat.importKey && post.wechat.confirmedAt) ||
      group.posts.find(post => post.wechat.confirmedAt) || group.posts[0]
  }
  return [...groups]
}

export function publicationView({ primary, posts }, withdrawnKeys, internal) {
  const view = { ...primary }
  const state = primary.wechat
  delete view.wechat
  delete view.aliasIds
  delete view.officialLinkPending
  const aliases = posts.filter(post => post !== primary).map(post => post.id)
  if (aliases.length) view.aliasIds = aliases
  const imported = isImported(state)
  const latest = attempts(state).find(record =>
    imported || record.publishStatus === 0 || [5, 6].includes(record.publishStatus) || record.articleUrls?.length)
  const revoked = latest && withdrawn(latest, withdrawnKeys)
  const permanentLink = record => {
    if (isImported(record)) return record.confirmedAt ? articleLink(record.importUrl) : ''
    return record.publishStatus === 0 ? articleLink(record.articleUrls?.[0]) : ''
  }
  view.officialArticleUrl = latest && !revoked ? permanentLink(latest) : ''
  if (imported) {
    view.source = ['wechat-api', 'operator-confirmed'].includes(state.sourceVerification) ? officialAccountName : ''
    if (revoked) view.status = 0
    if (!view.officialArticleUrl) view.officialLinkPending = !revoked
  }
  if (internal && state) {
    const display = record => {
      const removed = withdrawn(record, withdrawnKeys)
      return { ...record, withdrawn: removed, publicArticleUrl: removed ? '' : permanentLink(record) }
    }
    view.wechat = { ...display(state), history: (state.history || []).map(display) }
  }
  return view
}
