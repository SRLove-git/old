import test from 'node:test'
import assert from 'node:assert/strict'

test('京东物流使用青龙商家编码，不使用收件人姓名', async () => {
  process.env.KDNIAO_JD_QINGLONG_CODE = 'JD-MERCHANT-001'
  const { payloadForShipment } = await import(`../src/lib/kdniao.js?jd=${Date.now()}`)
  const payload = payloadForShipment({
    orderId: 'ORDER-1',
    trackingNo: 'JDV030486026915',
    carrierCode: 'JD',
    customerName: '张三'
  })

  assert.equal(payload.CustomerName, 'JD-MERCHANT-001')
  assert.notEqual(payload.CustomerName, '张三')
})

test('顺丰物流继续使用收件手机号后四位', async () => {
  const { payloadForShipment } = await import(`../src/lib/kdniao.js?sf=${Date.now()}`)
  const payload = payloadForShipment({
    orderId: 'ORDER-2',
    trackingNo: 'SF1234567890',
    carrierCode: 'SF',
    receiverPhone: '13800138000'
  })

  assert.equal(payload.CustomerName, '8000')
})

test('快递鸟扩展状态优先识别正在派送', async () => {
  const { normalizeKdniaoQuery } = await import(`../src/lib/kdniao.js?state=${Date.now()}`)
  const result = normalizeKdniaoQuery({
    LogisticCode: 'JT2216313572522',
    ShipperCode: 'JTSD',
    State: '2',
    StateEx: '202',
    Traces: [{ AcceptTime: '2026-10-23 14:26:57', AcceptStation: '快递员正在派送' }]
  })

  assert.equal(result.status, '派送中')
  assert.equal(result.stateEx, '202')
})
