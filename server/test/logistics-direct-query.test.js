import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const originalEnv = { ...process.env }
const originalFetch = globalThis.fetch
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'suiyueli-direct-logistics-'))
Object.assign(process.env, { DATA_FILE: path.join(directory, 'data.json'), KDNIAO_EBUSINESS_ID: 'test-business', KDNIAO_API_KEY: 'test-api-secret', KDNIAO_JD_QINGLONG_CODE: 'GLOBAL0001' })
globalThis.fetch = async () => { throw new Error('Real network requests are forbidden') }
const { queryLogisticsNumber } = await import('../src/services/logistics.js')
const { payloadForShipment, queryKdniao, listLogisticsCarriers, carrierCode, carrierName } = await import('../src/lib/kdniao.js')
let sequence = 0
const user = () => `logistics-test-${++sequence}`
const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
const tracked = (code = 'JTSD', trackingNo = 'TEST123456') => ({ Success: true, ShipperCode: code, LogisticCode: trackingNo, State: '2', Traces: [{ AcceptTime: '2026-10-31 10:00:00', AcceptStation: '运输中' }] })
function mock(handler) {
  const calls = []
  globalThis.fetch = async (url, options) => {
    const form = new URLSearchParams(options.body)
    const payload = JSON.parse(form.get('RequestData'))
    calls.push({ url, payload, requestType: form.get('RequestType') })
    return handler(payload, calls.length, options)
  }
  return calls
}
test.after(() => {
  globalThis.fetch = originalFetch
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key]
  Object.assign(process.env, originalEnv)
  fs.rmSync(directory, { recursive: true, force: true })
})

test('手选顺丰/京东缺验证信息时给出补填结果且不请求第三方', async () => {
  const calls = mock(() => assert.fail('must not request'))
  for (const [code, field] of [['SF', 'phoneLast4'], ['JD', 'jdCustomerCode']]) {
    const result = await queryLogisticsNumber('TEST123456', user(), { carrierCode: code })
    assert.equal(result.queryStatus, 'verification_required')
    assert.equal(result.requiredField, field)
    assert.equal(result.carrierCode, code)
    assert.deepEqual(result.events, [])
    assert.ok(result.guidance)
    assert.equal(result.reason, result.guidance)
  }
  assert.equal(calls.length, 0)
  assert.equal(payloadForShipment({ directQuery: true, carrierCode: 'JD', trackingNo: 'TEST123456' }).CustomerName, undefined)
  assert.equal(payloadForShipment({ carrierCode: 'JD', trackingNo: 'TEST123456' }).CustomerName, 'GLOBAL0001')
})

test('公司编码/验证信息/平台订单号非法时均在第三方请求前拒绝', async () => {
  const calls = mock(() => assert.fail('must not request'))
  for (const options of [
    { carrierCode: 'bad code' }, { carrierCode: 'X'.repeat(65) }, { carrierCode: true },
    { phoneLast4: '12' }, { phoneLast4: '13800001234' }, { phoneLast4: 1234 },
    { jdCustomerCode: 'AB1234567' }, { jdCustomerCode: 'AB123456789' }, { jdCustomerCode: 'AB12-45678' }
  ]) await assert.rejects(() => queryLogisticsNumber('TEST123456', user(), options), error => error.status === 400)
  for (const trackingNo of ['bad!', 'SYL1793412000000', 'JF1793412000000']) {
    await assert.rejects(() => queryLogisticsNumber(trackingNo, user()), error => error.status === 400)
  }
  assert.equal(calls.length, 0)
})

test('补填顺丰尾号和京东发件编码传入CustomerName，外部京东不会借用全局编码', async () => {
  const calls = mock(payload => response(tracked(payload.ShipperCode, payload.LogisticCode)))
  assert.equal((await queryLogisticsNumber('SF123456789', user(), { carrierCode: 'sf', phoneLast4: '1234' })).queryStatus, 'ok')
  assert.equal(calls[0].payload.CustomerName, '1234')
  assert.equal(calls[0].payload.ShipperCode, 'SF')
  assert.equal((await queryLogisticsNumber('JD123456789', user(), { carrierCode: 'JD', jdCustomerCode: 'Ab12345678' })).queryStatus, 'ok')
  assert.equal(calls[1].payload.CustomerName, 'Ab12345678')
  assert.notEqual(calls[1].payload.CustomerName, 'GLOBAL0001')
  assert.ok(calls.every(call => call.requestType === '8002'))
})

test('旧单号请求保持兼容，识别公司后引导补填且允许立即继续查询', async () => {
  const calls = mock(payload => response(payload.CustomerName ? tracked('SF', payload.LogisticCode) : { Success: true, ShipperCode: 'SF', LogisticCode: payload.LogisticCode, Traces: [] }))
  const id = user()
  const first = await queryLogisticsNumber(' SF123456789 ', id)
  assert.equal(first.queryStatus, 'verification_required')
  assert.equal(first.requiredField, 'phoneLast4')
  const second = await queryLogisticsNumber('SF123456789', id, { carrierCode: first.carrierCode, phoneLast4: '1234' })
  assert.equal(second.queryStatus, 'ok')
  assert.equal(calls.length, 2)
  const cached = await queryLogisticsNumber('SF123456789', id, { carrierCode: first.carrierCode, phoneLast4: '1234' })
  assert.deepEqual(cached, second)
  assert.equal(calls.length, 2, '相同查询30秒内不重复消耗额度')
})

test('自动识别京东无轨迹只要求发件编码，不自动发出本公司编码', async () => {
  const calls = mock(payload => response({ Success: true, ShipperCode: 'JD', LogisticCode: payload.LogisticCode, Traces: [] }))
  const result = await queryLogisticsNumber('JDV123456789', user())
  assert.equal(result.requiredField, 'jdCustomerCode')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].payload.CustomerName, undefined)
})

test('自动识别时已有验证信息会携带正确信息重查，内部京东仍保留原编码逻辑', async () => {
  const calls = mock(payload => response(payload.CustomerName ? tracked('JD', payload.LogisticCode) : { Success: true, ShipperCode: 'JD', LogisticCode: payload.LogisticCode, Traces: [] }))
  const result = await queryLogisticsNumber('JDV123456789', user(), { jdCustomerCode: 'USERCODE01' })
  assert.equal(result.queryStatus, 'ok')
  assert.equal(calls.length, 2)
  assert.equal(calls[1].payload.CustomerName, 'USERCODE01')
  await queryKdniao({ trackingNo: 'JDV987654321', orderId: 'ORDER-1' })
  assert.equal(calls.length, 4)
  assert.equal(calls[3].payload.CustomerName, 'GLOBAL0001')
})

test('未识别和已识别的无轨迹响应有不同下一步，支持此单无物流信息错误文案', async () => {
  mock(payload => response({ Success: true, ShipperCode: payload.ShipperCode || '', Traces: [], Reason: 'opaque test-api-secret 1234' }))
  const auto = await queryLogisticsNumber('TEST123456', user())
  assert.equal(auto.queryStatus, 'no_tracking')
  assert.match(auto.guidance, /手动选择/)
  assert.equal(auto.reason, auto.guidance)
  assert.equal(JSON.stringify(auto).includes('test-api-secret'), false)
  const manual = await queryLogisticsNumber('TEST123456', user(), { carrierCode: 'ZTO' })
  assert.equal(manual.queryStatus, 'no_tracking')
  assert.match(manual.guidance, /刚发货/)
  mock(() => response({ Success: false, ShipperCode: 'JTSD', Reason: '此单无物流信息' }))
  assert.equal((await queryLogisticsNumber('TEST123456', user())).queryStatus, 'no_tracking')
})

test('自动识别的验证错误可补填，提供过的错误资料返回安全校验错误', async () => {
  mock(() => response({ Success: false, ShipperCode: 'SF', Reason: '缺少手机号后4位 test-api-secret' }))
  assert.equal((await queryLogisticsNumber('TEST123456', user())).requiredField, 'phoneLast4')
  await assert.rejects(() => queryLogisticsNumber('TEST123456', user(), { carrierCode: 'SF', phoneLast4: '1234' }), error => error.status === 400 && !/test-api-secret|1234/.test(error.message))
})

test('自动识别CustomerName为空且未给公司时要求先选公司，不猜测京东', async () => {
  const calls = mock(() => response({ Success: false, Reason: '无效的输入[CustomerName不能为空]' }))
  await assert.rejects(() => queryLogisticsNumber('TEST123456', user()), error => {
    assert.equal(error.status, 400)
    assert.equal(error.carrierCode, '')
    assert.match(error.message, /先选择实际快递公司/)
    assert.match(error.message, /顺丰.*收件人或寄件人手机号后4位/)
    assert.match(error.message, /京东.*发件方青龙商家编码/)
    assert.equal(error.message.includes('CustomerName'), false)
    return true
  })
  assert.equal(calls.length, 1)
})

test('第三方权限/额度/频率/网络/超时返回可操作安全错误，失败仍受频控', async () => {
  for (const [reason, status, message] of [
    ['未开通接口权限 sensitive test-api-secret', 503, /权限/],
    ['余额不足 sensitive test-api-secret', 503, /额度/],
    ['无可用套餐 sensitive test-api-secret', 503, /额度/],
    ['请求频率超限 sensitive test-api-secret', 429, /频繁/]
  ]) {
    mock(() => response({ Success: false, Reason: reason }))
    await assert.rejects(() => queryLogisticsNumber('TEST123456', user()), error => error.status === status && message.test(error.message) && !/sensitive|test-api-secret/.test(error.message))
  }
  mock(() => { throw new DOMException('private provider URL', 'TimeoutError') })
  await assert.rejects(() => queryLogisticsNumber('TEST123456', user()), error => error.status === 504 && /超时/.test(error.message))
  const calls = mock(() => { throw new Error('private provider URL test-api-secret') })
  const id = user()
  for (let i = 0; i < 3; i += 1) await assert.rejects(() => queryLogisticsNumber('TEST123456', id), error => error.status === 502 && !/private|test-api-secret/.test(error.message))
  await assert.rejects(() => queryLogisticsNumber('TEST123456', id), error => error.status === 429)
  assert.equal(calls.length, 3)
})

test('同用户并发查询受限，完成后可补充字段且限制实际第三方请求次数', async () => {
  let release
  const calls = mock(() => new Promise(resolve => { release = () => resolve(response(tracked())) }))
  const id = user()
  const first = queryLogisticsNumber('TEST123456', id)
  await assert.rejects(() => queryLogisticsNumber('TEST234567', id), error => error.status === 429)
  assert.equal(calls.length, 1)
  release()
  await first
})

test('官方公司目录保留大小写/下划线/连字符并允许canonical名称查找', async () => {
  const carriers = listLogisticsCarriers()
  assert.ok(carriers.some(item => item.code === 'YZPY'))
  assert.equal(new Set(carriers.map(item => item.code.toLowerCase())).size, carriers.length)
  const special = carriers.find(item => /[_-]/.test(item.code))
  assert.ok(special)
  assert.equal(carrierCode('', special.code.toUpperCase()), special.code)
  assert.equal(carrierName(special.code), special.name.split(' / ')[0])
  const calls = mock(payload => response(tracked(payload.ShipperCode, payload.LogisticCode)))
  await queryLogisticsNumber('TEST123456', user(), { carrierCode: special.code.toUpperCase() })
  assert.equal(calls[0].payload.ShipperCode, special.code)
  await queryLogisticsNumber('TEST123456', user(), { carrierCode: 'Custom_Carrier-1234567890123456789' })
  assert.equal(calls[1].payload.ShipperCode, 'Custom_Carrier-1234567890123456789')
})
