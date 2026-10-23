import crypto from 'node:crypto'

const BUSINESS_ID = String(process.env.KDNIAO_EBUSINESS_ID || '').trim()
const API_KEY = String(process.env.KDNIAO_API_KEY || '').trim()
const SUBSCRIBE_URL = process.env.KDNIAO_SUBSCRIBE_URL || 'https://api.kdniao.com/api/dist'
const QUERY_URL = process.env.KDNIAO_QUERY_URL || 'https://api.kdniao.com/Ebusiness/EbusinessOrderHandle.aspx'
// 京东物流要求 CustomerName 传发件方的青龙商家编码，不能传收件人姓名。
// 优先使用语义明确的新变量，同时兼容曾按快递鸟字段名配置的旧变量。
const JD_QINGLONG_CODE = String(
  process.env.KDNIAO_JD_QINGLONG_CODE || process.env.KDNIAO_JD_CUSTOMER_NAME || ''
).trim()

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

export function payloadForShipment(shipment, requireCarrier = true) {
  const code = carrierCode(shipment.carrier, shipment.carrierCode)
  if (requireCarrier && !code) throw new Error('快递鸟未能识别该快递单号对应的快递公司')
  const payload = {
    OrderCode: String(shipment.orderId || ''),
    LogisticCode: String(shipment.trackingNo || '')
  }
  if (code) payload.ShipperCode = code
  if (code === 'SF' && shipment.receiverPhone) payload.CustomerName = String(shipment.receiverPhone).slice(-4)
  if (code === 'JD' && JD_QINGLONG_CODE) payload.CustomerName = JD_QINGLONG_CODE
  return payload
}

export function subscribeKdniao(shipment) {
  return callKdniao(SUBSCRIBE_URL, '8008', payloadForShipment(shipment, true))
}

function detectedCarrierCode(result = {}) {
  const item = Array.isArray(result.Data) ? result.Data[0] : result
  return String(item?.ShipperCode || '').trim().toUpperCase()
}

function hasTrackingEvents(result = {}) {
  const items = Array.isArray(result.Data) ? result.Data : [result]
  return items.some((item) => Array.isArray(item?.Traces) && item.Traces.length > 0)
}

export async function queryKdniao(shipment) {
  const initialCode = carrierCode(shipment.carrier, shipment.carrierCode)
  const result = await callKdniao(QUERY_URL, '8002', payloadForShipment(shipment, false))
  // 后台只输入单号时先让快递鸟识别承运商；若识别为京东且首查无轨迹，
  // 再携带青龙商家编码查询一次，避免把无轨迹误判为包裹不存在。
  if (!initialCode && JD_QINGLONG_CODE && detectedCarrierCode(result) === 'JD' && !hasTrackingEvents(result)) {
    return callKdniao(QUERY_URL, '8002', payloadForShipment({ ...shipment, carrierCode: 'JD' }, false))
  }
  return result
}

export function normalizeKdniaoQuery(result = {}) {
  const state = String(result.State == null ? '' : result.State)
  const stateEx = String(result.StateEx == null ? '' : result.StateEx)
  const effectiveState = stateEx || state
  const status = effectiveState === '3' || effectiveState.startsWith('3') ? '已签收'
    : effectiveState === '4' || effectiveState.startsWith('4') ? '物流异常'
      : effectiveState === '1' ? '已揽收'
        : effectiveState === '202' ? '派送中'
          : effectiveState === '2' || effectiveState.startsWith('2') ? '运输中' : '暂无轨迹'
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
    stateEx,
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
    businessIdSuffix: BUSINESS_ID ? BUSINESS_ID.slice(-4) : '',
    jdQinglongCodeConfigured: Boolean(JD_QINGLONG_CODE)
  }
}
