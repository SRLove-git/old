import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import express from 'express'
import { once } from 'node:events'

test('物流 HTTP 接口接收补充资料，保留登录和订单归属边界', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'syl-logistics-api-'))
  const nativeFetch = globalThis.fetch
  const calls = []
  let server
  Object.assign(process.env, {
    NODE_ENV: 'test', DATA_FILE: path.join(directory, 'data.json'),
    SESSION_SECRET: 'isolated-logistics-session',
    KDNIAO_EBUSINESS_ID: 'test-business', KDNIAO_API_KEY: 'test-key',
    KDNIAO_JD_QINGLONG_CODE: '001K123450'
  })
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url).hostname, 'api.kdniao.com', '测试不能请求真实外部服务')
    const payload = JSON.parse(options.body.get('RequestData'))
    calls.push(payload)
    return new Response(JSON.stringify({
      Success: true, LogisticCode: payload.LogisticCode,
      ShipperCode: payload.ShipperCode || 'JTSD', State: '2',
      Traces: [{ AcceptTime: '2026-10-31 12:00:00', AcceptStation: '已到站' }]
    }), { status: 200 })
  }
  try {
    const [{ default: router }, store, { encodeSession }] = await Promise.all([
      import('../src/routes/orders.js'), import('../src/store.js'), import('../src/lib/session.js')
    ])
    store.init()
    store.get().orders = [{ id: 'SYL-private', userId: 'owner', trackingNo: 'JT123456', status: '待收货' }]
    const before = JSON.stringify(store.get())
    const app = express()
    app.use(express.json())
    app.use('/api/orders', router)
    server = app.listen(0, '127.0.0.1')
    await once(server, 'listening')
    async function request(route, body, user = '') {
      const response = await nativeFetch(`http://127.0.0.1:${server.address().port}/api/orders${route}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'content-type': 'application/json', ...(user ? { authorization: `Bearer ${encodeSession({ userId: user, exp: Math.floor(Date.now() / 1000) + 600 })}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body)
      })
      return { status: response.status, body: await response.json() }
    }

    assert.equal((await request('/logistics/carriers')).status, 200)
    assert.equal((await request('/logistics/query', { trackingNo: 'JT123456' })).status, 401)
    const carriers = await request('/logistics/carriers', undefined, 'reader')
    assert.equal(carriers.status, 200)
    assert.ok(carriers.body.data.some(item => item.code === 'SF'))
    assert.equal((await request('/SYL-private/logistics', undefined, 'other')).status, 403)
    assert.equal(calls.length, 0)

    const missing = await request('/logistics/query', { trackingNo: 'SF123456', carrierCode: 'SF' }, 'sf-reader')
    assert.equal(missing.status, 200)
    assert.equal(missing.body.data.requiredField, 'phoneLast4')
    assert.equal(calls.length, 0)
    const invalid = await request('/logistics/query', { trackingNo: 'SF123456', carrierCode: 'SF', phoneLast4: '13800138000' }, 'sf-reader')
    assert.equal(invalid.status, 400)
    assert.equal(calls.length, 0)
    const sf = await request('/logistics/query', { trackingNo: 'SF123456', carrierCode: 'SF', phoneLast4: '8000' }, 'sf-reader')
    assert.equal(sf.status, 200)
    assert.equal(sf.body.data.queryStatus, 'ok')
    assert.equal(calls.at(-1).CustomerName, '8000')
    assert.equal(calls.at(-1).ShipperCode, 'SF')
    assert.ok(!JSON.stringify(sf.body).includes('8000'))

    const jd = await request('/logistics/query', { trackingNo: 'JD123456', carrierCode: 'JD' }, 'jd-reader')
    assert.equal(jd.body.data.requiredField, 'jdCustomerCode')
    assert.equal(calls.length, 1, '外部京东单号不能借用本公司全局青龙码')
    const supplied = await request('/logistics/query', { trackingNo: 'JD123456', carrierCode: 'JD', jdCustomerCode: '002K123450' }, 'jd-reader')
    assert.equal(supplied.status, 200)
    assert.equal(calls.at(-1).CustomerName, '002K123450')
    assert.ok(!JSON.stringify(supplied.body).includes('002K123450'))
    const legacy = await request('/logistics/query', { trackingNo: 'JT123456' }, 'legacy-reader')
    assert.equal(legacy.status, 200)
    assert.equal(legacy.body.data.events[0].description, '已到站')
    assert.equal(JSON.stringify(store.get()), before, '查物流不能写入验证信息或覆盖订单')
  } finally {
    if (server) {
      const closed = once(server, 'close')
      server.close()
      server.closeAllConnections()
      await closed
    }
    globalThis.fetch = nativeFetch
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('小程序 API 将验证资料放入 POST 正文，过滤非约定字段', async () => {
  const calls = []
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(new URL('../../miniprogram/services/api.js', import.meta.url), 'utf8'), {
    module,
    require: () => ({
      publicApi: { get: async route => { calls.push({ route }); return [] } },
      api: { post: async (route, body) => { calls.push({ route, body }); return {} } }
    })
  })
  await module.exports.getLogisticsCarriers()
  assert.equal(calls[0].route, '/orders/logistics/carriers')
  await module.exports.queryLogistics('SF123456', { carrierCode: 'SF', phoneLast4: '8000', userId: 'forged', receiverPhone: '13800138000' })
  assert.equal(calls[1].route, '/orders/logistics/query')
  assert.deepEqual(JSON.parse(JSON.stringify(calls[1].body)), { trackingNo: 'SF123456', carrierCode: 'SF', phoneLast4: '8000', jdCustomerCode: '' })
})
