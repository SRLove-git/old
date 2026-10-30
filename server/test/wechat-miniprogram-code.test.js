import assert from 'node:assert/strict'
import test from 'node:test'
import { createWechatMiniProgramCodeClient } from '../src/lib/wechat-miniprogram-code.js'

const originalEnv = { ...process.env }
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zf3sAAAAASUVORK5CYII=', 'base64')
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })
const image = () => new Response(png, { headers: { 'content-type': 'image/png' } })
const isToken = url => String(url).endsWith('/cgi-bin/stable_token')

test.beforeEach(() => {
  process.env.WECHAT_APPID = 'wx-code-test'
  process.env.WECHAT_APP_SECRET = 'test-only-secret'
  delete process.env.WECHAT_CODE_ENV_VERSION
  delete process.env.WECHAT_CODE_TIMEOUT_MS
})
test.after(() => {
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key]
  Object.assign(process.env, originalEnv)
})

test('小程序码使用 stable_token 和固定推广参数，只返回图片与环境', async () => {
  const calls = []
  const getCode = createWechatMiniProgramCodeClient({ fetchImpl: async (url, options) => {
    calls.push({ url: String(url), body: JSON.parse(options.body), signal: options.signal })
    return isToken(url) ? json({ access_token: 'test-access-token', expires_in: 7200 }) : image()
  } })
  const result = await getCode(123)
  assert.deepEqual(calls[0].body, { grant_type: 'client_credential', appid: 'wx-code-test', secret: 'test-only-secret', force_refresh: false })
  assert.equal(calls[1].url, 'https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=test-access-token')
  assert.deepEqual(calls[1].body, { page: 'pages/index/index', scene: 'ref=123', width: 430, check_path: true, env_version: 'release' })
  assert.ok(calls.every(call => call.signal instanceof AbortSignal))
  assert.deepEqual(result, { imageBase64: png.toString('base64'), mimeType: 'image/png', envVersion: 'release' })
  assert.equal(JSON.stringify(result).includes('test-access-token'), false)
})

test('小程序码缓存区分主理人、AppID、环境和凭证，15分钟后重生成', async () => {
  let time = 1000000
  let tokenCalls = 0
  const codeCalls = []
  const getCode = createWechatMiniProgramCodeClient({ now: () => time, fetchImpl: async (url, options) => {
    if (isToken(url)) { tokenCalls += 1; return json({ access_token: `token-${tokenCalls}`, expires_in: 7200 }) }
    codeCalls.push(JSON.parse(options.body))
    return image()
  } })
  await getCode('123'); await getCode('123')
  assert.equal(codeCalls.length, 1)
  await getCode('124')
  process.env.WECHAT_CODE_ENV_VERSION = 'trial'
  assert.equal((await getCode('123')).envVersion, 'trial')
  assert.equal(codeCalls.at(-1).check_path, false)
  process.env.WECHAT_CODE_ENV_VERSION = 'develop'
  assert.equal((await getCode('123')).envVersion, 'develop')
  assert.equal(codeCalls.at(-1).check_path, false)
  process.env.WECHAT_APPID = 'wx-other-app'
  await getCode('123')
  process.env.WECHAT_APP_SECRET = 'rotated-test-secret'
  await getCode('123')
  assert.equal(tokenCalls, 3)
  assert.equal(codeCalls.length, 6)
  time += 15 * 60 * 1000 + 1
  await getCode('123')
  assert.equal(codeCalls.length, 7)
  assert.equal(tokenCalls, 3)
})

test('并发合并同一推广码与共享token请求，token提前刷新', async () => {
  let time = 0, tokenCalls = 0, codeCalls = 0
  const getCode = createWechatMiniProgramCodeClient({ now: () => time, fetchImpl: async url => {
    await new Promise(resolve => setImmediate(resolve))
    if (isToken(url)) { tokenCalls += 1; return json({ access_token: `token-${tokenCalls}`, expires_in: 7200 }) }
    codeCalls += 1
    return image()
  } })
  await Promise.all([getCode('1'), getCode('1'), getCode('2'), getCode('2')])
  assert.equal(tokenCalls, 1)
  assert.equal(codeCalls, 2)
  time = 7090 * 1000
  await getCode('3')
  assert.equal(tokenCalls, 2, '应在 expires_in 到期前刷新')
})

test('token失效仅重新获取一次，不使用force_refresh，并且并发不相互失效新token', async () => {
  let tokenCalls = 0, codeCalls = 0
  const getCode = createWechatMiniProgramCodeClient({ fetchImpl: async (url, options) => {
    if (isToken(url)) { tokenCalls += 1; assert.equal(JSON.parse(options.body).force_refresh, false); return json({ access_token: `token-${tokenCalls}`, expires_in: 7200 }) }
    codeCalls += 1
    return String(url).includes('token-1') ? json({ errcode: 40014, errmsg: 'invalid sensitive-token' }) : image()
  } })
  await Promise.all([getCode('1'), getCode('2')])
  assert.equal(tokenCalls, 2)
  assert.equal(codeCalls, 4)
  let failedTokens = 0, failedCodes = 0
  const alwaysInvalid = createWechatMiniProgramCodeClient({ fetchImpl: async url => {
    if (isToken(url)) { failedTokens += 1; return json({ access_token: `invalid-${failedTokens}`, expires_in: 7200 }) }
    failedCodes += 1
    return json({ errcode: 40014, errmsg: 'invalid sensitive-token' })
  } })
  await assert.rejects(() => alwaysInvalid('1'), error => error.status === 502 && !error.message.includes('sensitive-token'))
  assert.equal(failedTokens, 2)
  assert.equal(failedCodes, 2)
})

test('JSON错误与非图片响应不缓存，不暴露微信原始errmsg', async () => {
  let tokenCalls = 0, codeCalls = 0
  const getCode = createWechatMiniProgramCodeClient({ fetchImpl: async url => {
    if (isToken(url)) { tokenCalls += 1; return json({ access_token: 'test-token', expires_in: 7200 }) }
    codeCalls += 1
    return codeCalls === 1 ? json({ errcode: 45009, errmsg: 'quota sensitive-token test-only-secret' }) : image()
  } })
  await assert.rejects(() => getCode('1'), error => error.status === 502 && /额度/.test(error.message) && !/sensitive-token|test-only-secret/.test(error.message))
  assert.equal((await getCode('1')).mimeType, 'image/png')
  assert.equal(tokenCalls, 1)
  assert.equal(codeCalls, 2)
  for (const response of [() => new Response('<html>bad gateway</html>'), () => json({ errcode: 0 }), () => new Response(png.subarray(0, 12))]) {
    const invalid = createWechatMiniProgramCodeClient({ fetchImpl: async url => isToken(url) ? json({ access_token: 'test-token', expires_in: 7200 }) : response() })
    await assert.rejects(() => invalid('1'), /未返回有效的小程序码图片/)
  }
})

test('拒绝超大图片响应，并按文件签名识别JPEG', async () => {
  for (const response of [() => new Response(png, { headers: { 'content-length': String(2 * 1024 * 1024) } }), () => new Response(Buffer.alloc(1024 * 1024 + 1))]) {
    const getCode = createWechatMiniProgramCodeClient({ fetchImpl: async url => isToken(url) ? json({ access_token: 'test-token', expires_in: 7200 }) : response() })
    await assert.rejects(() => getCode('1'), /超过大小限制/)
  }
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 2, 0xff, 0xd9])
  const getJpeg = createWechatMiniProgramCodeClient({ fetchImpl: async url => isToken(url) ? json({ access_token: 'test-token', expires_in: 7200 }) : new Response(jpeg) })
  assert.equal((await getJpeg('1')).mimeType, 'image/jpeg')
})

test('图片缓存有64项上限且缓存命中后仍保持最近使用顺序', async () => {
  let codeCalls = 0
  const getCode = createWechatMiniProgramCodeClient({ fetchImpl: async url => {
    if (isToken(url)) return json({ access_token: 'test-token', expires_in: 7200 })
    codeCalls += 1
    return image()
  } })
  for (let id = 0; id < 64; id += 1) await getCode(id)
  await getCode(0)
  await getCode(64)
  await getCode(0)
  assert.equal(codeCalls, 65)
  await getCode(1)
  assert.equal(codeCalls, 66, '最久未使用项应被淘汰')
})

test('缺少配置、非法环境或scene编号在调用微信前拒绝', async () => {
  let calls = 0
  const getCode = createWechatMiniProgramCodeClient({ fetchImpl: async () => { calls += 1; throw new Error('must not call') } })
  process.env.WECHAT_CODE_ENV_VERSION = 'invalid'
  await assert.rejects(() => getCode('1'), error => error.status === 503)
  process.env.WECHAT_CODE_ENV_VERSION = 'release'
  delete process.env.WECHAT_APP_SECRET
  await assert.rejects(() => getCode('1'), error => error.status === 503)
  process.env.WECHAT_APP_SECRET = 'test-only-secret'
  await assert.rejects(() => getCode('x'.repeat(29)), error => error.status === 400)
  await assert.rejects(() => getCode('1&ref=2'), error => error.status === 400)
  assert.equal(calls, 0)
})

test('微信请求超时会中止请求并返回安全错误', async () => {
  process.env.WECHAT_CODE_TIMEOUT_MS = '1000'
  let aborted = false
  const getCode = createWechatMiniProgramCodeClient({ fetchImpl: async (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => { aborted = true; reject(new DOMException(`secret in ${url}`, 'AbortError')) }, { once: true })
  }) })
  await assert.rejects(() => getCode('1'), error => error.status === 504 && /超时/.test(error.message) && !error.message.includes('secret'))
  assert.equal(aborted, true)
})
