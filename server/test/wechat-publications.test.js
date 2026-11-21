import assert from 'node:assert/strict'
import test from 'node:test'
import { syncPublications } from '../src/services/wechat-publications.js'

test('发表列表按消息和篇次分页，保留撤回、缺失原文及更新日期', async () => {
  const pages = [
    { article_id: 'A', update_time: 1725123600, content: { news_item: [
      { title: '甲', url: 'http://mp.weixin.qq.com/s/article_1', thumb_url: 'http://example.com/cover' },
      { title: '乙', url: 'https://mp.weixin.qq.com/s/article_2?tempkey=ephemeral', digest: '', thumb_url: '' }
    ] } },
    { article_id: 'B', content: { news_item: [{ is_deleted: true }] } }
  ]
  const saved = []
  const offsets = []
  const result = await syncPublications({ listPublications: async offset => {
    offsets.push(offset)
    return { total: 2, items: [pages[offset]] }
  } }, rows => { saved.push(...rows); return { added: rows.filter(row => !row.deleted).length } })
  assert.deepEqual(offsets, [0, 1])
  assert.deepEqual(result, { added: 2, skipped: 0 })
  assert.deepEqual(saved.map(row => row.key), ['A:1', 'A:2', 'B:1'])
  assert.equal(saved[1].listLink, '')
  assert.equal(saved[0].publishedAt, undefined)
  assert.equal(saved[0].updatedAt, 1725123600)
  assert.equal(saved[0].summary, undefined)
  assert.equal(saved[1].summary, '')
  assert.equal(saved[1].coverImage, '')
  assert.equal(saved[2].deleted, true)
})

test('发表列表权限不足会报告微信错误且不会写入空列表', async () => {
  const client = { listPublications: () => { throw Object.assign(new Error(), { wechatCode: 48001 }) } }
  await assert.rejects(syncPublications(client, () => assert.fail('不得写入')), /48001/)
})
