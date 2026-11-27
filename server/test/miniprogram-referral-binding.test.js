import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const helpers = require('../../miniprogram/utils/store-helpers.js')
const referral = require('../../miniprogram/utils/referral.js')
const storeSource = fs.readFileSync(new URL('../../miniprogram/store/index.js', import.meta.url), 'utf8')

function profileView(boundManager) {
  return {
    user: { id: 'u1' },
    cards: [],
    coupons: [],
    boundManager,
    addresses: [],
    isManager: false,
    manager: null,
    application: null,
    bindLogs: [],
    pendingUnbind: null,
    providerApplication: null
  }
}

function loadStore(options = {}) {
  const storage = new Map()
  const calls = { binds: [], toasts: [] }
  let loggedIn = options.loggedIn !== false
  const profile = profileView(options.boundManager || null)
  const api = {
    fetchHome: async () => ({ activities: [], products: [], regions: [], contentPosts: [], banners: [], categories: {}, config: {} }),
    fetchReviews: async () => [],
    fetchManagers: async () => [],
    fetchLives: async () => [],
    fetchUserProfile: async () => profile,
    fetchOrders: async () => [],
    fetchParticipants: async () => [],
    bindByManagerId: async (managerId, source) => {
      calls.binds.push({ managerId: String(managerId), source })
      if (options.bind) return options.bind(managerId, source)
      return { id: Number(managerId), name: '主理人甲', inviteCode: 'CODEA', status: 1 }
    }
  }
  const wx = {
    getStorageSync: (key) => storage.get(key) ?? '',
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: (key) => storage.delete(key),
    showLoading: () => {},
    hideLoading: () => {},
    showToast: (value) => calls.toasts.push(value)
  }
  const module = { exports: {} }
  vm.runInNewContext(storeSource, {
    module,
    exports: module.exports,
    wx,
    require: (id) => {
      if (id.includes('store-helpers')) return helpers
      if (id.includes('referral')) return referral
      if (id.includes('request')) {
        return {
          ensureLogin: async () => {},
          isLoggedIn: () => loggedIn,
          getCurrentUserId: () => 'u1'
        }
      }
      if (id.includes('config')) return { API_BASE: 'https://example.test' }
      return api
    }
  })
  return {
    store: module.exports,
    storage,
    calls,
    profile,
    setLoggedIn: (value) => { loggedIn = value }
  }
}

test('首次进入记录主理人来源，后续不同主理人的链接不覆盖', () => {
  const h = loadStore()
  h.store.setPendingBind('101', 2)
  h.store.setPendingBind('202', 1)
  assert.equal(h.store.getPendingBind(), '101')
  const saved = [...h.storage.values()][0]
  assert.equal(saved.managerId, '101')
  assert.equal(saved.source, 2)
})

test('无效主理人 ID 和非法来源不会写入首触记录', () => {
  const h = loadStore()
  for (const id of ['', '0', '../101', '1.5', null, undefined, ['101']]) h.store.setPendingBind(id, 2)
  assert.equal(h.store.getPendingBind(), null)
  h.store.setPendingBind('101', 99)
  assert.equal(h.store.getPendingBind(), '101')
  assert.equal([...h.storage.values()][0].source, 2)
})

test('未登录时保留首触来源，登录后自动绑定并清除记录', async () => {
  const h = loadStore({ loggedIn: false })
  h.store.setPendingBind('101', 2)
  assert.equal(await h.store.syncReferralBinding(), null)
  assert.equal(h.calls.binds.length, 0)
  assert.equal(h.store.getPendingBind(), '101')

  h.setLoggedIn(true)
  const manager = await h.store.syncReferralBinding()
  assert.equal(manager.id, 101)
  assert.deepEqual(h.calls.binds, [{ managerId: '101', source: 2 }])
  assert.equal(h.store.getPendingBind(), null)
  assert.equal(h.store.get().boundManager.id, 101)
  assert.equal(h.store.takeBindNotice().id, 101)
  assert.equal(h.store.takeBindNotice(), null, '同一次绑定只提示一次')
})

test('已经绑定主理人的会员不会再请求绑定，也不改变归属', async () => {
  const h = loadStore({ boundManager: { id: 101, name: '主理人甲', inviteCode: 'CODEA' } })
  h.store.setPendingBind('202', 2)
  assert.equal(await h.store.syncReferralBinding(), null)
  assert.equal(h.calls.binds.length, 0)
  assert.equal(h.store.getPendingBind(), null)
  assert.equal(h.store.get().boundManager.id, 101)
  assert.equal(h.store.takeBindNotice(), null)
})

test('未绑定会员打开其他主理人的链接，服务端保留原归属时客户端也不提示换绑', async () => {
  const h = loadStore({
    bind: async () => ({ id: 101, name: '主理人甲', inviteCode: 'CODEA', status: 1 })
  })
  h.store.setPendingBind('202', 2)
  const manager = await h.store.syncReferralBinding()
  assert.equal(manager.id, 101)
  assert.equal(h.store.get().boundManager.id, 101)
  assert.equal(h.store.getPendingBind(), null)
  assert.equal(h.store.takeBindNotice(), null)
})

test('明确拒绝的主理人链接不重复重试，网络错误保留来源稍后再试', async () => {
  const rejected = new Error('该主理人当前不可绑定')
  rejected.statusCode = 400
  const h = loadStore({ bind: async () => { throw rejected } })
  h.store.setPendingBind('202', 2)
  assert.equal(await h.store.syncReferralBinding(), null)
  assert.equal(h.store.getPendingBind(), null, '无效链接不应反复重试')

  const network = new Error('网络错误')
  const retry = loadStore({ bind: async () => { throw network } })
  retry.store.setPendingBind('202', 2)
  assert.equal(await retry.store.syncReferralBinding(), null)
  assert.equal(retry.store.getPendingBind(), '202', '网络失败保留首触来源')
})

test('同时进入多次只发起一次绑定请求', async () => {
  const h = loadStore()
  h.store.setPendingBind('101', 2)
  const [first, second] = await Promise.all([
    h.store.syncReferralBinding(),
    h.store.syncReferralBinding()
  ])
  assert.equal(first.id, 101)
  assert.equal(second.id, 101)
  assert.equal(h.calls.binds.length, 1)
})

function loadDetail(storeStub) {
  let page
  vm.runInNewContext(fs.readFileSync(new URL('../../miniprogram/pages/detail/detail.js', import.meta.url), 'utf8'), {
    Page: (definition) => { page = definition },
    require: () => storeStub,
    wx: { showToast: () => {} }
  })
  return page
}

function sharePath(own, activity) {
  const page = loadDetail({
    getOwnManager: () => own,
    getBrand: () => ({ chineseName: '岁月里' })
  })
  page.data = { id: '9001', activity }
  return page.onShareAppMessage().path
}

test('主理人分享任意活动都以自己的身份作为推荐来源', () => {
  const own = { id: 777, status: 1 }
  assert.equal(
    sharePath(own, { title: '平台活动', publisherType: 'platform', managerId: null }),
    '/pages/detail/detail?id=9001&ref=777'
  )
  assert.equal(
    sharePath(own, { title: '其他商家活动', publisherType: 'merchant', managerId: 888 }),
    '/pages/detail/detail?id=9001&ref=777'
  )
})

test('普通用户分享商家活动沿用内容归属，平台自营内容不带推荐来源', () => {
  assert.equal(
    sharePath(null, { title: '商家活动', publisherType: 'merchant', managerId: 888 }),
    '/pages/detail/detail?id=9001&ref=888'
  )
  assert.equal(
    sharePath(null, { title: '平台活动', publisherType: 'platform', managerId: null }),
    '/pages/detail/detail?id=9001'
  )
})

test('停用的主理人分享时不携带推荐来源', () => {
  assert.equal(
    sharePath({ id: 777, status: 2 }, { title: '平台活动', publisherType: 'platform', managerId: null }),
    '/pages/detail/detail?id=9001'
  )
  assert.equal(
    sharePath({ id: 777, status: 3 }, { title: '商家活动', publisherType: 'merchant', managerId: 888 }),
    '/pages/detail/detail?id=9001&ref=888'
  )
})
