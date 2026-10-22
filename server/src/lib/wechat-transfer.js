import crypto from 'node:crypto'
import { httpError } from './http.js'
import { wechatPayConfig, wechatPayPlatformKey, wechatPayRequest } from './wechat-pay.js'

// 商家转账（新版）APIv3 封装：用户确认收款模式。
// 文档：https://pay.weixin.qq.com/doc/v3/merchant/4012716434.md

const DEFAULT_SCENE_ID = '1005' // 佣金报酬
const DEFAULT_REPORT_INFOS = {
  1005: [
    { info_type: '岗位类型', info_content: '主理人' },
    { info_type: '报酬说明', info_content: '推广佣金' }
  ],
  1000: [
    { info_type: '活动名称', info_content: '岁悦里推广活动' },
    { info_type: '奖励说明', info_content: '推广奖励' }
  ]
}
const DEFAULT_PERCEPTION = { 1005: '劳务报酬', 1000: '活动奖励' }
const FAIL_REASON_TEXT = {
  ACCOUNT_FROZEN: '收款用户账户被冻结',
  ACCOUNT_NOT_EXIST: '收款用户账户不存在',
  BANK_CARD_ACCOUNT_ABNORMAL: '收款银行卡状态异常，无法入账',
  BANK_CARD_BANK_INFO_WRONG: '收款银行卡的银行信息有误',
  BANK_CARD_CARD_INFO_WRONG: '收款银行卡户名或卡号有误',
  BANK_CARD_COLLECTIONS_ABOVE_QUOTA: '收款银行卡达到收款限额',
  BANK_CARD_PARAM_ERROR: '收款银行卡信息有误',
  BANK_CARD_STATUS_ABNORMAL: '收款银行卡状态异常',
  BLOCK_B2C_USERLIMITAMOUNT_BSRULE_MONTH: '超出收款用户本月收款限额',
  BLOCK_B2C_USERLIMITAMOUNT_MONTH: '收款用户本月收款受限',
  DAY_RECEIVED_COUNT_EXCEED: '超过收款用户当日收款次数',
  DAY_RECEIVED_QUOTA_EXCEED: '超过收款用户当日收款额度',
  ID_CARD_NOT_CORRECT: '收款人身份证校验不通过',
  MCH_CANCEL: '商户已撤销转账',
  MERCHANT_REJECT: '商户验密人驳回了转账',
  MERCHANT_NOT_CONFIRM: '商户验密人超时未确认',
  NAME_NOT_CORRECT: '收款人姓名与微信支付实名不一致',
  OPENID_INVALID: '收款用户 OpenID 无效或不属于当前小程序',
  OTHER_FAIL_REASON_TYPE: '其它失败原因',
  OVERDUE_CLOSE: '超过 24 小时未确认收款，转账已关闭',
  PAYEE_ACCOUNT_ABNORMAL: '收款用户账户收款异常，需完善微信支付身份信息',
  PAYER_ACCOUNT_ABNORMAL: '商户账户付款受限，请到商户平台处理',
  PRODUCT_AUTH_CHECK_FAIL: '未开通商家转账权限或权限被冻结',
  REALNAME_ACCOUNT_RECEIVED_QUOTA_EXCEED: '收款用户账户收款受限',
  REAL_NAME_CHECK_FAIL: '收款用户未完成微信实名认证',
  RECEIVE_ACCOUNT_NOT_CONFIGURE: '商户未配置收款账户，请到商户平台商家转账中设置',
  RESERVATION_INFO_NOT_MATCH: '转账信息与预约信息不一致',
  RESERVATION_SCENE_NOT_MATCH: '转账场景与预约单不一致',
  RESERVATION_STATE_INVALID: '预约转账单状态异常',
  TRANSFER_QUOTA_EXCEED: '超过单笔转账额度',
  TRANSFER_REMARK_SET_FAIL: '转账备注设置失败',
  TRANSFER_RISK: '该笔转账可能存在风险，已被微信拦截',
  TRANSFER_SCENE_INVALID: '尚未获取该转账场景权限，请检查场景 ID',
  TRANSFER_SCENE_UNAVAILABLE: '该转账场景暂不可用',
  RELATED_ORDER_TRANSFER_AMOUNT_EXCEED: '关联交易累计付款金额超限',
  RELATED_ORDER_TRANSFER_COUNT_EXCEED: '关联交易累计付款次数超限',
  BUDGET_NOT_ENOUGH: '预算单资金不足'
}

const TERMINAL_STATES = ['SUCCESS', 'FAIL', 'CANCELLED']

export function isTransferTerminal(state) {
  return TERMINAL_STATES.includes(String(state || '').toUpperCase())
}

export function transferFailReasonText(code) {
  const key = String(code || '').trim()
  if (!key) return ''
  return FAIL_REASON_TEXT[key] || key
}

function enabled() {
  return String(process.env.WECHAT_TRANSFER_ENABLED || '').trim().toLowerCase() === 'true'
}

// 备注、报备信息内容都按 UTF-8 字节截断，避免中文被截成半个字符。
function clipText(value, maxBytes) {
  const text = String(value ?? '').trim()
  if (Buffer.byteLength(text) <= maxBytes) return text
  let result = ''
  for (const char of text) {
    if (Buffer.byteLength(result + char) > maxBytes) break
    result += char
  }
  return result
}

function parseSceneReportInfos(raw) {
  const text = String(raw || '').trim()
  if (!text) return null
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw httpError(503, 'WECHAT_TRANSFER_SCENE_REPORT_INFOS 必须是 JSON 数组')
  }
  if (!Array.isArray(parsed) || !parsed.length) throw httpError(503, 'WECHAT_TRANSFER_SCENE_REPORT_INFOS 至少需要一条报备信息')
  return parsed.map((item) => ({
    info_type: clipText(item?.info_type, 15),
    info_content: clipText(item?.info_content, 32)
  })).map((item) => {
    if (!item.info_type || !item.info_content) throw httpError(503, 'WECHAT_TRANSFER_SCENE_REPORT_INFOS 的 info_type / info_content 不能为空')
    return item
  })
}

function deriveNotifyUrl(paymentNotifyUrl) {
  const configured = String(process.env.WECHAT_TRANSFER_NOTIFY_URL || '').trim()
  if (configured) return configured
  const paymentUrl = String(paymentNotifyUrl || '').trim()
  if (!paymentUrl) return ''
  if (paymentUrl.includes('/payments/wechat/notify')) {
    return paymentUrl.replace('/payments/wechat/notify', '/transfers/wechat/notify')
  }
  try {
    const url = new URL(paymentUrl)
    const prefix = url.pathname.replace(/\/[^/]+\/?$/, '')
    return `${url.origin}${prefix}/transfers/wechat/notify`
  } catch {
    return ''
  }
}

export function transferConfig() {
  if (!enabled()) throw httpError(503, '服务端未启用微信商家转账（需设置 WECHAT_TRANSFER_ENABLED=true）')
  const base = wechatPayConfig({ verify: true })
  const sceneId = String(process.env.WECHAT_TRANSFER_SCENE_ID || DEFAULT_SCENE_ID).trim()
  if (!/^\d{1,36}$/.test(sceneId)) throw httpError(503, 'WECHAT_TRANSFER_SCENE_ID 必须是数字场景 ID')
  const sceneKey = Number(sceneId)
  const reportInfos = parseSceneReportInfos(process.env.WECHAT_TRANSFER_SCENE_REPORT_INFOS)
    || DEFAULT_REPORT_INFOS[sceneKey]
  if (!reportInfos) throw httpError(503, `未配置转账场景 ${sceneId} 的报备信息，请设置 WECHAT_TRANSFER_SCENE_REPORT_INFOS`)
  const notifyUrl = deriveNotifyUrl(base.notifyUrl)
  if (!/^https:\/\//i.test(notifyUrl)) {
    throw httpError(503, '商家转账回调地址必须是公网 HTTPS 地址（WECHAT_TRANSFER_NOTIFY_URL）')
  }
  const perception = clipText(process.env.WECHAT_TRANSFER_PERCEPTION || DEFAULT_PERCEPTION[sceneKey] || '', 32)
  const remark = clipText(process.env.WECHAT_TRANSFER_REMARK || '岁悦里推广佣金', 32) || '岁悦里推广佣金'
  return {
    appId: base.appId,
    mchId: base.mchId,
    sceneId,
    reportInfos,
    perception,
    remark,
    notifyUrl,
    timeoutMs: base.timeoutMs
  }
}

export function transferConfigured() {
  try {
    transferConfig()
    return true
  } catch {
    return false
  }
}

// 只暴露调用收款确认页所必需、且不属于密钥的信息。
export function transferPublicConfig() {
  try {
    const cfg = transferConfig()
    return { enabled: true, appId: cfg.appId, mchId: cfg.mchId, sceneId: cfg.sceneId, error: '' }
  } catch (error) {
    return { enabled: false, appId: '', mchId: '', sceneId: '', error: String(error?.message || '') }
  }
}

// 小程序端只需要商户号和 appid，配置错误信息仅留在后台。
export function transferClientConfig() {
  const cfg = transferPublicConfig()
  return { enabled: cfg.enabled, appId: cfg.appId, mchId: cfg.mchId }
}

export function encryptSensitive(text, publicKey) {
  return crypto.publicEncrypt({
    key: publicKey,
    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: 'sha1'
  }, Buffer.from(String(text), 'utf8')).toString('base64')
}

export function assertTransferMerchant(bill, options = {}) {
  const cfg = wechatPayConfig()
  if (options.requireMchId && (bill?.mch_id == null || String(bill.mch_id).trim() === '')) throw httpError(400, '微信转账结果缺少商户号')
  if (options.requireAppId && (bill?.appid == null || String(bill.appid).trim() === '')) throw httpError(400, '微信转账结果缺少 AppID')
  const appIdMismatch = bill?.appid != null && String(bill.appid) !== cfg.appId
  const mchIdMismatch = bill?.mch_id != null && String(bill.mch_id) !== cfg.mchId
  if (appIdMismatch || mchIdMismatch) throw httpError(400, '微信转账单商户信息不匹配')
}

export function transferRequestSnapshot({ outBillNo, openid, amountFen, remark, userName }) {
  const cfg = transferConfig()
  const amount = Number(amountFen)
  if (!Number.isInteger(amount) || amount < 10) throw httpError(400, '微信零钱转账金额至少 0.10 元')
  const billNo = String(outBillNo || '')
  // 商户单号只允许数字和大小写字母，且同一商户号下唯一。
  if (!/^[A-Za-z0-9]{1,32}$/.test(billNo)) throw httpError(500, '微信转账商户单号格式不正确')
  if (!String(openid || '').trim()) throw httpError(400, '缺少收款用户 OpenID，无法发起微信转账')
  const recipientName = String(userName || '').trim()
  let encryptedUserName = ''
  let wechatpaySerial = ''
  if (recipientName) {
    const key = wechatPayPlatformKey()
    encryptedUserName = encryptSensitive(recipientName, key.publicKey)
    wechatpaySerial = key.serial
  }
  return {
    outBillNo: billNo,
    openid: String(openid),
    amountFen: amount,
    encryptedUserName,
    wechatpaySerial,
    appId: cfg.appId,
    mchId: cfg.mchId,
    sceneId: cfg.sceneId,
    reportInfos: structuredClone(cfg.reportInfos),
    perception: cfg.perception,
    remark: clipText(remark || cfg.remark, 32) || cfg.remark,
    notifyUrl: cfg.notifyUrl
  }
}

export async function createTransferBill(input) {
  const request = input?.appId ? structuredClone(input) : transferRequestSnapshot(input || {})
  const cfg = transferConfig()
  if (String(request.appId) !== cfg.appId || String(request.mchId) !== cfg.mchId) {
    throw httpError(503, '微信转账原始请求与当前商户配置不一致，已停止重试')
  }
  if (!/^[A-Za-z0-9]{1,32}$/.test(String(request.outBillNo || ''))) throw httpError(500, '微信转账原始请求的商户单号无效')
  if (!String(request.openid || '').trim()) throw httpError(500, '微信转账原始请求缺少 OpenID')
  if (!Number.isSafeInteger(request.amountFen) || request.amountFen < 10) throw httpError(500, '微信转账原始请求金额无效')
  if (!Array.isArray(request.reportInfos) || !request.reportInfos.length) throw httpError(500, '微信转账原始请求缺少场景报备信息')
  const payload = {
    appid: request.appId,
    out_bill_no: request.outBillNo,
    transfer_scene_id: request.sceneId,
    openid: request.openid,
    transfer_amount: request.amountFen,
    transfer_remark: request.remark,
    notify_url: request.notifyUrl,
    transfer_scene_report_infos: request.reportInfos
  }
  if (request.perception) payload.user_recv_perception = request.perception
  const extraHeaders = {}
  if (request.encryptedUserName) {
    if (!request.wechatpaySerial) throw httpError(503, '微信转账收款人姓名密文缺少公钥 ID')
    payload.user_name = request.encryptedUserName
    extraHeaders['Wechatpay-Serial'] = request.wechatpaySerial
  }
  const result = await wechatPayRequest('POST', '/v3/fund-app/mch-transfer/transfer-bills', payload, {
    contextId: request.outBillNo,
    extraHeaders
  })
  assertTransferMerchant(result)
  return result
}

export async function queryTransferBill(outBillNo) {
  const billNo = String(outBillNo || '')
  if (!billNo) throw httpError(400, '缺少微信转账商户单号')
  const result = await wechatPayRequest(
    'GET',
    `/v3/fund-app/mch-transfer/transfer-bills/out-bill-no/${encodeURIComponent(billNo)}`,
    null,
    { contextId: billNo }
  )
  assertTransferMerchant(result, { requireMchId: true, requireAppId: true })
  return result
}

export async function cancelTransferBill(outBillNo) {
  const billNo = String(outBillNo || '')
  if (!billNo) throw httpError(400, '缺少微信转账商户单号')
  const result = await wechatPayRequest(
    'POST',
    `/v3/fund-app/mch-transfer/transfer-bills/out-bill-no/${encodeURIComponent(billNo)}/cancel`,
    null,
    { contextId: billNo }
  )
  assertTransferMerchant(result)
  return result
}
