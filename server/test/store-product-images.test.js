import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'suiyueli-product-images-'))
process.env.DATA_FILE = path.join(directory, 'data.json')
const store = await import(`../src/store.js?product-images=${Date.now()}`)
test.after(() => fs.rmSync(directory, { recursive: true, force: true }))

const images = [
  { id: 'front', src: 'https://example.test/front.jpg', label: '正面' },
  { id: 'detail', src: 'https://example.test/detail.jpg', label: '细节' }
]

function product() {
  const database = store.init()
  database.products = []
  return store.createProduct({ title: '主图同步测试', publisherType: 'platform', memberPrice: 10, price: 12, images })
}

test('cover-only update replaces the first image and preserves gallery metadata', () => {
  const row = product()
  const updated = store.updateProduct(row.id, { coverImage: 'https://example.test/new.jpg' })
  assert.equal(updated.coverImage, 'https://example.test/new.jpg')
  assert.deepEqual(updated.images, [{ ...images[0], src: updated.coverImage }, images[1]])
  const persisted = JSON.parse(fs.readFileSync(process.env.DATA_FILE, 'utf8')).products[0]
  assert.deepEqual(persisted.images, updated.images)
})

test('explicit gallery order takes precedence over a stale cover field', () => {
  const row = product()
  const updated = store.updateProduct(row.id, { coverImage: row.coverImage, images: [images[1], images[0]] })
  assert.equal(updated.coverImage, images[1].src)
  assert.deepEqual(updated.images, [images[1], images[0]])
})

test('explicit empty gallery and removed cover are rejected without changing stored images', () => {
  const row = product()
  assert.throws(() => store.updateProduct(row.id, { images: [], coverImage: row.coverImage }), /请至少上传/)
  assert.throws(() => store.updateProduct(row.id, { coverImage: '' }), /请至少上传/)
  assert.deepEqual(store.get().products[0].images, images)
})

test('unrelated updates preserve gallery and legacy cover-only products can replace their cover', () => {
  const row = product()
  assert.deepEqual(store.updateProduct(row.id, { title: '改名' }).images, images)
  delete store.get().products[0].images
  const updated = store.updateProduct(row.id, { coverImage: 'https://example.test/legacy-new.jpg' })
  assert.equal(updated.images.length, 1)
  assert.equal(updated.images[0].src, updated.coverImage)
})
