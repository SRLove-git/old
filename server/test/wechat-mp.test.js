import assert from 'node:assert/strict'
import test from 'node:test'
import { createWechatMpClient } from '../src/lib/wechat-mp.js'

const env = {
  WECHAT_MP_APPID: 'wx4ff9702f8188c0c0',
  WECHAT_MP_APPSECRET: 'mp-test-secret',
  WECHAT_MP_TIMEOUT_MS: '2000'
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

test('旧公众号在发起任何微信请求前被拒绝', async () => {
  let calls = 0
  const client = createWechatMpClient({ env: { ...env, WECHAT_MP_APPID: 'wrong' }, fetchImpl: () => { calls++ } })
  await assert.rejects(client.submitPublish('reviewed'), /不匹配/)
  assert.equal(calls, 0)
})

function fakePng(length = 64) {
  const buffer = Buffer.alloc(Math.max(length, 8))
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer, 0)
  return buffer
}

function harness(options = {}) {
  const calls = []
  let tokenCount = 0
  let draftCount = 0
  const fetchImpl = async (url, requestOptions = {}) => {
    const path = new URL(String(url)).pathname
    calls.push({ url: String(url), path, options: requestOptions })
    if (path === '/cgi-bin/stable_token') {
      tokenCount += 1
      return json({ access_token: `token-${tokenCount}`, expires_in: 7200 })
    }
    if (path === '/cgi-bin/media/uploadimg') return json({ url: 'http://mmbiz.qpic.cn/body' })
    if (path === '/cgi-bin/material/add_material') return json({ media_id: 'cover-media', url: 'http://mmbiz.qpic.cn/cover' })
    if (path === '/cgi-bin/draft/add') {
      draftCount += 1
      if (options.draftError) return json(options.draftError)
      if (options.retryDraft && draftCount === 1) return json({ errcode: 40001, errmsg: 'invalid credential' })
      return json({ media_id: `draft-${draftCount}` })
    }
    if (path === '/cgi-bin/freepublish/submit') {
      return json({ errcode: 0, errmsg: 'ok', publish_id: '1001', msg_data_id: 'msg-1' })
    }
    if (path === '/cgi-bin/freepublish/get') {
      return json({
        publish_id: '1001',
        publish_status: 0,
        article_id: 'article-1',
        article_detail: { count: 1, item: [{ idx: 1, article_url: 'https://mp.weixin.qq.com/s/test' }] },
        fail_idx: []
      })
    }
    return json({ errcode: 48001, errmsg: 'api unauthorized' })
  }
  return { client: createWechatMpClient({ fetchImpl, env }), calls }
}

test('新增草稿复用 access_token 并发送文档要求的字段', async () => {
  const h = harness()
  const article = {
    title: '测试文章',
    author: '运营',
    digest: '摘要',
    content: '<p>正文</p>',
    sourceUrl: 'https://example.com/a',
    thumbMediaId: 'cover-1',
    needOpenComment: true
  }
  const first = await h.client.addDraft(article)
  await h.client.addDraft(article)
  assert.equal(first.mediaId, 'draft-1')

  const tokenCalls = h.calls.filter((call) => call.path === '/cgi-bin/stable_token')
  assert.equal(tokenCalls.length, 1, '两次调用应复用同一个 token')
  const tokenBody = JSON.parse(tokenCalls[0].options.body)
  assert.equal(tokenBody.appid, env.WECHAT_MP_APPID)
  assert.equal(tokenBody.secret, env.WECHAT_MP_APPSECRET)
  assert.equal(tokenBody.grant_type, 'client_credential')
  assert.equal(tokenBody.force_refresh, false)

  const draftCalls = h.calls.filter((call) => call.path === '/cgi-bin/draft/add')
  assert.equal(draftCalls.length, 2)
  assert.match(draftCalls[0].url, /access_token=token-1/)
  assert.deepEqual(JSON.parse(draftCalls[0].options.body).articles[0], {
    article_type: 'news',
    title: '测试文章',
    content: '<p>正文</p>',
    thumb_media_id: 'cover-1',
    need_open_comment: 1,
    only_fans_can_comment: 0,
    author: '运营',
    digest: '摘要',
    content_source_url: 'https://example.com/a'
  })
})

test('新增贴图草稿发送 newspic 图片列表', async () => {
  const h = harness()
  const result = await h.client.addImageDraft({
    title: '贴图测试',
    content: '贴图说明',
    imageMediaIds: ['image-1', 'image-2'],
    needOpenComment: true
  })
  assert.equal(result.mediaId, 'draft-1')

  const call = h.calls.find((item) => item.path === '/cgi-bin/draft/add')
  assert.deepEqual(JSON.parse(call.options.body).articles[0], {
    article_type: 'newspic',
    title: '贴图测试',
    content: '贴图说明',
    image_info: {
      image_list: [
        { image_media_id: 'image-1' },
        { image_media_id: 'image-2' }
      ]
    },
    need_open_comment: 1,
    only_fans_can_comment: 0
  })
})

test('贴图草稿在本地校验图片数量', async () => {
  const h = harness()
  await assert.rejects(
    h.client.addImageDraft({ title: '贴图测试', content: '正文', imageMediaIds: [] }),
    /至少提供一张/
  )
  await assert.rejects(
    h.client.addImageDraft({ title: '贴图测试', content: '正文', imageMediaIds: Array(21).fill('image') }),
    /不能超过20张/
  )
  assert.equal(h.calls.length, 0)
})

test('正文图片与封面分别使用 uploadimg 和永久素材接口', async () => {
  const h = harness()
  const image = fakePng()
  const body = await h.client.uploadArticleImage({ buffer: image, filename: 'cover.png' })
  const cover = await h.client.uploadPermanentImage({ buffer: image, filename: 'cover.png' })
  assert.equal(body.url, 'http://mmbiz.qpic.cn/body')
  assert.equal(cover.mediaId, 'cover-media')
  assert.equal(cover.url, 'http://mmbiz.qpic.cn/cover')

  const articleCall = h.calls.find((call) => call.path === '/cgi-bin/media/uploadimg')
  assert.ok(articleCall.options.body instanceof FormData)
  const articleMedia = articleCall.options.body.get('media')
  assert.equal(articleMedia.type, 'image/png')
  assert.equal(articleMedia.name, 'cover.png')

  const coverCall = h.calls.find((call) => call.path === '/cgi-bin/material/add_material')
  assert.match(coverCall.url, /type=image/)
  assert.ok(coverCall.options.body instanceof FormData)

  const tokenCalls = h.calls.filter((call) => call.path === '/cgi-bin/stable_token')
  assert.equal(tokenCalls.length, 1)
})

test('本地校验标题、正文、封面和阅读原文长度，不发起微信请求', async () => {
  const h = harness()
  await assert.rejects(h.client.addDraft({ title: 'x'.repeat(33), content: '正文', thumbMediaId: 'cover' }), /32/)
  await assert.rejects(h.client.addDraft({ title: '标题', content: '', thumbMediaId: 'cover' }), /正文/)
  await assert.rejects(h.client.addDraft({ title: '标题', content: '正文', thumbMediaId: '' }), /封面/)
  await assert.rejects(h.client.addDraft({ title: '标题', content: 'x'.repeat(20000), thumbMediaId: 'cover' }), /2万/)
  await assert.rejects(
    h.client.addDraft({ title: '标题', content: '正文', thumbMediaId: 'cover', sourceUrl: 'x'.repeat(1025) }),
    /1KB/
  )
  assert.equal(h.calls.length, 0)
})

test('图片格式和大小在本地拦截，避免无效上传', async () => {
  const h = harness()
  await assert.rejects(
    h.client.uploadArticleImage({ buffer: Buffer.from('not-an-image'), filename: 'x.jpg' }),
    /JPG 或 PNG/
  )
  await assert.rejects(
    h.client.uploadArticleImage({ buffer: fakePng(1024 * 1024), filename: 'x.png' }),
    /1MB/
  )
  assert.equal(h.calls.length, 0)
})

test('接口权限不足时返回可操作的错误并保留微信错误码', async () => {
  const h = harness({ draftError: { errcode: 48001, errmsg: 'api unauthorized' } })
  await assert.rejects(
    h.client.addDraft({ title: '标题', content: '正文', thumbMediaId: 'cover' }),
    (error) => {
      assert.match(error.message, /接口权限/)
      assert.equal(error.wechatCode, 48001)
      return true
    }
  )
})

test('token 失效时强制刷新并重试一次', async () => {
  const h = harness({ retryDraft: true })
  const result = await h.client.addDraft({ title: '标题', content: '正文', thumbMediaId: 'cover' })
  assert.equal(result.mediaId, 'draft-2')
  assert.equal(h.calls.filter((call) => call.path === '/cgi-bin/stable_token').length, 2)
  assert.equal(h.calls.filter((call) => call.path === '/cgi-bin/draft/add').length, 2)
})

test('发布草稿并归一化发布状态', async () => {
  const h = harness()
  assert.deepEqual(await h.client.submitPublish('draft-1'), { publishId: '1001', msgDataId: 'msg-1' })
  assert.deepEqual(await h.client.getPublishStatus('1001'), {
    publishId: '1001',
    status: 0,
    articleId: 'article-1',
    articleUrls: ['https://mp.weixin.qq.com/s/test'],
    failIdx: []
  })
})

test('缺少公众号配置时给出明确错误，不调用微信', async () => {
  const calls = []
  const client = createWechatMpClient({
    env: { WECHAT_MP_APPID: '', WECHAT_MP_APPSECRET: '' },
    fetchImpl: async (...args) => { calls.push(args); return json({}) }
  })
  assert.equal(client.configured(), false)
  await assert.rejects(client.getAccessToken(), /WECHAT_MP_APPID/)
  assert.equal(calls.length, 0)
})

test('IP 白名单错误在 token 阶段返回明确提示', async () => {
  const client = createWechatMpClient({
    env,
    fetchImpl: async () => json({ errcode: 40164, errmsg: 'ip not in whitelist' })
  })
  await assert.rejects(client.getAccessToken(), /IP 白名单/)
})
