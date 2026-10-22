import * as store from '../store.js'
import { httpError } from '../lib/http.js'
import {
  cancelTransferBill,
  createTransferBill,
  queryTransferBill,
  transferConfigured,
  transferPublicConfig,
  transferRequestSnapshot
} from '../lib/wechat-transfer.js'

export { transferConfigured, transferPublicConfig }

const RECONCILE_INTERVAL_MS = 60_000
const RECONCILE_BATCH = 20
function isTransferResultUnknown(error) {
  // 底层只有在真正调用过微信 API 后才会附加 wechatStatus（网络异常为 0）。
  // 商家转账对任何非 200 都按结果不明确处理，保留原单查单。
  return Object.prototype.hasOwnProperty.call(error || {}, 'wechatStatus')
}

// 管理员选择微信零钱打款：先锁定佣金与打款参数，再向微信发起转账单。
export async function requestWithdrawTransfer(id, options = {}) {
  const record = store.prepareWithdrawTransfer(id, options)
  const amountFen = Number(record.actualAmountFen)
  let recipient
  let request
  try {
    recipient = store.managerTransferRecipient(record.managerId)
    // 单笔 >= 2000 元时微信强制校验收款人实名姓名，不允许用昵称代替。
    if (amountFen >= 200_000 && !recipient.name) {
      throw httpError(400, '单笔转账超过 2000 元时必须填写收款人实名姓名')
    }
    request = transferRequestSnapshot({
      outBillNo: record.outBillNo,
      openid: recipient.openid,
      amountFen,
      userName: amountFen >= 200_000 ? recipient.name : ''
    })
    store.bindWithdrawTransferRequest(id, {
      openid: recipient.openid,
      amountFen,
      appId: request.appId,
      mchId: request.mchId,
      request
    })
  } catch (error) {
    store.markWithdrawTransferRequestFailed(id, error)
    throw error
  }
  let bill
  try {
    bill = await createTransferBill(request)
  } catch (error) {
    store.markWithdrawTransferRequestFailed(id, error, { unknown: isTransferResultUnknown(error) })
    throw error
  }
  try {
    return store.markWithdrawTransferCreated(id, bill)
  } catch (error) {
    // 微信已返回 200，但本地完整性校验未通过：不能换单或释放佣金，必须查原单。
    store.markWithdrawTransferRequestFailed(id, error, { unknown: true })
    throw error
  }
}

export async function syncWithdrawTransfer(id) {
  const record = store.findWithdrawById(id)
  if (!record) throw httpError(404, '提现单不存在')
  if (!record.outBillNo) throw httpError(400, '该提现单还没有微信转账单号')
  let bill
  try {
    bill = await queryTransferBill(record.outBillNo)
  } catch (error) {
    if (error?.wechatCode === 'NOT_FOUND') {
      // 查不到时仍不换单：使用已持久化的原商户单号和原参数重试。
      store.markWithdrawTransferRequestFailed(record.id, error, { unknown: true })
      if (!record.transferRequest) throw httpError(409, '微信侧未查到转账单，且本地缺少原始请求快照，已停止重试')
      try {
        const retried = await createTransferBill(record.transferRequest)
        return store.markWithdrawTransferCreated(record.id, retried)
      } catch (retryError) {
        store.markWithdrawTransferRequestFailed(record.id, retryError, {
          unknown: isTransferResultUnknown(retryError) || record.transferState === 'UNKNOWN'
        })
        throw retryError
      }
    }
    throw error
  }
  const updated = store.applyWithdrawTransferState(record.outBillNo, bill, {
    requiredFields: ['out_bill_no', 'transfer_bill_no', 'mch_id', 'appid', 'state', 'transfer_amount', 'openid']
  })
  return attachTransferPackage(updated)
}

// 发起时若只返回 ACCEPTED/PROCESSING（资金尚未锁定），微信不会返回 package_info。
// 用同一商户单号原单重试可拿到待确认参数，且不会产生重复转账单。
async function attachTransferPackage(record) {
  if (!record || record.status !== '打款中' || record.transferPackage) return record
  if (!['ACCEPTED', 'PROCESSING', 'WAIT_USER_CONFIRM'].includes(record.transferState)) return record
  if (!record.transferRequest) throw httpError(409, '该提现单缺少原始转账请求快照，已停止重试')
  try {
    const bill = await createTransferBill(record.transferRequest)
    return store.markWithdrawTransferCreated(record.id, bill)
  } catch (error) {
    if (['ALREADY_EXISTS', 'ORDER_CLOSED'].includes(error?.wechatCode)) {
      console.error('[wechat-transfer-package]', { outBillNo: record.outBillNo, code: error.wechatCode, message: error.message })
      return record
    }
    throw error
  }
}

// 撤销只对“用户尚未确认收款”的单据有效，最终状态仍以查单/回调为准。
export async function cancelWithdrawTransfer(id) {
  const record = store.findWithdrawById(id)
  if (!record) throw httpError(404, '提现单不存在')
  if (record.status !== '打款中') throw httpError(400, `提现单当前状态为「${record.status}」，不可撤销微信转账`)
  if (record.transferState === 'CANCELING') throw httpError(400, '该转账正在撤销中，请稍后查单确认结果')
  if (!record.outBillNo) throw httpError(400, '该提现单还没有微信转账单号')
  const result = await cancelTransferBill(record.outBillNo)
  if (['SUCCESS', 'FAIL', 'CANCELLED'].includes(String(result?.state || '').toUpperCase())) {
    return syncWithdrawTransfer(id)
  }
  return store.applyWithdrawTransferState(record.outBillNo, { ...result, out_bill_no: record.outBillNo })
}

export async function refreshPendingWithdrawTransfers() {
  const pending = store.pendingWithdrawTransfers(RECONCILE_BATCH)
  for (const record of pending) {
    try {
      await syncWithdrawTransfer(record.id)
    } catch (error) {
      // 常见于单据刚创建还没被微信受理，下个周期继续查；30 天内都能查询。
      console.error('[wechat-transfer-reconcile]', {
        outBillNo: record.outBillNo,
        message: error?.message,
        requestId: error?.requestId || ''
      })
    }
  }
  return pending.length
}

export function startWechatTransferJob() {
  if (!transferConfigured()) return null
  const run = () => refreshPendingWithdrawTransfers().catch(() => {})
  const timer = setInterval(run, RECONCILE_INTERVAL_MS)
  timer.unref?.()
  setImmediate(run)
  return timer
}
