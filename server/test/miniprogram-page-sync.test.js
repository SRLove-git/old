import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

// Execute unchanged page modules with isolated wx/store doubles: no network,
// storage, payments, or shared production fixtures are used by these tests.
function loadPage(name, store, overrides = {}, qr = {}) {
  const calls = []
  const wx = {
    showToast: (value) => calls.push({ type: 'toast', ...value }),
    navigateTo: (value) => calls.push({ type: 'navigate', ...value }),
    ...overrides
  }
  let definition
  const filename = fileURLToPath(new URL(`../../miniprogram/pages/${name}/${name}.js`, import.meta.url))
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    Page: (value) => { definition = value },
    require: (id) => id.includes('qrcode') ? qr : store,
    wx
  }, { filename })
  const page = { ...definition, data: structuredClone(definition.data) }
  page.setData = (patch, callback) => {
    Object.assign(page.data, patch)
    if (callback) callback()
  }
  return { page, calls }
}

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

const tick = () => new Promise((resolve) => setImmediate(resolve))
const input = (value) => ({ detail: { value } })
const shipment = (overrides = {}) => ({
  lastSyncedAt: '',
  events: [{ description: '已揽收' }, { description: '运输中' }],
  ...overrides
})

function logisticsStore(overrides = {}) {
  return {
    requireLogin: async () => {},
    refreshOrders: async () => [{ id: 'SYL1', status: '待收货', trackingNo: 'JT123456' }],
    getOrderLogistics: async () => shipment(),
    refreshOrderLogistics: async () => shipment({ events: [{ description: '已到站' }] }),
    ...overrides
  }
}

test('logistics reads newly shipped orders before querying and refreshes old traces', async () => {
  const order = []
  const store = logisticsStore({
    get: () => ({ orders: [{ id: 'SYL1', status: '待发货' }] }),
    refreshOrders: async () => { order.push('orders'); return [{ id: 'SYL1', status: '待收货', trackingNo: 'JT123456' }] },
    getOrderLogistics: async () => { order.push('cache'); return shipment() },
    refreshOrderLogistics: async () => { order.push('refresh'); return shipment({ events: [{ description: '已到站' }] }) }
  })
  const { page } = loadPage('logistics-query', store)
  page.data.query = ' SYL1 '
  await page.queryLogistics()
  assert.deepEqual(order, ['orders', 'cache', 'refresh'])
  assert.equal(page.data.order.status, '待收货')
  assert.equal(page.data.events[0].description, '已到站')
  assert.equal(page.data.loading, false)
})

test('logistics skips provider refresh during the 30 second cache window', async () => {
  let refreshed = 0
  const { page } = loadPage('logistics-query', logisticsStore({
    getOrderLogistics: async () => shipment({ lastQueryAt: new Date().toISOString() }),
    refreshOrderLogistics: async () => { refreshed += 1 }
  }))
  page.data.query = 'SYL1'
  await page.queryLogistics()
  assert.equal(refreshed, 0)
  assert.equal(page.data.events[0].description, '运输中')
})

test('logistics 429 rereads server cache once and retains usable traces', async () => {
  let reads = 0, refreshes = 0
  const { page } = loadPage('logistics-query', logisticsStore({
    getOrderLogistics: async () => { reads += 1; return shipment({ events: [{ description: reads === 1 ? '运输中' : '已到站' }] }) },
    refreshOrderLogistics: async () => { refreshes += 1; throw Object.assign(new Error('频繁'), { statusCode: 429 }) }
  }))
  page.data.query = 'SYL1'
  await page.queryLogistics()
  assert.equal(reads, 2)
  assert.equal(refreshes, 1)
  assert.equal(page.data.events[0].description, '已到站')
  assert.match(page.data.errorText, /较频繁/)
})

test('logistics refresh failure keeps old events and explicitly labels stale data', async () => {
  const { page } = loadPage('logistics-query', logisticsStore({
    refreshOrderLogistics: async () => { throw new Error('网络错误') }
  }))
  page.data.query = 'SYL1'
  await page.queryLogistics()
  assert.equal(page.data.events[0].description, '运输中')
  assert.match(page.data.errorText, /最近一次记录/)
})

test('logistics order refresh failure does not fall back to stale shipping status', async () => {
  let queried = false
  const { page } = loadPage('logistics-query', logisticsStore({
    refreshOrders: async () => { throw new Error('订单获取失败') },
    getOrderLogistics: async () => { queried = true }
  }))
  page.data.query = 'SYL1'
  await page.queryLogistics()
  assert.equal(queried, false)
  assert.equal(page.data.order, null)
  assert.equal(page.data.errorText, '订单获取失败')
  assert.equal(page.data.loading, false)
})

test('logistics still supports standalone tracking numbers and normalizes spaces', async () => {
  let number
  const { page } = loadPage('logistics-query', logisticsStore({
    refreshOrders: async () => [],
    queryLogistics: async (value) => { number = value; return { trackingNo: value, events: [{ description: '已到站' }] } }
  }))
  page.data.query = ' JT 2216313572522 '
  await page.queryLogistics()
  assert.equal(number, 'JT2216313572522')
  assert.equal(page.data.order.external, true)
  assert.equal(page.data.errorText, '')
})

test('logistics pending old query cannot overwrite a newer input/query result', async () => {
  const first = deferred()
  const { page } = loadPage('logistics-query', logisticsStore({
    refreshOrders: async () => [],
    queryLogistics: async (number) => number === 'FIRST1' ? first.promise : { trackingNo: number, events: [] }
  }))
  page.data.query = 'FIRST1'
  const pending = page.queryLogistics()
  await tick()
  page.onInput(input('SECOND2'))
  await page.queryLogistics()
  first.resolve({ trackingNo: 'FIRST1', events: [{ description: '旧查询' }] })
  await pending
  assert.equal(page.data.order.trackingNo, 'SECOND2')
  assert.equal(page.data.query, 'SECOND2')
  assert.equal(page.data.loading, false)
})

test('logistics clear cancels late rendering without reporting an empty error', async () => {
  const pendingOrders = deferred()
  const { page } = loadPage('logistics-query', logisticsStore({ refreshOrders: () => pendingOrders.promise }))
  page.data.query = 'SYL1'
  const pending = page.queryLogistics()
  await tick()
  page.clearQuery()
  pendingOrders.reject(new Error('旧请求失败'))
  await pending
  assert.equal(page.data.searched, false)
  assert.equal(page.data.errorText, '')
  assert.equal(page.data.order, null)
})

function balanceStore(overrides = {}) {
  const state = { user: { balance: 10, points: 1 }, config: {} }
  return {
    ready: async () => {},
    get: () => state,
    money: (value) => Number(value || 0).toFixed(2),
    refreshUserProfile: async () => { state.user = { balance: 100, points: 9 } },
    getBalanceTransactions: async () => [{ id: 'new', type: 'recharge', amount: 90, balanceAfter: 100 }],
    refreshConfig: async () => ({ balanceRechargeAmounts: [20, 50] }),
    ...overrides
  }
}

test('balance refreshes profile and ledger together instead of showing cached user', async () => {
  const { page } = loadPage('balance', balanceStore())
  await page.onShow()
  assert.equal(page.data.balanceText, '100.00')
  assert.equal(page.data.points, 9)
  assert.equal(page.data.transactions[0].balanceAfterText, '100.00')
  assert.deepEqual(Array.from(page.data.amounts), [20, 50])
})

test('balance ledger failure preserves the prior complete snapshot and reports failure', async () => {
  const { page, calls } = loadPage('balance', balanceStore({ getBalanceTransactions: async () => { throw new Error('流水获取失败') } }))
  page.data.balanceText = '10.00'
  page.data.transactions = [{ id: 'old' }]
  await page.onShow()
  assert.equal(page.data.balanceText, '10.00')
  assert.equal(page.data.transactions[0].id, 'old')
  assert.equal(calls.at(-1).title, '流水获取失败')
})

test('balance profile failure does not pair fresh ledger with cached balance', async () => {
  const { page } = loadPage('balance', balanceStore({ refreshUserProfile: async () => { throw new Error('会员信息失败') } }))
  page.data.balanceText = '10.00'
  page.data.transactions = [{ id: 'old' }]
  await page.onShow()
  assert.equal(page.data.balanceText, '10.00')
  assert.equal(page.data.transactions[0].id, 'old')
})

test('balance slower earlier response cannot replace the latest snapshot', async () => {
  const oldLedger = deferred()
  let ledgerReads = 0
  const store = balanceStore({ getBalanceTransactions: () => ++ledgerReads === 1 ? oldLedger.promise : Promise.resolve([{ id: 'new', amount: 190, balanceAfter: 200 }]) })
  const { page } = loadPage('balance', store)
  const first = page.onShow()
  await tick()
  store.refreshUserProfile = async () => { store.get().user = { balance: 200 } }
  await page.onShow()
  oldLedger.resolve([{ id: 'old', amount: 90, balanceAfter: 100 }])
  await first
  assert.equal(page.data.balanceText, '200.00')
  assert.equal(page.data.transactions[0].id, 'new')
})

test('balance refresh preserves a custom amount typed while data is loading', async () => {
  const gate = deferred()
  const { page } = loadPage('balance', balanceStore({ getBalanceTransactions: () => gate.promise }))
  const pending = page.onShow()
  await tick()
  page.inputAmount(input('88.88'))
  gate.resolve([])
  await pending
  assert.equal(page.data.customAmount, '88.88')
  assert.equal(page.data.rechargeAmountText, '88.88')
  assert.equal(page.data.selectedAmount, 0)
})

test('confirmed recharge is not mislabeled as failed when subsequent refresh fails', async () => {
  const { page, calls } = loadPage('balance', balanceStore({
    rechargeBalance: async () => {},
    getBalanceTransactions: async () => { throw new Error('网络错误') }
  }))
  await page.recharge()
  assert.equal(page.data.charging, false)
  assert.match(calls.at(-1).title, /充值已到账/)
})

test('balance leaving page suppresses late data and failure toasts', async () => {
  const gate = deferred()
  const { page, calls } = loadPage('balance', balanceStore({ getBalanceTransactions: () => gate.promise }))
  const pending = page.onShow()
  await tick()
  page.onUnload()
  gate.reject(new Error('网络错误'))
  await pending
  assert.equal(page.data.balanceText, '0.00')
  assert.equal(calls.length, 0)
})

function memberHarness(overrides = {}, delaySelector = false) {
  const state = { user: { id: 1, memberId: 'MEMBER1' } }
  const drawn = [], selectors = []
  const store = {
    ready: async () => {}, refreshConfig: async () => {}, refreshUserProfile: async () => {},
    get: () => state, getBrand: () => ({ chineseName: '岁悦里' }), getCopy: () => ({}),
    formatPhoneDisplay: () => '',
    ...overrides
  }
  const wx = {
    createCanvasContext: () => ({ draw: () => {} }),
    createSelectorQuery: () => {
      const query = {
        in: () => query, select: () => query,
        boundingClientRect: (callback) => { selectors.push(callback); if (!delaySelector) callback({ width: 200 }); return query },
        exec: () => {}
      }
      return query
    }
  }
  return { ...loadPage('member-code', store, wx, { draw: (_ctx, id) => drawn.push(id) }), state, store, drawn, selectors }
}

test('member QR waits for both async data and canvas readiness on cold load', async () => {
  const gate = deferred()
  const { page, drawn } = memberHarness({ ready: () => gate.promise })
  const pending = page.onLoad()
  page.onReady()
  assert.deepEqual(drawn, [])
  gate.resolve()
  await pending
  assert.deepEqual(drawn, ['MEMBER1'])
})

test('member QR draws when canvas becomes ready after data', async () => {
  const { page, drawn } = memberHarness()
  await page.onLoad()
  assert.deepEqual(drawn, [])
  page.onReady()
  assert.deepEqual(drawn, ['MEMBER1'])
})

test('member QR redraws changed backend member ID when page is shown again', async () => {
  const { page, state, drawn } = memberHarness()
  await page.onLoad()
  page.onReady()
  state.user = { id: 1, memberId: 'MEMBER2' }
  await page.onShow()
  assert.equal(page.data.memberId, 'MEMBER2')
  assert.deepEqual(drawn, ['MEMBER1', 'MEMBER2'])
})

test('member joining redraws the real new member ID and prevents duplicate requests', async () => {
  const gate = deferred()
  let requests = 0
  const { page, drawn } = memberHarness({ joinMember: () => { requests += 1; return gate.promise } })
  await page.onLoad()
  page.onReady()
  const pending = page.joinMember()
  await page.joinMember()
  gate.resolve({ user: { id: 1, memberId: 'JOINED1' } })
  await pending
  assert.equal(requests, 1)
  assert.equal(page.data.memberId, 'JOINED1')
  assert.deepEqual(drawn, ['MEMBER1', 'JOINED1'])
})

test('member joining during initial load cannot invalidate branding initialization', async () => {
  const gate = deferred()
  let requests = 0
  const { page, drawn } = memberHarness({
    ready: () => gate.promise,
    getCopy: () => ({ memberBenefitLines: '会员专享价' }),
    joinMember: async () => { requests += 1; return { user: { memberId: 'JOINED1' } } }
  })
  const pending = page.onLoad()
  page.onReady()
  await page.joinMember()
  assert.equal(requests, 0)
  gate.resolve()
  await pending
  assert.equal(page.pageLoaded, true)
  assert.equal(page.data.brandName, '岁悦里')
  assert.equal(page.data.benefits.length, 1)
  assert.deepEqual(drawn, ['MEMBER1'])
})

test('member late selector callbacks cannot paint a previous member ID', async () => {
  const { page, state, drawn, selectors } = memberHarness({}, true)
  await page.onLoad()
  page.onReady()
  state.user = { id: 1, memberId: 'MEMBER2' }
  page.applyBranding()
  selectors[1]({ width: 200 })
  selectors[0]({ width: 200 })
  assert.deepEqual(drawn, ['MEMBER2'])
})

test('member refresh errors preserve the displayed card and permit later retry', async () => {
  const { page, store, state, drawn, calls } = memberHarness()
  await page.onLoad()
  page.onReady()
  store.refreshUserProfile = async () => { throw new Error('会员刷新失败') }
  await page.onShow()
  assert.equal(page.data.memberId, 'MEMBER1')
  assert.equal(calls.at(-1).title, '会员刷新失败')
  store.refreshUserProfile = async () => { state.user.memberId = 'MEMBER2' }
  await page.onShow()
  assert.equal(drawn.at(-1), 'MEMBER2')
})

test('member unload suppresses late load and pending canvas callbacks', async () => {
  const gate = deferred()
  const cold = memberHarness({ ready: () => gate.promise })
  const pending = cold.page.onLoad()
  cold.page.onReady()
  cold.page.onUnload()
  gate.resolve()
  await pending
  assert.deepEqual(cold.drawn, [])
  const warm = memberHarness({}, true)
  await warm.page.onLoad()
  warm.page.onReady()
  warm.page.onUnload()
  warm.selectors[0]({ width: 200 })
  assert.deepEqual(warm.drawn, [])
})
test('content detail renders cached card then loads the synced body on demand', async () => {
  const fetched = []
  const store = {
    ready: async () => {},
    getBrand: () => ({ chineseName: '岁悦里' }),
    getContentPost: () => ({ id: 'WX1', type: 'news', title: '政策资讯', summary: '摘要', hasContent: true }),
    refreshHome: async () => {},
    fetchContentPost: async (id) => {
      fetched.push(id)
      return { id, type: 'news', title: '政策资讯', summary: '摘要', contentBlocks: [{ type: 'text', html: '<p>公众号正文</p>', text: '公众号正文' }] }
    }
  }
  const { page } = loadPage('content-detail', store, { setNavigationBarTitle: () => {} })
  await page.onLoad({ id: 'WX1' })
  await tick()
  await tick()
  assert.deepEqual(fetched, ['WX1'])
  assert.equal(page.data.post.contentBlocks.length, 1)
  assert.equal(page.data.post.contentBlocks[0].text, '公众号正文')
  assert.equal(page.data.bodyLoading, false)
})

test('content detail keeps the cached card when the body request fails', async () => {
  const store = {
    ready: async () => {},
    getBrand: () => ({ chineseName: '岁悦里' }),
    getContentPost: () => ({ id: 'WX2', type: 'news', title: '缓存卡片' }),
    refreshHome: async () => {},
    fetchContentPost: async () => { throw new Error('offline') }
  }
  const { page, calls } = loadPage('content-detail', store, { setNavigationBarTitle: () => {} })
  await page.onLoad({ id: 'WX2' })
  await tick()
  await tick()
  assert.equal(page.data.post.title, '缓存卡片')
  assert.equal(page.data.bodyLoading, false)
  assert.equal(calls.some(call => call.type === 'toast'), false)
})
