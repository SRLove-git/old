import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'suiyueli-content-wechat-'))
process.env.DATA_FILE = path.join(directory, 'data.json')
const store = await import(`../src/store.js?content-wechat=${Date.now()}`)

test.after(() => fs.rmSync(directory, { recursive: true, force: true }))

test('发表状态晚于微信列表回写时，小程序只展示一篇且保留旧分享 ID', () => {
  const url = 'https://mp.weixin.qq.com/s/same-post'
  store.importWechatPublications([{ key: 'late:1', listLink: url, title: '微信端' }])
  const imported = store.listContentPosts().find(row => row.title === '微信端')
  assert.equal(imported.officialArticleUrl, '')
  const local = store.createContentPost({ title: '运营端' })
  store.updateContentWechat(local.id, { publishStatus: 0, articleUrls: [url + '?scene=1'] })
  const visible = store.listContentPosts({ publishedOnly: true }).filter(row => row.officialArticleUrl === url)
  assert.equal(visible.length, 1)
  assert.equal(visible[0].id, local.id)
  assert.deepEqual(visible[0].aliasIds, [imported.id])
  store.updateContentPost(imported.id, { status: 0 })
  assert.equal(store.listContentPosts({ publishedOnly: true }).some(row => row.id === imported.id || row.id === local.id), false)
  store.deleteContentPost(local.id)
  assert.equal(store.importWechatPublications([{ key: 'late:1', title: '重复同步' }]).added, 0)
  assert.equal(store.findContentPost(imported.id), null)
})

test('重复同步更新公众号信息并保留下架状态，删除后不会被定时任务重新添加', () => {
  const story = { key: 'A:1', title: '原标题', listLink: 'https://mp.weixin.qq.com/s/archive' }
  assert.equal(store.importWechatPublications([story]).added, 1)
  const post = store.listContentPosts().find(row => row.title === story.title)
  store.updateContentPost(post.id, { status: 0 })
  assert.equal(store.importWechatPublications([{ ...story, title: '更新标题' }]).added, 0)
  assert.equal(store.findContentPost(post.id).title, '更新标题')
  assert.equal(store.findContentPost(post.id).status, 0)
  store.deleteContentPost(post.id)
  assert.equal(store.importWechatPublications([story]).added, 0)
})

test('核对历史文章后，定时同步保留原文、真实日期并区分空字段和缺省字段', () => {
  const key = 'metadata:2'
  store.importWechatPublications([{ key, title: '元数据', summary: '旧摘要', coverImage: 'https://example.org/cover', updatedAt: 123 }])
  const post = store.listContentPosts().find(row => row.title === '元数据')
  assert.equal(post.publishedAt, '')
  assert.equal(post.officialLinkPending, true)
  const url = 'https://mp.weixin.qq.com/s/operator-link'
  store.importWechatPublications([{ postId: post.id, title: '元数据', publishedAt: '2025-02-01', url }], { manual: true, operatorId: 'editor' })
  store.importWechatPublications([{ key, title: '新标题', coverImage: '', updatedAt: 456 }])
  const result = store.listContentPosts().find(row => row.id === post.id)
  assert.equal(result.summary, '旧摘要')
  assert.equal(result.coverImage, '')
  assert.equal(result.officialArticleUrl, url)
  assert.equal(result.publishedAt, '2025-02-01')
  store.importWechatPublications([{ key, deleted: true }])
  store.importWechatPublications([{ key, title: '晚到的旧快照' }])
  assert.equal(store.listContentPosts({ publishedOnly: true }).some(row => row.id === post.id), false)
})

test('按微信篇次撤回历史发表，不误伤同组其他文章和本地新版本', () => {
  const publicUrl = 'https://mp.weixin.qq.com/s/current-story'
  const oldUrl = 'https://mp.weixin.qq.com/s/prior-story'
  const post = store.createContentPost({ title: '本地发布' })
  store.updateContentWechat(post.id, { publishStatus: 0, articleId: 'new', articleUrls: [publicUrl],
    history: [{ publishStatus: 0, articleId: 'old', articleUrls: [oldUrl] }] })
  store.importWechatPublications([{ key: 'old:1', deleted: true }, { key: 'old:2', title: '同批第二篇' }])
  const admin = store.listContentPosts({ includeInternal: true }).find(row => row.id === post.id)
  assert.equal(admin.officialArticleUrl, publicUrl)
  assert.equal(admin.wechat.history[0].publicArticleUrl, '')
  assert.equal(admin.wechat.history[0].withdrawn, true)
  store.importWechatPublications([{ key: 'new:1', deleted: true }])
  const visible = store.listContentPosts({ publishedOnly: true })
  assert.equal(visible.find(row => row.id === post.id).officialArticleUrl, '')
  assert.ok(visible.some(row => row.title === '同批第二篇'))
  store.deleteContentPost(post.id)
  assert.equal(store.importWechatPublications([{ key: 'old:1', title: '旧文章再次同步' }, { key: 'new:1', title: '新文章再次同步' }]).added, 0)
})

test('撤回先于发表结果时，查询成功也不会恢复已经撤回的阅读入口', () => {
  store.importWechatPublications([{ key: 'race:1', deleted: true }])
  const post = store.createContentPost({ title: '先撤回后查询' })
  store.updateContentWechat(post.id, { publishStatus: 0, articleId: 'race', articleUrls: ['https://mp.weixin.qq.com/s/race'] })
  const row = store.listContentPosts({ publishedOnly: true }).find(item => item.id === post.id)
  assert.equal(row.officialArticleUrl, '')
})

test('下一次同步才识别的已删副本也会移除，重启后只恢复人工重新导入的文章', async () => {
  const url = 'https://mp.weixin.qq.com/s/late-delete'
  const key = 'late-delete:1'
  const post = store.createContentPost({ title: '删除测试' })
  store.updateContentWechat(post.id, { publishStatus: 0, articleUrls: [url] })
  store.importWechatPublications([{ key, title: '尚未关联' }])
  store.deleteContentPost(post.id)
  store.importWechatPublications([{ key, listLink: url, title: '已经关联' }])
  assert.equal(store.listContentPosts().some(row => row.title === '尚未关联' || row.title === '已经关联'), false)
  const reloaded = await import(`../src/store.js?reloaded=${Date.now()}`)
  assert.equal(reloaded.importWechatPublications([{ key, title: '已删除' }]).added, 0)
  reloaded.importWechatPublications([{ title: '恢复', publishedAt: '2026-10-23', url }], { manual: true, operatorId: 'reviewer' })
  assert.equal(reloaded.importWechatPublications([{ key, listLink: url, title: '恢复后的更新' }]).added, 0)
  assert.equal(reloaded.listContentPosts().find(row => row.officialArticleUrl === url).title, '恢复后的更新')
})

test('公众号发布状态仅由服务端更新，公开政策资讯不暴露内部 mediaId', () => {
  const database = store.init()
  database.contentPosts = []
  const created = store.createContentPost({
    title: '政策资讯',
    coverImage: '/api/uploads/files/cover.webp',
    contentBlocks: [{ type: 'text', text: '正文' }],
    wechat: { draftMediaId: 'injected-draft' }
  })
  assert.equal(created.wechat, undefined)

  store.updateContentWechat(created.id, {
    draftMediaId: 'server-draft',
    draftContentHash: 'hash-1',
    unexpected: 'ignored'
  })
  assert.equal(store.findContentPost(created.id).wechat.draftMediaId, 'server-draft')
  assert.equal(store.findContentPost(created.id).wechat.unexpected, undefined)

  store.updateContentPost(created.id, {
    title: '修改后的政策资讯',
    wechat: { draftMediaId: 'tampered-draft' }
  })
  assert.equal(store.findContentPost(created.id).wechat.draftMediaId, 'server-draft')
  assert.equal(store.listContentPosts({ includeInternal: true })[0].wechat.draftMediaId, 'server-draft')
  assert.equal(store.listContentPosts()[0].wechat, undefined)

  const persisted = JSON.parse(fs.readFileSync(process.env.DATA_FILE, 'utf8')).contentPosts[0]
  assert.equal(persisted.wechat.draftMediaId, 'server-draft')
})

test('旧版导入数据重启后区分来源，保留可供运营核对的旧信息', async () => {
  const data = JSON.parse(fs.readFileSync(process.env.DATA_FILE))
  const url = 'https://mp.weixin.qq.com/s/legacy'
  data.contentPosts = [
    { id: 'legacy-api', type: 'news', title: '旧同步', status: 1, publishedAt: '2025-01-01', wechat: { importKey: 'legacy:1', importUrl: url } },
    { id: 'legacy-manual', type: 'news', title: '旧手工', status: 1, source: '岁悦里文化科技', publishedAt: '2025-02-02', wechat: { importUrl: url + '-manual' } }
  ]
  fs.writeFileSync(process.env.DATA_FILE, JSON.stringify(data))
  const reloaded = await import(`../src/store.js?legacy=${Date.now()}`)
  const rows = reloaded.listContentPosts({ publishedOnly: true })
  assert.equal(rows.find(row => row.id === 'legacy-manual').source, '')
  assert.equal(rows.find(row => row.id === 'legacy-api').publishedAt, '')
  assert.ok(rows.every(row => row.officialArticleUrl === '' && row.officialLinkPending))
  assert.equal(reloaded.findContentPost('legacy-api').wechat.legacyDate, '2025-01-01')
  reloaded.importWechatPublications([{ key: 'legacy:1', title: '同步更新' }])
  assert.equal(reloaded.findContentPost('legacy-api').wechat.sourceVerification, 'wechat-api')
})
