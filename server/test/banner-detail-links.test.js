import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'suiyueli-banner-links-'))
const dataFile = path.join(directory, 'data.json')
process.env.DATA_FILE = dataFile
const initialStore = await import('../src/store.js')
const initial = structuredClone(initialStore.init())
let revision = 0

async function loadStore(prepare = () => {}) {
  const db = structuredClone(initial)
  prepare(db)
  fs.writeFileSync(dataFile, JSON.stringify(db))
  const store = await import(`../src/store.js?banner=${++revision}`)
  store.init()
  return store
}

test.after(() => fs.rmSync(directory, { recursive: true, force: true }))

test('old list banners bind once to the uniquely matching published detail, without guessing among duplicates', async () => {
  const store = await loadStore(db => {
    db.activities = [
      { ...db.activities[0], id: 120, title: '徒步活动', status: 1 },
      { ...db.activities[0], id: 121, title: '同名服务', status: 1 }
    ]
    db.products = [{ ...db.products[0], id: 122, title: '同名服务', status: 1 }]
    db.banners = [
      { id: 201, title: '徒步活动', linkUrl: '/pages/list/list' },
      { id: 202, title: '同名服务', linkUrl: '/pages/list/list' },
      { id: 203, title: '徒步活动', linkUrl: 'https://example.org/pages/list/list' }
    ]
  })
  const link = (id) => store.listBanners().find(banner => banner.id === id).linkUrl
  assert.equal(link(201), '/pages/detail/detail?id=120')
  assert.equal(link(202), '/pages/list/list')
  assert.equal(link(203), 'https://example.org/pages/list/list')
  store.get().activities[0].title = '徒步活动的新名称'
  assert.equal(link(201), '/pages/detail/detail?id=120')
  const saved = JSON.parse(fs.readFileSync(dataFile))
  assert.equal(saved.banners[0].linkUrl, '/pages/detail/detail?id=120')
})

test('seed banners open the advertised activity and the membership entry remains reachable', async () => {
  const store = await loadStore(db => {
    db.banners.forEach(b => {
      delete b.linkResolutionVersion
      delete b.linkUrl
    })
    db.banners.find(b => b.id === 2).linkUrl = '/pages/list/list?category=2'
  })
  const banners = store.listBanners()
  assert.equal(banners.find(b => b.id === 1).linkUrl, '/pages/detail/detail?id=1')
  assert.equal(banners.find(b => b.id === 2).linkUrl, '/pages/detail/detail?id=3')
  assert.equal(banners.find(b => b.id === 3).linkUrl, '/pages/profile/profile')
})

test('operators can rebind a legacy banner without uploading media, or explicitly leave it unlinked', async () => {
  const store = await loadStore()
  store.updateBanner(1, { linkUrl: '/pages/content-detail/content-detail?id=news-1' })
  const get = (admin = false) => store.listBanners(admin).find(b => b.id === 1).linkUrl
  assert.equal(get(), '/pages/content-detail/content-detail?id=news-1')
  store.get().contentPosts.find(post => post.id === 'news-1').status = 0
  assert.equal(get(), '')
  assert.equal(get(true), '/pages/content-detail/content-detail?id=news-1')
  assert.throws(() => store.updateBanner(2, { linkUrl: get(true) }))
  store.updateBanner(1, { linkUrl: '' })
  assert.equal(get(true), '')
  assert.equal(get(), '')
})
