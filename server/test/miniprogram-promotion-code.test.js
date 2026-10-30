import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const referral = require('../../miniprogram/utils/referral.js')
const imageResult = { imageBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB', mimeType: 'image/png', envVersion: 'release' }
const tick = () => new Promise((resolve) => setImmediate(resolve))

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function managerHarness(overrides = {}, wxOverrides = {}) {
  const state = { user: { id: 'user1' }, manager: { id: '101', status: 1 }, isManager: true }
  const apiCalls = [], writes = [], removed = [], saved = [], messages = [], patches = []
  const files = new Set()
  const store = {
    ready: async () => {}, refreshConfig: async () => {}, refreshUserProfile: async () => {},
    get: () => state, getOwnManager: () => state.manager, getCurrentUserId: () => state.user.id,
    getCopy: () => ({ shareManagerTitle: '推荐活动' }), money: (value) => Number(value || 0).toFixed(2),
    loadManagerDashboard: async () => ({ manager: state.manager }),
    loadManagerPromotionCode: async (id) => { apiCalls.push(id); return imageResult },
    ...overrides
  }
  const filesystem = {
    writeFile: (options) => { writes.push(options); files.add(options.filePath); options.success() },
    unlink: (options) => { removed.push(options.filePath); files.delete(options.filePath); options.success() }
  }
  const wx = {
    env: { USER_DATA_PATH: '/wx-user' }, getFileSystemManager: () => filesystem,
    saveImageToPhotosAlbum: (options) => { saved.push(options.filePath); options.success() },
    showToast: (options) => messages.push({ type: 'toast', ...options }),
    showModal: (options) => messages.push({ type: 'modal', ...options }),
    openSetting: () => messages.push({ type: 'settings' }),
    ...wxOverrides
  }
  let definition
  vm.runInNewContext(fs.readFileSync(new URL('../../miniprogram/pages/manager/manager.js', import.meta.url), 'utf8'), {
    Page: (value) => { definition = value }, wx,
    require: (id) => id.includes('referral') ? referral : store
  })
  const page = { ...definition, data: structuredClone(definition.data) }
  page.setData = (patch, callback) => { patches.push(patch); Object.assign(page.data, patch); if (callback) callback() }
  page.data.manager = { ...state.manager }
  page.verifiedPromotionIdentity = 'user1:101'
  return { page, state, store, wx, filesystem, files, apiCalls, writes, removed, saved, messages, patches }
}

test('promotion code uses protected API result and writes a local file, then reuses it', async () => {
  const h = managerHarness()
  const path = await h.page.loadPromotionCode()
  assert.match(path, /^\/wx-user\/manager-promotion-101-.+\.png$/)
  assert.equal(h.page.data.promotionCodePath, path)
  assert.equal(h.writes[0].encoding, 'base64')
  assert.equal(h.writes[0].data, imageResult.imageBase64)
  assert.equal(h.page.data.promotionCodeLoading, false)
  assert.equal(await h.page.loadPromotionCode(), path)
  assert.deepEqual(h.apiCalls, ['101'])
})

test('promotion code deduplicates simultaneous loading requests', async () => {
  const gate = deferred()
  let calls = 0
  const h = managerHarness({ loadManagerPromotionCode: async () => { calls += 1; return gate.promise } })
  const first = h.page.loadPromotionCode()
  const second = h.page.loadPromotionCode()
  assert.equal(first, second)
  gate.resolve(imageResult)
  await Promise.all([first, second])
  assert.equal(calls, 1)
  assert.equal(h.writes.length, 1)
})

test('promotion API failure remains visible and retry can recover', async () => {
  const h = managerHarness({ loadManagerPromotionCode: async () => { throw new Error('微信服务暂不可用') } })
  assert.equal(await h.page.loadPromotionCode(), '')
  assert.equal(h.page.data.promotionCodeError, '微信服务暂不可用')
  assert.equal(h.page.data.promotionCodeLoading, false)
  assert.equal(h.writes.length, 0)
  h.store.loadManagerPromotionCode = async () => ({ ...imageResult, mimeType: 'image/jpeg' })
  await h.page.retryPromotionCode()
  assert.match(h.page.data.promotionCodePath, /\.jpg$/)
  assert.equal(h.page.data.promotionCodeError, '')
})

test('promotion rejects data URLs, unsupported content types and empty images', async () => {
  for (const value of [
    { ...imageResult, imageBase64: 'data:image/png;base64,AAAA' },
    { ...imageResult, mimeType: 'text/html' },
    { ...imageResult, imageBase64: '' }
  ]) {
    const h = managerHarness({ loadManagerPromotionCode: async () => value })
    assert.equal(await h.page.loadPromotionCode(), '')
    assert.equal(h.writes.length, 0)
    assert.match(h.page.data.promotionCodeError, /图片无效/)
  }
})

test('promotion local write failure cleans partial files and permits retry', async () => {
  const h = managerHarness()
  h.filesystem.writeFile = (options) => { h.writes.push(options); options.fail({ errMsg: '存储空间不足' }) }
  assert.equal(await h.page.loadPromotionCode(), '')
  assert.equal(h.page.data.promotionCodePath, '')
  assert.equal(h.page.data.promotionCodeError, '存储空间不足')
  assert.deepEqual(h.removed, [h.writes[0].filePath])
})

test('promotion account switch discards the prior account API response', async () => {
  const gate = deferred()
  const h = managerHarness({ loadManagerPromotionCode: () => gate.promise })
  const pending = h.page.loadPromotionCode()
  h.state.user.id = 'user2'
  h.state.manager = { id: '202', status: 1 }
  gate.resolve(imageResult)
  assert.equal(await pending, '')
  assert.equal(h.writes.length, 0)
  assert.equal(h.page.data.promotionCodePath, '')
  assert.equal(h.page.data.promotionCodeLoading, false)
  assert.match(h.page.data.promotionCodeError, /身份已变化/)
})

test('promotion account switch during file writing deletes the stale completed file', async () => {
  const h = managerHarness()
  let write
  h.filesystem.writeFile = (options) => { write = options }
  const pending = h.page.loadPromotionCode()
  await tick()
  h.state.user.id = 'user2'
  write.success()
  await pending
  assert.equal(h.page.data.promotionCodePath, '')
  assert.deepEqual(h.removed, [write.filePath])
})

test('promotion hide clears displayed local file and blocks late requests', async () => {
  const h = managerHarness()
  const file = await h.page.loadPromotionCode()
  h.page.onHide()
  assert.equal(h.page.data.promotionCodePath, '')
  assert.deepEqual(h.removed, [file])
  assert.equal(await h.page.loadPromotionCode(), '')
  assert.equal(h.apiCalls.length, 1)
})

test('returning during an old promotion download starts a fresh visible request', async () => {
  const oldCode = deferred()
  let calls = 0
  const h = managerHarness({ loadManagerPromotionCode: async () => ++calls === 1 ? oldCode.promise : imageResult })
  h.page.data.tab = 'promote'
  const firstShow = h.page.onShow()
  await tick()
  h.page.onHide()
  await h.page.onShow()
  const currentPath = h.page.data.promotionCodePath
  assert.ok(currentPath)
  assert.equal(calls, 2)
  oldCode.resolve(imageResult)
  await firstShow
  assert.equal(h.page.data.promotionCodePath, currentPath)
  assert.equal(h.writes.length, 1)
})

test('promotion unload cleans files completing after the page has left', async () => {
  const h = managerHarness()
  let write
  h.filesystem.writeFile = (options) => { write = options }
  const pending = h.page.loadPromotionCode()
  await tick()
  h.page.onUnload()
  const count = h.patches.length
  write.success()
  await pending
  assert.deepEqual(h.removed, [write.filePath])
  assert.equal(h.patches.length, count)
})

test('promotion old image error cannot clear a newly loaded image', async () => {
  const h = managerHarness()
  const file = await h.page.loadPromotionCode()
  h.page.onPromotionImageError({ currentTarget: { dataset: { path: 'old-file' } } })
  assert.equal(h.page.data.promotionCodePath, file)
  h.page.onPromotionImageError({ currentTarget: { dataset: { path: file } } })
  assert.equal(h.page.data.promotionCodePath, '')
  assert.match(h.page.data.promotionCodeError, /显示失败/)
})

test('promotion save deduplicates taps and saves the downloaded local file', async () => {
  const gate = deferred()
  const h = managerHarness({ loadManagerPromotionCode: () => gate.promise })
  const first = h.page.saveQr()
  const second = h.page.saveQr()
  gate.resolve(imageResult)
  await Promise.all([first, second])
  assert.equal(h.saved.length, 1)
  assert.equal(h.saved[0], h.page.data.promotionCodePath)
  assert.equal(h.page.data.promotionCodeSaving, false)
  assert.equal(h.messages.at(-1).title, '推广码已保存到相册')
})

test('promotion album permission denial asks the user before opening settings', async () => {
  const h = managerHarness({}, { saveImageToPhotosAlbum: (options) => options.fail({ errMsg: 'auth deny' }) })
  await h.page.saveQr()
  assert.equal(h.messages.at(-1).type, 'modal')
  assert.equal(h.messages.some((item) => item.type === 'settings'), false)
  h.messages.at(-1).success({ confirm: false })
  assert.equal(h.messages.some((item) => item.type === 'settings'), false)
})

test('promotion disabled or mismatched managers cannot request a code', async () => {
  for (const mutate of [
    (h) => { h.state.manager.status = 0 },
    (h) => { h.state.isManager = false },
    (h) => { h.page.data.manager.id = '202' },
    (h) => { h.page.data.manager.id = '../101' }
  ]) {
    const h = managerHarness()
    mutate(h)
    assert.equal(await h.page.loadPromotionCode(), '')
    assert.equal(h.apiCalls.length, 0)
  }
})

test('manager initial onLoad/onShow share one dashboard load and then fetch the code', async () => {
  const gate = deferred()
  let profiles = 0, dashboards = 0
  const h = managerHarness({ ready: () => gate.promise, refreshUserProfile: async () => { profiles += 1 } })
  h.store.loadManagerDashboard = async () => { dashboards += 1; return { manager: h.state.manager } }
  h.page.data.tab = 'promote'
  const first = h.page.onLoad()
  const second = h.page.onShow()
  gate.resolve()
  await Promise.all([first, second])
  assert.equal(profiles, 1)
  assert.equal(dashboards, 1)
  assert.equal(h.apiCalls.length, 1)
  assert.ok(h.page.data.promotionCodePath)
})

test('manager account changes during dashboard load cannot restore an old code or share path', async () => {
  const gate = deferred()
  const h = managerHarness({ loadManagerDashboard: () => gate.promise })
  await h.page.loadPromotionCode()
  const pending = h.page.load()
  await tick()
  h.state.user.id = 'user2'
  h.state.manager = { id: '202', status: 1 }
  gate.resolve({ manager: { id: '101', status: 1 } })
  await pending
  assert.equal(h.page.data.promotionCodePath, '')
  assert.equal(h.page.verifiedPromotionIdentity, '')
  assert.equal(h.page.onShareAppMessage().path, '/pages/index/index')
})

test('manager dashboard failure keeps code unavailable and avoids duplicate application guidance', async () => {
  const h = managerHarness({ loadManagerDashboard: async () => { throw new Error('主理人已停用') } })
  await h.page.load()
  assert.equal(h.page.data.denied, true)
  assert.equal(h.page.data.canApply, false)
  assert.equal(h.page.data.promotionCodePath, '')
  assert.equal(h.apiCalls.length, 0)
})

test('manager share retains the existing valid in-app referral path', () => {
  const h = managerHarness()
  assert.equal(h.page.onShareAppMessage().path, '/pages/index/index?ref=101')
})

function appHarness() {
  const binds = []
  let pending = null, initialized = 0, app
  const store = {
    init: () => { initialized += 1 },
    getPendingBind: () => pending,
    setPendingBind: (id, source) => { pending = id; binds.push({ id, source }) }
  }
  vm.runInNewContext(fs.readFileSync(new URL('../../miniprogram/app.js', import.meta.url), 'utf8'), {
    App: (value) => { app = value }, require: (id) => id.includes('referral') ? referral : store
  })
  return { app, binds, clearPending: () => { pending = null }, initialized: () => initialized }
}

test('cold scanning encoded scene captures once across onLaunch/onShow and never binds automatically', () => {
  const h = appHarness()
  const options = { query: { scene: 'ref%3D101' } }
  h.app.onLaunch(options)
  h.app.onShow(options)
  assert.deepEqual(h.binds, [{ id: '101', source: 1 }])
  assert.equal(h.initialized(), 1)
})

test('cold opening a shared ref link keeps link attribution and deduplicates launch/show', () => {
  const h = appHarness()
  const options = { query: { ref: '101' } }
  h.app.onLaunch(options)
  h.app.onShow(options)
  assert.deepEqual(h.binds, [{ id: '101', source: 2 }])
})

test('hot scanning captures new codes and permits the same code after a normal entry', () => {
  const h = appHarness()
  h.app.onShow({ query: {} })
  h.app.onShow({ query: { scene: 'ref=101' } })
  h.clearPending()
  h.app.onShow({ query: { scene: 'ref=101' } })
  assert.equal(h.binds.length, 1)
  h.app.onShow({ query: { scene: 'ref=202' } })
  assert.equal(h.binds.at(-1).id, '202')
  h.clearPending()
  h.app.onShow({ query: {} })
  h.app.onShow({ query: { scene: 'ref=202' } })
  assert.equal(h.binds.length, 3)
})

test('malformed, duplicate, double-encoded and non-numeric referral IDs are rejected', () => {
  for (const query of [
    { ref: '../101' }, { ref: '1&admin=1' }, { ref: '-1' }, { ref: '0' }, { ref: '1.5' },
    { ref: ['101'] }, { ref: {} }, { scene: '%E0%A4%A' }, { scene: 'ref=101&ref=202' },
    { scene: 'ref%253D101' }, { scene: 'ref=abc' }, { scene: 'ref=1=2' },
    { scene: 'ref=' + '1'.repeat(21) }, { scene: 101 }
  ]) assert.equal(referral.parseReferral(query), null, JSON.stringify(query))
  assert.deepEqual(referral.parseReferral({ ref: '101', scene: 'ref=202' }), { managerId: '101', source: 2 })
})

test('pending same-manager referral is not duplicated by a second entry source', () => {
  const h = appHarness()
  h.app.onLaunch({ query: { ref: '101' } })
  h.app.onShow({ query: { scene: 'ref=101' } })
  assert.equal(h.binds.length, 1)
})

test('promotion API wrapper uses authenticated GET with no invented environment argument', async () => {
  const calls = [], module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(new URL('../../miniprogram/services/api.js', import.meta.url), 'utf8'), {
    module, exports: module.exports,
    require: () => ({ api: { get: async (path) => { calls.push(path); return imageResult } } })
  })
  await module.exports.loadManagerPromotionCode('101')
  assert.deepEqual(calls, ['/managers/101/promotion-code'])
})

test('promotion store requires login and rejects invalid IDs before reaching its API', async () => {
  const calls = [], module = { exports: {} }
  let auth = 0
  vm.runInNewContext(fs.readFileSync(new URL('../../miniprogram/store/index.js', import.meta.url), 'utf8'), {
    module, exports: module.exports,
    require: (id) => {
      if (id.includes('referral')) return referral
      if (id.includes('store-helpers')) return require('../../miniprogram/utils/store-helpers.js')
      if (id.includes('request')) return { ensureLogin: async () => { auth += 1 } }
      if (id.includes('config')) return { API_BASE: 'https://example.test' }
      return { loadManagerPromotionCode: async (managerId) => { calls.push(managerId); return imageResult } }
    }
  })
  await assert.rejects(module.exports.loadManagerPromotionCode('../101'), /主理人信息无效/)
  assert.equal(calls.length, 0)
  await module.exports.loadManagerPromotionCode('101')
  assert.deepEqual(calls, ['101'])
  assert.equal(auth, 2)
})
