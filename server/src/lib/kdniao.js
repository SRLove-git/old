import crypto from 'node:crypto'

const BUSINESS_ID = String(process.env.KDNIAO_EBUSINESS_ID || '').trim()
const API_KEY = String(process.env.KDNIAO_API_KEY || '').trim()
const SUBSCRIBE_URL = process.env.KDNIAO_SUBSCRIBE_URL || 'https://api.kdniao.com/api/dist'
const QUERY_URL = process.env.KDNIAO_QUERY_URL || 'https://api.kdniao.com/Ebusiness/EbusinessOrderHandle.aspx'

const CARRIER_CODES = {
  '顺丰速运': 'SF',
  '京东物流': 'JD',
  '中通快递': 'ZTO',
  '圆通速递': 'YTO',
  '韵达快递': 'YD',
  '申通快递': 'STO',
  '极兔速递': 'JTSD',
  '邮政EMS': 'EMS',
  '德邦快递': 'DBL'
}

export function kdniaoConfigured() {
  return Boolean(BUSINESS_ID && API_KEY)
}

export function carrierCode(name, explicitCode = '') {
  return String(explicitCode || CARRIER_CODES[String(name || '').trim()] || '').trim().toUpperCase()
}

export function carrierName(code, fallback = '') {
  const target = String(code || '').trim().toUpperCase()
  return Object.entries(CARRIER_CODES).find(([, value]) => value === target)?.[0] || fallback || target
}

export function signRequestData(requestData) {
  const digest = crypto.createHash('md5').update(String(requestData) + API_KEY, 'utf8').digest('hex')
  return Buffer.from(digest, 'utf8').toString('base64')
}

export function verifyKdniaoSignature(requestData, receivedSign) {
  if (!kdniaoConfigured() || !requestData || !receivedSign) return false
  const expected = Buffer.from(signRequestData(requestData))
  const received = Buffer.from(String(receivedSign).replace(/ /g, '+'))
  return expected.length === received.length && crypto.timingSafeEqual(expected, received)
}

async function callKdniao(url, requestType, payload) {
  if (!kdniaoConfigured()) throw new Error('未配置快递鸟 EBusinessID 和 API Key')
  const requestData = JSON.stringify(payload)
  const body = new URLSearchParams({
    RequestData: requestData,
    EBusinessID: BUSINESS_ID,
    RequestType: String(requestType),
    DataSign: signRequestData(requestData),
    DataType: '2'
  })
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body,
    signal: AbortSignal.timeout(10000)
  })
  const text = await response.text()
  let result
  try { result = JSON.parse(text) } catch { throw new Error(`快递鸟返回非 JSON 数据（HTTP ${response.status}）`) }
  if (!response.ok || result.Success === false || result.Success === 'false') {
    throw new Error(result.Reason || result.ReasonText || `快递鸟请求失败（HTTP ${response.status}）`)
  }
  return result
}

function payloadForShipment(shipment, requireCarrier = true) {
  const code = carrierCode(shipment.carrier, shipment.carrierCode)
  if (requireCarrier && !code) throw new Error('快递鸟未能识别该快递单号对应的快递公司')
  const payload = {
    OrderCode: String(shipment.orderId || ''),
    LogisticCode: String(shipment.trackingNo || '')
  }
  if (code) payload.ShipperCode = code
  if (code === 'SF' && shipment.receiverPhone) payload.CustomerName = String(shipment.receiverPhone).slice(-4)
  if (code === 'JD' && shipment.customerName) payload.CustomerName = String(shipment.customerName)
  return payload
}

export function subscribeKdniao(shipment) {
  return callKdniao(SUBSCRIBE_URL, '8008', payloadForShipment(shipment, true))
}

export function queryKdniao(shipment) {
  return callKdniao(QUERY_URL, '8002', payloadForShipment(shipment, false))
}

export function normalizeKdniaoQuery(result = {}) {
  const state = String(result.State == null ? '' : result.State)
  const status = state === '3' || state.startsWith('3') ? '已签收'
    : state === '4' || state.startsWith('4') ? '物流异常'
      : state === '1' ? '已揽收'
        : state === '202' ? '派送中'
          : state === '2' || state.startsWith('2') ? '运输中' : '暂无轨迹'
  const events = (Array.isArray(result.Traces) ? result.Traces : []).map((trace, index) => ({
    id: `${trace.AcceptTime || trace.ActionTime || index}-${index}`,
    time: trace.AcceptTime || trace.ActionTime || '',
    description: trace.AcceptStation || trace.Action || trace.Remark || '',
    location: trace.Location || ''
  })).filter((event) => event.time || event.description)
  return {
    provider: 'kdniao',
    trackingNo: String(result.LogisticCode || result.LogisticsCode || ''),
    carrierCode: String(result.ShipperCode || ''),
    carrier: carrierName(result.ShipperCode, result.ShipperName || ''),
    status,
    state,
    reason: String(result.Reason || ''),
    events: [...events].reverse(),
    latestDescription: events[events.length - 1]?.description || String(result.Reason || '暂无物流轨迹'),
    queriedAt: new Date().toISOString()
  }
}

export function kdniaoPublicConfig() {
  return {
    provider: 'kdniao',
    configured: kdniaoConfigured(),
    businessIdSuffix: BUSINESS_ID ? BUSINESS_ID.slice(-4) : ''
  }
}
