import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync(new URL('../../miniprogram/pages/logistics-query/logistics-query.js', import.meta.url), 'utf8')
const tick = () => new Promise((resolve) => setImmediate(resolve))
const input = (value) => ({ detail: { value } })
const deferred = () => {
  let resolve
  const promise = new Promise((yes) => { resolve = yes })
  return { promise, resolve }
}

function harness(overrides = {}) {
  const calls = [], clipboard = [], toasts = []
  let config
  const store = {
    ready: async () => {}, refreshConfig: async () => {}, getBrand: () => ({ chineseName: '岁悦里' }),
    requireLogin: async () => {}, refreshOrders: async () => [],
    getLogisticsCarriers: async () => [{ code: 'SF', name: '顺丰速运' }, { code: 'JD', name: '京东物流' }],
    queryLogistics: async (number, options) => {
      calls.push({ number, options })
      return { queryStatus: 'ok', carrier: '极兔速递', events: [{ description: '已到快递站' }] }
    },
    ...overrides
  }
  vm.runInNewContext(source, {
    require: () => store, Page: (value) => { config = value },
    wx: {
      showToast: (value) => toasts.push(value),
      setClipboardData: (value) => { clipboard.push(value.data); value.success() },
      setStorageSync: () => { throw new Error('物流查询禁止写入敏感缓存') },
      navigateTo: () => {}
    }
  })
  const page = { ...config, data: structuredClone(config.data) }
  page.setData = (patch) => Object.assign(page.data, patch)
  page.data.query = 'JT2216313572522'
  const select = (code) => page.onCarrierChange(input(page.data.carrierOptions.findIndex((item) => item.code === code)))
  return { page, store, calls, clipboard, toasts, select }
}

test('carrier list loads without authentication and accepts the complete server array', async () => {
  const carriers = Array.from({ length: 120 }, (_, index) => ({ code: `C${index}`, name: `公司${index}` }))
  let logins = 0
  const h = harness({ getLogisticsCarriers: async () => carriers, requireLogin: async () => { logins += 1 } })
  await h.page.loadCarriers()
  assert.equal(logins, 0)
  assert.equal(h.page.data.carriers.length, 122)
  h.page.onCarrierSearch(input('公司119'))
  assert.deepEqual(Array.from(h.page.data.carrierOptions, (item) => item.code), ['', 'C119', '__OTHER__'])
  h.select('C119')
  assert.equal(h.page.data.carrierCode, 'C119')
})

test('carrier list failure falls back to nine established companies plus auto/other', async () => {
  const h = harness({ getLogisticsCarriers: async () => { throw new Error('离线') } })
  await h.page.loadCarriers()
  assert.equal(h.page.data.carriers.length, 11)
  assert.ok(h.page.data.carriers.some((item) => item.code === 'JTSD'))
  assert.ok(h.page.data.carriers.some((item) => item.code === 'DBL'))
})

test('carrier selection preserves official lowercase, underscore and hyphen codes', async () => {
  const h = harness({ getLogisticsCarriers: async () => [{ code: 'official_lower-code', name: '某快递' }] })
  await h.page.loadCarriers()
  h.select('official_lower-code')
  await h.page.queryLogistics()
  assert.equal(h.calls[0].options.carrierCode, 'official_lower-code')
})

test('carrier filtering retains the selected item so auto selection remains reachable', () => {
  const h = harness()
  h.select('SF')
  h.page.onCarrierSearch(input('极兔'))
  assert.equal(h.page.data.carrierOptions[h.page.data.carrierIndex].code, 'SF')
  h.select('')
  assert.equal(h.page.data.carrierCode, '')
  assert.equal(h.page.directQueryRequested, false)
})

test('manual SF selection requires four phone digits without making a query', async () => {
  const h = harness()
  h.select('SF')
  await h.page.queryLogistics()
  assert.equal(h.calls.length, 0)
  assert.equal(h.page.data.resultState, 'verification_required')
  assert.equal(h.page.data.requiredField, 'phoneLast4')
  assert.match(h.page.data.guidance, /后4位/)
  h.page.onPhoneInput(input('123'))
  await h.page.queryLogistics()
  assert.equal(h.calls.length, 0)
})

test('manual JD selection requires the sender code and never silently uses a global code', async () => {
  const h = harness()
  h.select('JD')
  await h.page.queryLogistics()
  assert.equal(h.calls.length, 0)
  assert.equal(h.page.data.requiredField, 'jdCustomerCode')
  assert.match(h.page.data.guidance, /发件商家/)
  assert.match(h.page.data.guidance, /官方渠道/)
})

test('SF details are sent only in the SF field and never stored locally', async () => {
  const h = harness()
  h.select('SF')
  h.page.onPhoneInput(input('6789'))
  await h.page.queryLogistics()
  assert.equal(h.calls.length, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0].options)), { carrierCode: 'SF', phoneLast4: '6789', jdCustomerCode: '' })
  assert.equal(h.page.data.resultState, 'ok')
})

test('JD accepts the provided sender code and a carrier change clears sensitive fields', async () => {
  const h = harness()
  h.select('JD')
  h.page.onJdCodeInput(input('123456789A'))
  await h.page.queryLogistics()
  assert.equal(h.calls[0].options.jdCustomerCode, '123456789A')
  assert.equal(h.calls[0].options.phoneLast4, '')
  h.select('JTSD')
  assert.equal(h.page.data.jdCustomerCode, '')
  await h.page.queryLogistics()
  assert.equal(h.calls[1].options.jdCustomerCode, '')
})

test('automatic SF verification selects SF and does not display invented tracking events', async () => {
  const h = harness({ queryLogistics: async () => ({
    queryStatus: 'verification_required', requiredField: 'phoneLast4', carrierCode: 'SF',
    guidance: '请补手机号后4位', events: [{ description: '不应展示' }], latestDescription: '不应展示'
  }) })
  h.select('ZTO')
  await h.page.queryLogistics()
  assert.equal(h.page.data.carrierCode, 'SF')
  assert.equal(h.page.data.requiredField, 'phoneLast4')
  assert.equal(h.page.data.events.length, 0)
  assert.equal(h.page.data.logistics.latestDescription, '')
  assert.match(h.page.data.resultTitle, /补充/)
  h.page.onInput(input('JD987654321'))
  assert.equal(h.page.data.carrierCode, '')
})

test('automatic JD verification exposes a usable code field even when absent from server list', async () => {
  const h = harness({
    getLogisticsCarriers: async () => [{ code: 'ZTO', name: '中通' }],
    queryLogistics: async () => ({ queryStatus: 'verification_required', requiredField: 'jdCustomerCode', carrierCode: 'JD' })
  })
  await h.page.loadCarriers()
  await h.page.queryLogistics()
  assert.equal(h.page.data.carrierCode, 'JD')
  assert.equal(h.page.data.carrierOptions[h.page.data.carrierIndex].code, 'JD')
  assert.equal(h.page.data.requiredField, 'jdCustomerCode')
  assert.match(h.page.data.guidance, /青龙/)
})

test('no_tracking, verification_required and upstream errors have distinct visible states', async () => {
  const h = harness({ queryLogistics: async () => ({ queryStatus: 'no_tracking', reason: '尚无轨迹', events: [] }) })
  await h.page.queryLogistics()
  assert.equal(h.page.data.resultState, 'no_tracking')
  assert.equal(h.page.data.resultTitle, '暂未查到物流轨迹')
  assert.match(h.page.data.guidance, /核对单号/)
  h.store.queryLogistics = async () => { throw new Error('第三方暂不可用') }
  await h.page.retryQuery()
  assert.equal(h.page.data.resultState, 'error')
  assert.equal(h.page.data.resultTitle, '查询暂未成功')
  assert.equal(h.page.data.errorText, '第三方暂不可用')
})

test('an empty provider success response is presented as no tracking, not invented progress', async () => {
  const h = harness({ queryLogistics: async () => ({ queryStatus: 'ok', events: [], latestDescription: '运输中' }) })
  await h.page.queryLogistics()
  assert.equal(h.page.data.resultState, 'no_tracking')
  assert.equal(h.page.data.logistics.latestDescription, '')
  assert.equal(h.page.data.events.length, 0)
})

test('direct query throttling clearly suggests waiting or official query', async () => {
  const h = harness({ queryLogistics: async () => { throw Object.assign(new Error('查询过于频繁'), { statusCode: 429 }) } })
  await h.page.queryLogistics()
  assert.match(h.page.data.resultTitle, /频繁/)
  assert.match(h.page.data.guidance, /等待/)
  h.page.copyTrackingNumber()
  assert.deepEqual(h.clipboard, ['JT2216313572522'])
})

test('invalid query details guide corrections instead of diagnosing a network error', async () => {
  const h = harness({ queryLogistics: async () => { throw Object.assign(new Error('需要补充验证信息'), { statusCode: 400 }) } })
  await h.page.queryLogistics()
  assert.equal(h.page.data.errorText, '需要补充验证信息')
  assert.match(h.page.data.guidance, /核对快递公司、单号及验证信息/)
  assert.doesNotMatch(h.page.data.guidance, /检查网络/)
})

test('service permission failures and gateway failures have actionable distinct guidance', async () => {
  for (const statusCode of [503, 502, 504]) {
    const h = harness({ queryLogistics: async () => { throw Object.assign(new Error('服务暂不可用'), { statusCode }) } })
    await h.page.queryLogistics()
    if (statusCode === 503) assert.match(h.page.data.guidance, /客服.*权限.*额度/)
    else assert.match(h.page.data.guidance, /稍后重试/)
    assert.doesNotMatch(h.page.data.guidance, /检查网络/)
  }
})

test('owned shipment refresh failure without events preserves the actual cause', async () => {
  for (const statusCode of [400, 503]) {
    const message = statusCode === 400 ? '请提供发件方青龙编码' : '当前套餐未开通'
    const h = harness({
      refreshOrders: async () => [{ id: 'SYL1', trackingNo: 'JD123456789', status: '待收货' }],
      getOrderLogistics: async () => ({ events: [], lastQueryAt: '' }),
      refreshOrderLogistics: async () => { throw Object.assign(new Error(message), { statusCode }) }
    })
    h.page.data.query = 'SYL1'
    await h.page.queryLogistics()
    assert.equal(h.page.data.errorText, message)
    assert.doesNotMatch(h.page.data.errorText, /已显示最近/)
    assert.match(h.page.data.guidance, statusCode === 400 ? /验证信息/ : /权限.*额度/)
  }
})

test('owned orders keep their original path unless explicitly selecting a company', async () => {
  let orderReads = 0
  const h = harness({
    refreshOrders: async () => [{ id: 'SYL1', trackingNo: 'JT123456', status: '待收货' }],
    getOrderLogistics: async () => { orderReads += 1; return { lastQueryAt: new Date().toISOString(), events: [{ description: '到站' }] } }
  })
  h.page.data.query = 'SYL1'
  await h.page.queryLogistics()
  assert.equal(orderReads, 1)
  assert.equal(h.calls.length, 0)
  assert.equal(h.page.data.order.id, 'SYL1')
})

test('explicit owned-order query uses its tracking number without changing shipment data', async () => {
  const order = { id: 'SYL1', trackingNo: 'SF123456789', carrier: '顺丰速运', status: '待收货' }
  const snapshot = structuredClone(order)
  const h = harness({ refreshOrders: async () => [order], getOrderLogistics: () => { throw new Error('不应查缓存轨迹') } })
  h.page.data.query = 'SYL1'
  h.select('SF')
  h.page.onPhoneInput(input('1234'))
  await h.page.queryLogistics()
  assert.equal(h.calls[0].number, 'SF123456789')
  assert.equal(h.page.data.order.id, 'SYL1')
  assert.equal(h.page.data.order.external, undefined)
  assert.deepEqual(order, snapshot)
})

test('unowned platform order numbers are never sent to the carrier API', async () => {
  for (const number of ['SYL999999', 'JF999999']) {
    const h = harness()
    h.page.data.query = number
    h.select('ZTO')
    await h.page.queryLogistics()
    assert.equal(h.calls.length, 0)
    assert.equal(h.page.data.resultState, 'not_found')
    assert.match(h.page.data.resultTitle, /本账号/)
    h.page.copyTrackingNumber()
    assert.equal(h.clipboard.length, 0)
  }
})

test('owned unshipped orders cannot become direct carrier queries', async () => {
  const h = harness({ refreshOrders: async () => [{ id: 'SYL1', status: '待发货' }] })
  h.page.data.query = 'SYL1'
  h.select('ZTO')
  await h.page.queryLogistics()
  assert.equal(h.calls.length, 0)
  assert.equal(h.page.data.resultState, 'awaiting_shipment')
})

test('other carrier gives official-query guidance and copies only the tracking number', async () => {
  const h = harness({ refreshOrders: async () => [{ id: 'SYL1', trackingNo: 'X123456789' }] })
  h.page.data.query = 'SYL1'
  h.select('__OTHER__')
  await h.page.queryLogistics()
  assert.equal(h.calls.length, 0)
  assert.equal(h.page.data.resultState, 'other_carrier')
  h.page.copyTrackingNumber()
  assert.deepEqual(h.clipboard, ['X123456789'])
})

test('editing the tracking number clears phone/code details and auto-detected carrier', async () => {
  const h = harness({ queryLogistics: async () => ({ queryStatus: 'verification_required', requiredField: 'phoneLast4' }) })
  await h.page.queryLogistics()
  h.page.onPhoneInput(input('1234'))
  h.page.onInput(input('JD123456789'))
  assert.equal(h.page.data.phoneLast4, '')
  assert.equal(h.page.data.jdCustomerCode, '')
  assert.equal(h.page.data.carrierCode, '')
  assert.equal(h.page.data.searched, false)
})

test('changing a selected carrier discards late results from the old query', async () => {
  const gate = deferred()
  const h = harness({ queryLogistics: () => gate.promise })
  const pending = h.page.queryLogistics()
  await tick()
  h.select('JD')
  gate.resolve({ queryStatus: 'ok', events: [{ description: '旧轨迹' }] })
  await pending
  assert.equal(h.page.data.events.length, 0)
  assert.equal(h.page.data.searched, false)
  assert.equal(h.page.data.carrierCode, 'JD')
  assert.equal(h.page.data.loading, false)
})

test('changing verification input invalidates requests and retry uses current data', async () => {
  const gate = deferred()
  const h = harness({ queryLogistics: () => gate.promise })
  h.select('SF')
  h.page.onPhoneInput(input('1234'))
  const pending = h.page.queryLogistics()
  await tick()
  h.page.onPhoneInput(input('5678'))
  gate.resolve({ queryStatus: 'ok', events: [{ description: '旧资料的轨迹' }] })
  await pending
  assert.equal(h.page.data.events.length, 0)
  h.store.queryLogistics = async (number, options) => { h.calls.push({ number, options }); return { queryStatus: 'no_tracking', events: [] } }
  await h.page.retryQuery()
  assert.equal(h.calls.at(-1).options.phoneLast4, '5678')
})

test('unload clears sensitive values and rejects late results', async () => {
  const gate = deferred()
  const h = harness({ queryLogistics: () => gate.promise })
  h.select('JD')
  h.page.onJdCodeInput(input('123456789A'))
  const pending = h.page.queryLogistics()
  await tick()
  h.page.onUnload()
  gate.resolve({ queryStatus: 'ok', events: [{ description: '晚到' }] })
  await pending
  assert.equal(h.page.data.phoneLast4, '')
  assert.equal(h.page.data.jdCustomerCode, '')
  assert.equal(h.page.data.events.length, 0)
})

test('malformed JD codes and complete phone numbers are not truncated into valid credentials', async () => {
  const h = harness()
  h.select('JD')
  for (const value of ['short', '123456789A-extra', '12345_789A']) {
    h.page.onJdCodeInput(input(value))
    await h.page.queryLogistics()
    assert.equal(h.calls.length, 0)
    assert.equal(h.page.data.resultState, 'verification_required')
  }
  h.select('SF')
  h.page.onPhoneInput(input('13800138000'))
  await h.page.queryLogistics()
  assert.equal(h.calls.length, 0)
  assert.equal(h.page.data.requiredField, 'phoneLast4')
})
