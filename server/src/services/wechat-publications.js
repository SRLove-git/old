import { httpError } from '../lib/http.js'
import { wechatMp } from '../lib/wechat-mp.js'
import { importWechatPublications } from '../store.js'

import { articleLink } from '../lib/wechat-article-link.js'

export function importPublicationLink({ title, url, publishedAt, accountConfirmed, postId } = {}, operator) {
  if (accountConfirmed !== true) throw httpError(400, '请打开原文，核对发表账号为“岁悦里文化科技”')
  const originalUrl = articleLink(url)
  if (!originalUrl || !String(title || '').trim()) throw httpError(400, '请填写原标题和微信文章链接')
  const date = String(publishedAt || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date) throw httpError(400, '请填写文章实际发表日期')
  return importWechatPublications([{ title: String(title).trim(), url: originalUrl, publishedAt: date, postId }],
    { manual: true, operatorId: operator.id })
}

export async function syncPublications(client = wechatMp, savePage = importWechatPublications) {
  let offset = 0
  let added = 0
  let skipped = 0
  let total
  do {
    let page
    try {
      page = await client.listPublications(offset)
    } catch (error) {
      if (error.wechatCode === 48001) throw httpError(403, '微信返回 48001：当前账号无权读取发表记录，可用文章链接导入')
      throw error
    }
    total = page.total
    if (!page.items.length && offset < total) throw httpError(502, '微信发表记录分页中断，可重新同步')
    const rows = []
    for (const item of page.items) {
      const articles = item.content?.news_item
      if (!item.article_id || !Array.isArray(articles)) { skipped++; continue }
      for (const [index, article] of articles.entries()) {
        const identity = { key: `${item.article_id}:${index + 1}`, listLink: articleLink(article?.url) }
        if (Number(article?.is_deleted) === 1) {
          rows.push({ ...identity, deleted: true })
          continue
        }
        if (!String(article?.title || '').trim()) { skipped++; continue }
        const row = { ...identity, title: article.title }
        if (Object.hasOwn(article, 'digest')) row.summary = String(article.digest || '')
        if (Object.hasOwn(article, 'thumb_url')) {
          const cover = String(article.thumb_url || '').replace(/^http:\/\//, 'https://')
          row.coverImage = cover.startsWith('https://') ? cover : ''
        }
        if (Number(item.update_time) > 0) row.updatedAt = Number(item.update_time)
        rows.push(row)
      }
    }
    added += savePage(rows).added
    offset += page.items.length
  } while (offset < total)
  return { added, skipped }
}

let currentSync
export function syncOfficialAccount() {
  currentSync ||= syncPublications().finally(() => { currentSync = null })
  return currentSync
}

export function startPublicationSync() {
  if (process.env.WECHAT_MP_SYNC_ENABLED !== 'true') return
  const run = () => syncOfficialAccount().catch(error => console.warn('[公众号资讯同步]', error.message))
  void run()
  setInterval(run, 30 * 60 * 1000).unref()
}
