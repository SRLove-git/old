import crypto from 'node:crypto'
import fs from 'node:fs'
import { httpError } from './http.js'

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
  '德邦快递': 'DBL',
  '邮政快递包裹': 'YZPY'
}

const carrierDirectory = JSON.parse(fs.readFileSync(new URL('../data/logistics-carriers.json', import.meta.url), 'utf8'))
const carriersByCode = new Map()
const carriersByName = new Map()
for (const item of [...Object.entries(CARRIER_CODES).map(([name, code]) => ({ name, code })), ...carrierDirectory]) {
  const key = item.code.toLowerCase()
  const existing = carriersByCode.get(key)
  if (!existing) carriersByCode.set(key, { name: item.name, code: item.code })
  else existing.name = [...new Set([...existing.name.split(' / '), ...item.name.split(' / ')])].join(' / ')
}
for (const item of carriersByCode.values()) {
  for (const name of [item.name, ...item.name.split(' / ')]) if (!carriersByName.has(name)) carriersByName.set(name, item.code)
}

export function listLogisticsCarriers() {
  return [...carriersByCode.values()].map(({ name, code }) => ({ code, name }))
}

export function kdniaoConfigured() {
  return Boolean(BUSINESS_ID && API_KEY)
}

export function carrierCode(name, explicitCode = '') {
  const code = String(explicitCode || carriersByName.get(String(name || '').trim()) || '').trim()
  return carriersByCode.get(code.toLowerCase())?.code || code
}

export function carrierName(code, fallback = '') {
  const target = String(code || '').trim()
  return carriersByCode.get(target.toLowerCase())?.name.split(' / ')[0] || fallback || target
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

function providerFailure(result = {}, status = 200, requestedCarrier = '') {
  const reason = String(result?.Reason || result?.ReasonText || '')
  let kind = 'provider', message = '物流服务暂时异常，请稍后重试；持续失败请联系平台客服', httpStatus = 502
  if (/频率|频繁|rate.?limit/i.test(reason) || status === 429) {
    kind = 'rate_limit'; message = '物流服务查询过于频繁，请稍后再试'; httpStatus = 429
  } else if (/余额|额度|余量|欠费|次数不足|次数已|无可用套餐|套餐.*(到期|不足|过期)|quota|insufficient.*balance/i.test(reason)) {
    kind = 'quota'; message = '物流服务查询额度不足或套餐已到期，请联系平台客服续费后重试'; httpStatus = 503
  } else if (/权限|未开通|未授权|白名单|签名|api.?key|ebusiness|app.?key|unauthori|forbidden/i.test(reason) || [401, 403].includes(status)) {
    kind = 'permission'; message = '物流服务尚未开通该查询权限或接口配置异常，请联系平台客服核实套餐与授权'; httpStatus = 503
  } else if (/手机号|手机后|手机尾|后四位|后4位|青龙|商家编码|客户编码|CustomerName|验证信息/i.test(reason)) {
    kind = 'verification'; message = '物流验证信息缺失或不匹配，请核对所填信息后重试'; httpStatus = 400
  } else if (/无轨迹|无物流信息|暂无.*(物流|记录)|未查询到|暂未.*轨迹|未揽收|尚未揽收|单号不存在|no.*track/i.test(reason)) {
    kind = 'no_tracking'; message = '暂未获取到物流轨迹，请核对单号和快递公司，刚发货的包裹可稍后再查'
  } else if (/快递公司|快递编码|物流公司|ShipperCode|识别失败/i.test(reason)) {
    kind = 'carrier'; message = '暂未识别或不支持该快递公司，请手动选择实际快递公司；仍无法查询时请到承运商官方渠道查询'; httpStatus = 400
  }
  const error = httpError(httpStatus, message)
  error.logisticsKind = kind
  const item = Array.isArray(result?.Data) ? result.Data[0] : result
  const code = carrierCode('', item?.ShipperCode || requestedCarrier)
  error.carrierCode = /^[A-Za-z0-9_-]{1,64}$/.test(code) ? code : ''
  if (kind === 'verification' && !error.carrierCode) {
    if (/顺丰/.test(reason)) error.carrierCode = 'SF'
    else if (/京东|青龙/.test(reason)) error.carrierCode = 'JD'
  }
  if (kind === 'verification' && !error.carrierCode) {
    error.message = '请先选择实际快递公司；顺丰填写收件人或寄件人手机号后4位，京东填写该包裹发件方青龙商家编码后重试'
  }
  return error
}

async function callKdniao(url, requestType, payload) {
  if (!kdniaoConfigured()) throw httpError(503, '物流查询服务尚未配置，请联系平台客服')
  const requestData = JSON.stringify(payload)
  const body = new URLSearchParams({
    RequestData: requestData,
    EBusinessID: BUSINESS_ID,
    RequestType: String(requestType),
    DataSign: signRequestData(requestData),
    DataType: '2'
  })
  let response, text
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body,
      signal: AbortSignal.timeout(10000)
    })
    text = await response.text()
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw httpError(504, '物流查询超时，请稍后重试')
    throw httpError(502, '暂时无法连接物流服务，请稍后重试')
  }
  let result
  try { result = JSON.parse(text) } catch { throw httpError(502, '物流服务返回异常数据，请稍后重试') }
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw httpError(502, '物流服务返回异常数据，请稍后重试')
  if (!response.ok || result.Success === false || result.Success === 'false') {
    throw providerFailure(result, response.status, payload.ShipperCode)
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
  const sfPhone = shipment.directQuery ? shipment.phoneLast4 : shipment.receiverPhone
  const jdCode = shipment.directQuery ? shipment.jdCustomerCode : JD_QINGLONG_CODE
  if (code === 'SF' && sfPhone) payload.CustomerName = String(sfPhone).slice(-4)
  if (code === 'JD' && jdCode) payload.CustomerName = String(jdCode)
  return payload
}

export function subscribeKdniao(shipment) {
  return callKdniao(SUBSCRIBE_URL, '8008', payloadForShipment(shipment, true))
}

function detectedCarrierCode(result = {}) {
  const item = Array.isArray(result.Data) ? result.Data[0] : result
  return carrierCode('', item?.ShipperCode)
}

function hasTrackingEvents(result = {}) {
  const items = Array.isArray(result.Data) ? result.Data : [result]
  return items.some((item) => Array.isArray(item?.Traces) && item.Traces.length > 0)
}

export async function queryKdniao(shipment, { beforeRequest } = {}) {
  const query = (input) => {
    beforeRequest?.()
    return callKdniao(QUERY_URL, '8002', payloadForShipment(input, false))
  }
  const initialCode = carrierCode(shipment.carrier, shipment.carrierCode)
  const result = await query(shipment)
  // 后台只输入单号时先让快递鸟识别承运商；若识别为京东且首查无轨迹，
  // 再携带青龙商家编码查询一次，避免把无轨迹误判为包裹不存在。
  const detectedCode = detectedCarrierCode(result)
  const jdCode = shipment.directQuery ? shipment.jdCustomerCode : JD_QINGLONG_CODE
  const sfPhone = shipment.directQuery ? shipment.phoneLast4 : shipment.receiverPhone
  if (!initialCode && !hasTrackingEvents(result)
    && ((detectedCode === 'JD' && jdCode) || (detectedCode === 'SF' && sfPhone))) {
    return query({ ...shipment, carrierCode: detectedCode })
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
    carrierCode: carrierCode('', result.ShipperCode),
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
