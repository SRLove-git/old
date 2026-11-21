import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

function loadPage(name, wx, store = {}) {
  const filename = new URL(`../../miniprogram/pages/${name}/${name}.js`, import.meta.url)
  let page
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    wx, require: () => store, Page: (definition) => { page = definition }
  }, { filename: filename.pathname })
  page.setData = (patch) => Object.assign(page.data, patch)
  return page
}

function homeHarness() {
  const navigation = [], notices = []
  const storage = new Map()
  const wx = {
    navigateTo: ({ url, fail }) => navigation.push({ method: 'navigateTo', url, fail }),
    switchTab: ({ url, fail }) => navigation.push({ method: 'switchTab', url, fail }),
    setStorageSync: (key, value) => storage.set(key, value),
    getStorageSync: (key) => storage.get(key) ?? '',
    removeStorageSync: (key) => storage.delete(key),
    showToast: ({ title }) => notices.push(title)
  }
  const home = loadPage('index', wx)
  return {
    wx, navigation, notices, storage,
    tap: (link, cat) => home.goBanner({ currentTarget: { dataset: { link, cat } } })
  }
}

test('没有推荐文章时可从首页进入本地区资讯列表', () => {
  const navigation = []
  const home = loadPage('index', { navigateTo: ({ url }) => navigation.push(url) }, {
    getContentPosts: () => [{ type: 'news', featured: false, regionIds: ['local'] }],
    getHomeDisplay: () => ({ newsLimit: 4, videoLimit: 2 }),
    getRegions: () => [{ id: 'local' }, { id: 'other' }]
  })
  home.setData({ city: 'local' })
  home.buildContent()
  assert.equal(home.data.newsPosts.length, 0)
  assert.equal(home.data.hasNews, true)
  const template = fs.readFileSync(new URL('../../miniprogram/pages/index/index.wxml', import.meta.url), 'utf8')
  assert.match(template, /wx:if="{{hasNews}}"[\s\S]*?data-type="news" bindtap="goContentList"/)
  home.goContentList({ currentTarget: { dataset: { type: 'news' } } })
  assert.equal(navigation[0], '/pages/content-list/content-list?type=news')
  home.setData({ city: 'other' })
  home.buildContent()
  assert.equal(home.data.hasNews, false)
})

test('configured detail links preserve the selected record ID, including string IDs and extra parameters', () => {
  const h = homeHarness()
  const destinations = [
    '/pages/detail/detail?id=1',
    '/pages/detail/detail?id=1520000123456',
    '/pages/live-room/live-room?id=live-2',
    '/pages/content-detail/content-detail?id=news-1',
    '/pages/content-detail/content-detail?id=video-2&from=banner',
    '/pages/merchant-shop/merchant-shop?id=101'
  ]
  for (const url of destinations) h.tap(url, 2)
  assert.deepEqual(h.navigation.map(({ method, url }) => [method, url]), destinations.map((url) => ['navigateTo', url]))
  assert.equal(h.storage.size, 0)
})

test('an empty or whitespace link stays on the current page even with historical cat data', () => {
  const h = homeHarness()
  for (const link of [undefined, '', '   ']) {
    h.tap(link, 1)
    h.tap(link, 0)
  }
  assert.equal(h.navigation.length, 0)
  assert.equal(h.storage.size, 0)
  assert.equal(h.notices.length, 0)
})

test('a configured external HTTPS page receives its full URL through the webview', () => {
  const h = homeHarness()
  const link = 'https://example.com/专题?q=a%2Fb&b=2#news'
  h.tap(link)
  const [nav] = h.navigation
  assert.equal(nav.method, 'navigateTo')
  assert.equal(nav.url, `/pages/webview/webview?url=${encodeURIComponent(link)}`)
})

test('explicit tab links use switchTab and legacy category links forward the selected category', () => {
  const h = homeHarness()
  for (const url of ['/pages/index/index', '/pages/lives/lives', '/pages/profile/profile']) h.tap(url)
  h.tap('/pages/list/list?category=4')
  assert.equal(h.storage.get('pendingCat'), 4)
  h.tap('/pages/list/list?cat=%32')
  assert.equal(h.storage.get('pendingCat'), 2)
  h.tap('/pages/list/list')
  assert.equal(h.storage.get('pendingCat'), 'all')
  assert.deepEqual(h.navigation.map(({ method, url }) => [method, url]), [
    ['switchTab', '/pages/index/index'], ['switchTab', '/pages/lives/lives'], ['switchTab', '/pages/profile/profile'],
    ['switchTab', '/pages/list/list'], ['switchTab', '/pages/list/list'], ['switchTab', '/pages/list/list']
  ])
})

test('category from a banner survives the destination tab’s overlapping cold load and show', async () => {
  const h = homeHarness()
  h.tap('/pages/list/list?category=2')
  const list = loadPage('list', h.wx, {
    ready: async () => {}, refreshHome: async () => {}, get: () => ({ categories: {} }),
    getRegions: () => [], getCatalogItems: () => []
  })
  await Promise.all([list.onLoad({}), list.onShow()])
  assert.equal(list.data.cat, '2')
  assert.equal(h.storage.has('pendingCat'), false)
  h.tap('/pages/list/list')
  await list.onShow()
  assert.equal(list.data.cat, 'all')
})

test('invalid links and failed navigation show feedback without sending the user elsewhere', () => {
  const h = homeHarness()
  h.tap('http://example.test', 1)
  h.tap('/pages/list/list?category=%')
  assert.equal(h.navigation.length, 0)
  assert.equal(h.storage.size, 0)
  h.tap('/pages/nonexistent/nonexistent')
  h.navigation.at(-1).fail()
  h.tap('/pages/list/list?cat=2')
  h.navigation.at(-1).fail()
  assert.equal(h.notices.length, 4)
  assert.equal(h.storage.size, 0)
})

test('a late switchTab failure preserves the user’s newer category selection', () => {
  const h = homeHarness()
  h.tap('/pages/list/list?category=2')
  h.tap('/pages/list/list?category=3')
  h.navigation[0].fail()
  assert.equal(h.storage.get('pendingCat'), 3)
})
