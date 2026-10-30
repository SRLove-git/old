import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import express from 'express'

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'suiyueli-manager-code-'))
const originalEnv = { ...process.env }
const originalFetch = globalThis.fetch
Object.assign(process.env, {
  DATA_FILE: path.join(directory, 'data.json'), NODE_ENV: 'development', ALLOW_LEGACY_USER_ID: 'true',
  SESSION_SECRET: 'test-manager-code-session-secret', WECHAT_APPID: 'wx-manager-code-test',
  WECHAT_APP_SECRET: 'test-manager-code-secret', WECHAT_CODE_ENV_VERSION: 'trial'
})
const store = await import('../src/store.js')
const { encodeSession } = await import('../src/lib/session.js')
const { default: managerPromotionRouter } = await import('../src/routes/manager-promotion.js')
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zf3sAAAAASUVORK5CYII=', 'base64')
let server

test.after(async () => {
  if (server) await new Promise(resolve => server.close(resolve))
  globalThis.fetch = originalFetch
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key]
  Object.assign(process.env, originalEnv)
  fs.rmSync(directory, { recursive: true, force: true })
})

test('推广码只允许本人签名会员且状态有效，缓存命中也重新检查权限', async () => {
  const db = store.init()
  db.customers = [{ id: 'owner', name: '测试主理人' }, { id: 'other', name: '其他会员' }]
  db.managers = [{ id: 7001, userId: 'owner', name: '测试主理人', status: 1 }, { id: 7002, userId: 'other', name: '另一主理人', status: 1 }]
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), body: JSON.parse(options.body) })
    if (String(url) === 'https://api.weixin.qq.com/cgi-bin/stable_token') return new Response(JSON.stringify({ access_token: 'test-code-token', expires_in: 7200 }), { headers: { 'content-type': 'application/json' } })
    if (String(url).startsWith('https://api.weixin.qq.com/wxa/getwxacodeunlimit?')) return new Response(png, { headers: { 'content-type': 'image/png' } })
    throw new Error('Test blocked unexpected external request')
  }
  const app = express()
  app.use('/api/managers', managerPromotionRouter)
  server = await new Promise(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)) })
  const memberHeaders = (id, extra = {}) => ({ authorization: `Bearer ${encodeSession({ userId: id, exp: Math.floor(Date.now() / 1000) + 3600, ...extra })}` })
  const request = async (id, headers = {}) => {
    const response = await originalFetch(`http://127.0.0.1:${server.address().port}/api/managers/${id}/promotion-code`, { headers })
    return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control') }
  }
  assert.equal((await request(7001)).status, 401)
  assert.equal((await request(7001, { 'x-user-id': 'owner' })).status, 401, '即使开发联调开关开启也不能绕过签名会话')
  assert.equal((await request(7001, { 'x-admin-token': 'admin-token' })).status, 401)
  assert.equal((await request(7001, memberHeaders('owner', { role: 'merchant' }))).status, 401)
  assert.equal((await request(7001, memberHeaders('owner', { exp: 1 }))).status, 401)
  assert.equal((await request(7001, memberHeaders('other'))).status, 403)
  assert.equal((await request(9999, memberHeaders('owner'))).status, 404)
  assert.equal(calls.length, 0, '所有拒绝场景必须在请求微信前拦截')

  const result = await request(7001, memberHeaders('owner'))
  assert.equal(result.status, 200)
  assert.equal(result.cache, 'no-store')
  assert.deepEqual(result.body.data, { imageBase64: png.toString('base64'), mimeType: 'image/png', envVersion: 'trial' })
  assert.equal(calls.length, 2)
  assert.equal(calls[1].body.scene, 'ref=7001')
  assert.equal(calls[1].body.env_version, 'trial')
  assert.equal((await request(7001, memberHeaders('owner'))).status, 200)
  assert.equal(calls.length, 2)

  db.managers[0].status = 2
  assert.equal((await request(7001, memberHeaders('owner'))).status, 403)
  db.managers[0].status = 3
  assert.equal((await request(7001, memberHeaders('owner'))).status, 403)
  db.managers[0].status = 1
  db.managers[0].userId = 'other'
  assert.equal((await request(7001, memberHeaders('owner'))).status, 403)
  db.customers = db.customers.filter(item => item.id !== 'owner')
  assert.equal((await request(7001, memberHeaders('owner'))).status, 401)
  assert.equal(calls.length, 2, '状态变化后不能通过图片缓存绕过授权')
})
