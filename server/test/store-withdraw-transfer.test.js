import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'suiyueli-withdraw-transfer-'))
process.env.DATA_FILE = path.join(directory, 'data.json')

const store = await import(`../src/store.js?withdraw-transfer=${Date.now()}`)

test.after(() => {
  fs.rmSync(directory, { recursive: true, force: true })
})

function delay(ms = 2) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function resetDatabase({ commissions, monthlyLimit = 1, openid = 'openid-9001' } = {}) {
  const db = store.get()
  db.managers = [
    { id: 9001, userId: 'u-9001', name: '测试主理人', realName: '测试主理人', phone: '13800000000', commissionRate: 10, status: 1 }
  ]
  db.customers = [
    { id: 'u-9001', name: '测试主理人', phone: '13800000000', managerId: null, wechatOpenId: openid }
  ]
  db.commissions = commissions
  db.withdraws = []
  db.logs = []
  db.config.minWithdraw = 100
  db.config.withdrawTaxRate = 10
  db.config.withdrawMonthlyLimit = monthlyLimit
  store.save()
  return db
}

function commission(id, amount, createTime = '2026-01-05 10:00') {
  return {
    id,
    managerId: 9001,
    orderId: `ORDER-${id}`,
    customerId: 'u-1',
    customerName: '客户',
    productName: '测试活动',
    payAmount: amount * 10,
    commissionRate: 10,
    commissionAmount: amount,
    status: '可结算',
    createTime
  }
}

function bindRequest(withdraw, overrides = {}) {
  const request = {
    outBillNo: withdraw.outBillNo,
    openid: 'openid-9001',
    amountFen: withdraw.actualAmountFen,
    encryptedUserName: '',
    wechatpaySerial: '',
    appId: 'wx-test-app',
    mchId: '1900000001',
    sceneId: '1005',
    reportInfos: [
      { info_type: '岗位类型', info_content: '主理人' },
      { info_type: '报酬说明', info_content: '推广佣金' }
    ],
    perception: '劳务报酬',
    remark: '岁悦里推广佣金',
    notifyUrl: 'https://merchant.example/api/transfers/wechat/notify',
    ...(overrides.request || {})
  }
  store.bindWithdrawTransferRequest(withdraw.id, {
    openid: request.openid,
    amountFen: request.amountFen,
    appId: request.appId,
    mchId: request.mchId,
    request,
    ...overrides
  })
  return request
}

function createdBill(withdraw, overrides = {}) {
  return {
    out_bill_no: withdraw.outBillNo,
    transfer_bill_no: 'TB-1',
    state: 'WAIT_USER_CONFIRM',
    package_info: 'package-1==',
    create_time: '2026-01-05T10:00:00+08:00',
    ...overrides
  }
}

function verifiedBill(withdraw, overrides = {}) {
  return {
    mch_id: '1900000001',
    appid: 'wx-test-app',
    out_bill_no: withdraw.outBillNo,
    transfer_bill_no: 'TB-1',
    state: 'SUCCESS',
    transfer_amount: withdraw.actualAmountFen,
    openid: 'openid-9001',
    update_time: '2026-01-05T10:01:00+08:00',
    ...overrides
  }
}

test('微信转账成功后只结算本次锁定的佣金，重复通知保持幂等', async () => {
  const db = resetDatabase({ commissions: [commission('CM1', 300), commission('CM2', 200)] })
  const withdraw = store.applyWithdraw(9001, 250)
  assert.equal(withdraw.status, '待审核')

  const prepared = store.prepareWithdrawTransfer(withdraw.id, { taxRate: 10, operator: 'tester' })
  assert.equal(prepared.status, '打款中')
  assert.equal(prepared.payMethod, 'wechat')
  assert.equal(prepared.outBillNo, withdraw.id)
  assert.equal(prepared.tax, 25)
  assert.equal(prepared.actualAmount, 225)

  const recipient = store.managerTransferRecipient(9001)
  assert.equal(recipient.openid, 'openid-9001')
  assert.equal(recipient.name, '测试主理人')

  const request = bindRequest(prepared)
  assert.deepEqual(store.findWithdrawById(withdraw.id).transferRequest, request)
  const created = store.markWithdrawTransferCreated(withdraw.id, createdBill(prepared))
  assert.equal(created.transferPackage, 'package-1==')
  assert.equal(created.transferState, 'WAIT_USER_CONFIRM')

  const paid = store.applyWithdrawTransferState(withdraw.id, verifiedBill(prepared), {
    requiredFields: ['out_bill_no', 'transfer_bill_no', 'mch_id', 'appid', 'state', 'transfer_amount', 'openid']
  })
  assert.equal(paid.status, '已到账')
  assert.equal(paid.payOrderNo, 'TB-1')
  assert.equal(paid.payChannel, '微信零钱（商家转账）')
  const settled = db.commissions.filter((item) => item.status === '已结算')
  assert.equal(settled.length, 1)
  assert.equal(settled.reduce((sum, item) => sum + Number(item.commissionAmount), 0), 250)
  assert.equal(db.commissions.find((item) => item.id === 'CM1').commissionAmount, 50)

  const repeated = store.applyWithdrawTransferState(withdraw.id, verifiedBill(prepared))
  assert.equal(repeated.status, '已到账')
  assert.equal(db.commissions.filter((item) => item.status === '已结算').length, 1)
})

test('转账失败或撤销会释放锁定佣金，失败不计入当月提现次数', async () => {
  const db = resetDatabase({ commissions: [commission('CM1', 100), commission('CM2', 100)] })

  await delay()
  const failedWithdraw = store.applyWithdraw(9001, 100)
  const failedPrepared = store.prepareWithdrawTransfer(failedWithdraw.id, { taxRate: 10 })
  bindRequest(failedPrepared)
  store.markWithdrawTransferCreated(failedWithdraw.id, createdBill(failedPrepared, { transfer_bill_no: 'TB-F' }))
  const failed = store.applyWithdrawTransferState(failedWithdraw.id, {
    ...verifiedBill(failedPrepared, { state: 'FAIL', transfer_bill_no: 'TB-F' }),
    transfer_bill_no: 'TB-F',
    fail_reason: 'PAYEE_ACCOUNT_ABNORMAL'
  })
  assert.equal(failed.status, '打款失败')
  assert.match(failed.transferFailReasonText, /收款异常/)
  assert.equal(db.commissions.filter((item) => item.status === '可结算').length, 2)

  // 失败已释放佣金且不占当月次数，主理人可以直接重新申请
  await delay()
  const retryWithdraw = store.applyWithdraw(9001, 100)
  const retryPrepared = store.prepareWithdrawTransfer(retryWithdraw.id, { taxRate: 10 })
  bindRequest(retryPrepared)
  store.markWithdrawTransferCreated(retryWithdraw.id, createdBill(retryPrepared, { transfer_bill_no: 'TB-R' }))
  const cancelled = store.applyWithdrawTransferState(retryWithdraw.id,
    verifiedBill(retryPrepared, { state: 'CANCELLED', transfer_bill_no: 'TB-R' }))
  assert.equal(cancelled.status, '已撤销')
  assert.equal(db.commissions.filter((item) => item.status === '可结算').length, 2)
})

test('发起结果不明确时保留原单、原参数和锁定佣金，且禁止人工标记到账', () => {
  const db = resetDatabase({ commissions: [commission('CM1', 120)] })
  const withdraw = store.applyWithdraw(9001, 120)
  const prepared = store.prepareWithdrawTransfer(withdraw.id, { taxRate: 10 })
  const request = bindRequest(prepared)
  store.markWithdrawTransferRequestFailed(withdraw.id, new Error('微信支付网络请求超时'), { unknown: true })
  const unknown = store.findWithdrawById(withdraw.id)
  assert.equal(unknown.status, '打款中')
  assert.equal(unknown.transferState, 'UNKNOWN')
  assert.equal(unknown.outBillNo, prepared.outBillNo)
  assert.deepEqual(unknown.transferRequest, request)
  assert.equal(db.commissions.filter((item) => item.status === '提现中').length, 1)
  assert.throws(() => store.approveWithdraw(withdraw.id), /人工标记到账已禁用/)
})

test('发起接口直接返回终态时不结算，必须等待包含完整对账字段的查单结果', () => {
  const db = resetDatabase({ commissions: [commission('CM1', 120)] })
  const withdraw = store.applyWithdraw(9001, 120)
  const prepared = store.prepareWithdrawTransfer(withdraw.id, { taxRate: 10 })
  bindRequest(prepared)
  const created = store.markWithdrawTransferCreated(withdraw.id,
    createdBill(prepared, { state: 'SUCCESS', transfer_bill_no: 'TB-DIRECT' }))
  assert.equal(created.status, '打款中')
  assert.equal(created.transferState, 'UNKNOWN')
  assert.equal(db.commissions.filter((item) => item.status === '提现中').length, 1)
  assert.equal(db.commissions.filter((item) => item.status === '已结算').length, 0)
})

test('查单字段与不可变请求不一致时拒绝结算或释放佣金', () => {
  const db = resetDatabase({ commissions: [commission('CM1', 120)] })
  const withdraw = store.applyWithdraw(9001, 120)
  const prepared = store.prepareWithdrawTransfer(withdraw.id, { taxRate: 10 })
  bindRequest(prepared)
  store.markWithdrawTransferCreated(withdraw.id, createdBill(prepared))

  for (const mismatch of [
    { transfer_amount: prepared.actualAmountFen + 1 },
    { openid: 'other-openid' },
    { mch_id: '1900000002' },
    { appid: 'wx-other-app' },
    { out_bill_no: 'WDOTHER' },
    { transfer_bill_no: 'TB-OTHER' }
  ]) {
    assert.throws(() => store.applyWithdrawTransferState(prepared.outBillNo,
      verifiedBill(prepared, mismatch)), /不匹配/)
    assert.equal(store.findWithdrawById(withdraw.id).status, '打款中')
    assert.equal(db.commissions.filter((item) => item.status === '提现中').length, 1)
  }
})

test('转账期间订单退款不修改转账金额，成功后转为佣金负债', () => {
  const db = resetDatabase({ commissions: [commission('CM1', 200)] })
  const withdraw = store.applyWithdraw(9001, 200)
  const prepared = store.prepareWithdrawTransfer(withdraw.id, { taxRate: 0 })
  bindRequest(prepared)
  store.markWithdrawTransferCreated(withdraw.id, createdBill(prepared, { transfer_bill_no: 'TB-C' }))

  store.clawbackCommission({ id: 'ORDER-CM1' }, 1)
  const inFlight = store.findWithdrawById(withdraw.id)
  assert.equal(inFlight.status, '打款中')
  assert.equal(inFlight.amount, 200)
  assert.equal(inFlight.pendingClawbackAmount, 200)

  store.applyWithdrawTransferState(withdraw.id,
    verifiedBill(prepared, { state: 'SUCCESS', transfer_bill_no: 'TB-C' }))
  const debts = db.commissions.filter((item) => item.type === 'refund-clawback')
  assert.equal(debts.length, 1)
  assert.equal(debts[0].commissionAmount, -200)
  assert.equal(debts[0].managerId, 9001)
  assert.equal(store.findWithdrawById(withdraw.id).pendingClawbackAmount, 0)
})

test('主理人未绑定微信身份时拒绝发起转账', () => {
  resetDatabase({ commissions: [commission('CM1', 120)], openid: '' })
  const withdraw = store.applyWithdraw(9001, 120)
  store.prepareWithdrawTransfer(withdraw.id, { taxRate: 10 })
  assert.throws(() => store.managerTransferRecipient(9001), /openid/)
})

test('收款人姓名只读取实名字段，不使用昵称兜底', () => {
  const db = resetDatabase({ commissions: [commission('CM1', 120)] })
  delete db.managers[0].realName
  db.customers[0].name = '微信昵称'
  delete db.customers[0].realName
  store.save()
  assert.deepEqual(store.managerTransferRecipient(9001), {
    openid: 'openid-9001',
    name: ''
  })
})
