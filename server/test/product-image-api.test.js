import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'suiyueli-product-api-'))
const serverDirectory = fileURLToPath(new URL('..', import.meta.url))
process.env.DATA_FILE = path.join(directory, 'data.json')
const store = await import(`../src/store.js?product-api=${Date.now()}`)
const { passwordRecord } = await import('../src/lib/session.js')
let server, base, token

async function request(endpoint, { method = 'GET', body, authenticated = false } = {}) {
  const response = await fetch(base + endpoint, {
    method,
    headers: { 'content-type': 'application/json', ...(authenticated ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  const result = await response.json()
  assert.equal(response.status, 200, result.message)
  assert.equal(result.code, 0, result.message)
  return result.data
}

test.before(async () => {
  const database = store.init()
  database.managers = [{ id: 98001, name: '测试商户', status: 1 }]
  database.products = []
  database.orders = []
  database.merchantAccounts = [{ id: 'image-test', merchantId: 98001, username: 'image_test', shopName: '测试店铺', status: 1, permissions: ['merchant.products'], ...passwordRecord('isolated-image-test-only') }]
  store.save()
  const listener = net.createServer()
  listener.listen(0, '127.0.0.1')
  await once(listener, 'listening')
  const port = listener.address().port
  await new Promise(resolve => listener.close(resolve))
  base = `http://127.0.0.1:${port}`
  server = spawn(process.execPath, ['src/index.js'], {
    cwd: serverDirectory,
    env: { PATH: process.env.PATH, NODE_ENV: 'test', PORT: String(port), DATA_FILE: process.env.DATA_FILE, SESSION_SECRET: 'isolated-image-api-test', ADMIN_PASSWORD: 'isolated-admin-test-only' },
    stdio: 'ignore'
  })
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await request('/api/home'); break } catch (error) {
      if (attempt === 99 || server.exitCode != null) throw error
      await new Promise(resolve => setTimeout(resolve, 25))
    }
  }
  token = (await request('/api/merchant/login', { method: 'POST', body: { username: 'image_test', password: 'isolated-image-test-only' } })).token
})

test.after(async () => {
  if (server && server.exitCode == null) { server.kill('SIGTERM'); await once(server, 'exit') }
  fs.rmSync(directory, { recursive: true, force: true })
})

test('merchant cover-only payload updates the public product and retains other gallery pictures', async () => {
  const images = [{ id: 'front', src: 'https://example.test/front.jpg', label: '主图' }, { id: 'detail', src: 'https://example.test/detail.jpg', label: '细节' }]
  const created = await request('/api/merchant/products', { method: 'POST', authenticated: true, body: { title: '主图同步测试商品', memberPrice: 10, price: 12, images } })
  const payload = { ...created, coverImage: 'https://example.test/new.jpg' }
  delete payload.images
  const updated = await request(`/api/merchant/products/${created.id}`, { method: 'PUT', authenticated: true, body: payload })
  assert.equal(updated.coverImage, payload.coverImage)
  assert.deepEqual(updated.images, [{ ...images[0], src: payload.coverImage }, images[1]])
  const displayed = (await request('/api/products')).find(row => row.id === created.id)
  assert.equal(displayed.coverImage, payload.coverImage)
  assert.deepEqual(displayed.images, updated.images)
})

test('explicit gallery list wins over an old cover in an API update', async () => {
  const row = await request('/api/merchant/products', { method: 'POST', authenticated: true, body: {
    title: '轮播排序测试商品', memberPrice: 10, price: 12,
    images: [{ id: 'a', src: 'https://example.test/a.jpg', label: '正面' }, { id: 'b', src: 'https://example.test/b.jpg', label: '背面' }]
  } })
  const images = [...row.images].reverse()
  const updated = await request(`/api/merchant/products/${row.id}`, { method: 'PUT', authenticated: true, body: { images, coverImage: row.coverImage } })
  assert.deepEqual(updated.images, images)
  assert.equal(updated.coverImage, images[0].src)
})
