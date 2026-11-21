import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import sharp from 'sharp'
import { createWechatContentPublisher } from '../src/services/wechat-content.js'

async function fixture(t) {
  const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'suiyueli-wechat-content-'))
  t.after(() => fs.rm(uploadDir, { recursive: true, force: true }))
  const image = await sharp({
    create: { width: 640, height: 400, channels: 3, background: '#b98555' }
  }).webp().toBuffer()
  await fs.writeFile(path.join(uploadDir, 'cover.webp'), image)
  await fs.writeFile(path.join(uploadDir, 'body.webp'), image)

  const post = {
    id: 'CONTENT-1',
    type: 'news',
    title: '政策申报指南',
    summary: '政策申报时间、条件与办理方式',
    source: '测试政府部门',
    originalUrl: 'https://www.example.gov.cn/policy/1',
    coverImage: '/api/uploads/files/cover.webp',
    contentBlocks: [
      { type: 'text', text: '第一段\n第二行 <安全>' },
      { type: 'image', src: '/api/uploads/files/body.webp', caption: '办理流程图' },
      { type: 'link', title: '查看申报要求', description: '以官网内容为准', url: 'https://www.example.gov.cn/apply' }
    ],
    wechat: null
  }
  const storeApi = {
    findContentPost: (id) => String(id) === post.id ? post : null,
    updateContentWechat: (id, patch) => {
      assert.equal(String(id), post.id)
      post.wechat = { ...(post.wechat || {}), ...patch }
      return post
    }
  }
  const calls = []
  const client = {
    uploadPermanentImage: async (input) => {
      calls.push({ type: 'cover', input })
      return { mediaId: 'cover-media' }
    },
    uploadArticleImage: async (input) => {
      calls.push({ type: 'body', input })
      return { url: 'https://mmbiz.qpic.cn/body-image' }
    },
    addDraft: async (article) => {
      calls.push({ type: 'draft', article })
      return { mediaId: 'draft-media' }
    },
    addImageDraft: async (article) => {
      calls.push({ type: 'picture', article })
      return { mediaId: 'picture-media' }
    },
    submitPublish: async (mediaId) => {
      calls.push({ type: 'publish', mediaId })
      return { publishId: 'publish-1', msgDataId: 'message-1' }
    },
    getPublishStatus: async (publishId) => {
      calls.push({ type: 'status', publishId })
      return { publishId, status: 0, articleId: 'article-1', articleUrls: ['https://mp.weixin.qq.com/s/1'], failIdx: [] }
    }
  }
  const publisher = createWechatContentPublisher({
    client,
    storeApi,
    uploadDir,
    author: '',
    now: () => '2026-11-11T10:00:00.000Z'
  })
  return { post, calls, publisher, client }
}

test('政策资讯生成公众号草稿时转换本地 WebP、正文图片和安全 HTML', async (t) => {
  const { post, calls, publisher } = await fixture(t)
  const state = await publisher.createDraft(post.id)

  assert.equal(state.draftMediaId, 'draft-media')
  assert.equal(state.draftCreatedAt, '2026-11-11T10:00:00.000Z')
  assert.equal(calls.find((call) => call.type === 'cover').input.filename, 'cover.jpg')
  assert.equal(calls.find((call) => call.type === 'cover').input.buffer.subarray(0, 3).toString('hex'), 'ffd8ff')
  assert.equal(calls.find((call) => call.type === 'body').input.buffer.subarray(0, 3).toString('hex'), 'ffd8ff')

  const article = calls.find((call) => call.type === 'draft').article
  assert.equal(article.thumbMediaId, 'cover-media')
  assert.equal(article.sourceUrl, post.originalUrl)
  assert.match(article.content, /https:\/\/mmbiz\.qpic\.cn\/body-image/)
  assert.match(article.content, /&lt;安全&gt;/)
  assert.doesNotMatch(article.content, /<安全>/)
})

test('只发布已生成且内容未变化的草稿，并可同步最终文章地址', async (t) => {
  const { post, calls, publisher } = await fixture(t)
  await publisher.createDraft(post.id)
  const submitted = await publisher.publishDraft(post.id, 'draft-media')
  assert.equal(submitted.publishId, 'publish-1')
  assert.equal(calls.find((call) => call.type === 'publish').mediaId, 'draft-media')

  const completed = await publisher.syncStatus(post.id)
  assert.equal(completed.publishStatus, 0)
  assert.equal(completed.articleId, 'article-1')
  assert.deepEqual(completed.articleUrls, ['https://mp.weixin.qq.com/s/1'])
})

test('草稿生成后正文变化会阻止发布，避免发布未预览版本', async (t) => {
  const { post, calls, publisher } = await fixture(t)
  await publisher.createDraft(post.id)
  post.title = '已经修改的新标题'
  await assert.rejects(publisher.publishDraft(post.id, 'draft-media'), /重新生成草稿并预览/)
  assert.equal(calls.some((call) => call.type === 'publish'), false)
})

test('确认绑定草稿且一次只提交一次，重建后保留发表记录', async t => {
  const { post, calls, publisher } = await fixture(t)
  await publisher.createDraft(post.id)
  await assert.rejects(publisher.publishDraft(post.id, 'previous'), /草稿已变更/)
  await assert.rejects(publisher.publishDraft(post.id), /草稿已变更/)
  const outcomes = await Promise.allSettled([1, 2].map(() => publisher.publishDraft(post.id, 'draft-media')))
  assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1)
  assert.equal(calls.filter(call => call.type === 'publish').length, 1)
  await assert.rejects(publisher.createDraft(post.id), /正在发表/)
  await publisher.syncStatus(post.id)
  const next = await publisher.createDraft(post.id, 'newspic')
  assert.equal(next.history[0].articleId, 'article-1')
  assert.equal(next.draftFormat, 'newspic')
  const picture = calls.find(call => call.type === 'picture').article
  assert.equal(picture.imageMediaIds.length, 2)
  assert.match(picture.content, /办理流程图/)
})

test('提交后连接中断，保留待核实信息并拦住再次提交', async t => {
  const { post, client, publisher } = await fixture(t)
  client.submitPublish = async () => { throw Object.assign(new Error(), { publishOutcomeUnknown: true }) }
  await publisher.createDraft(post.id)
  await assert.rejects(publisher.publishDraft(post.id, 'draft-media'), /待核实/)
  assert.equal(post.wechat.submissionPending, true)
  await assert.rejects(publisher.publishDraft(post.id, 'draft-media'), /待核实/)
  await assert.rejects(publisher.createDraft(post.id), /待核实/)
  await publisher.createDraft(post.id, 'newspic', 'draft-media')
  assert.equal(post.wechat.history[0].submissionPending, true)
})

test('发表成功后用户删除或平台封禁时保留文章标识，后续状态能对应到原记录', async t => {
  const { post, client, publisher } = await fixture(t)
  await publisher.createDraft(post.id)
  await publisher.publishDraft(post.id, 'draft-media')
  await publisher.syncStatus(post.id)
  for (const status of [5, 6]) {
    client.getPublishStatus = async () => ({ status, articleId: '', articleUrls: [], failIdx: [] })
    const state = await publisher.syncStatus(post.id)
    assert.equal(state.publishStatus, status)
    assert.equal(state.articleId, 'article-1')
    assert.deepEqual(state.articleUrls, ['https://mp.weixin.qq.com/s/1'])
  }
})

test('外部封面和非 HTTPS 原文在调用微信前被拒绝', async (t) => {
  const { post, calls, publisher } = await fixture(t)
  post.coverImage = 'https://images.example.com/cover.jpg'
  await assert.rejects(publisher.createDraft(post.id), /必须先上传到运营后台/)
  post.coverImage = '/api/uploads/files/cover.webp'
  post.originalUrl = 'http://www.example.gov.cn/policy/1'
  await assert.rejects(publisher.createDraft(post.id), /必须使用 HTTPS/)
  assert.equal(calls.length, 0)
})
