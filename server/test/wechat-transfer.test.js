import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import test from 'node:test'

import {
  createTransferBill,
  encryptSensitive,
  queryTransferBill,
  cancelTransferBill,
  transferRequestSnapshot,
  transferConfigured,
  transferPublicConfig
} from '../src/lib/wechat-transfer.js'

const merchant = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const platform = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const originalFetch = global.fetch
const originalEnv = { ...process.env }

function signedResponse(body, status = 200) {
  const raw = body == null ? '' : JSON.stringify(body)
  const timestamp = String(Math.floor(Date.now() / 1000))
  const nonce = 'transfer-nonce'
  const signature = crypto.sign('RSA-SHA256', Buffer.from(`${timestamp}\n${nonce}\n${raw}\n`), platform.privateKey).toString('base64')
  return new Response(raw || null, {
    status,
    headers: {
      'content-type': 'application/json',
      'request-id': 'transfer-request-id',
      'wechatpay-timestamp': timestamp,
      'wechatpay-nonce': nonce,
      'wechatpay-signature': signature,
      'wechatpay-serial': 'PLATFORM-SERIAL'
    }
  })
}

function decryptName(ciphertext) {
  return crypto.privateDecrypt({
    key: platform.privateKey,
    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: 'sha1'
  }, Buffer.from(ciphertext, 'base64')).toString('utf8')
}

test.before(() => {
  process.env.WECHAT_APPID = 'wx-test-app'
  process.env.WECHAT_PAY_MCH_ID = '1900000001'
  process.env.WECHAT_PAY_CERT_SERIAL = 'MERCHANT-SERIAL'
  process.env.WECHAT_PAY_PRIVATE_KEY = merchant.privateKey.export({ type: 'pkcs8', format: 'pem' })
  process.env.WECHAT_PAY_API_V3_KEY = '12345678901234567890123456789012'
  process.env.WECHAT_PAY_NOTIFY_URL = 'https://merchant.example/api/payments/wechat/notify'
  process.env.WECHAT_PAY_PLATFORM_SERIAL = 'PLATFORM-SERIAL'
  process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY = platform.publicKey.export({ type: 'spki', format: 'pem' })
  process.env.WECHAT_PAY_API_HOSTS = 'https://primary.example'
  process.env.WECHAT_TRANSFER_ENABLED = 'true'
  process.env.WECHAT_TRANSFER_SCENE_ID = '1005'
  process.env.WECHAT_TRANSFER_NOTIFY_URL = ''
  process.env.WECHAT_TRANSFER_SCENE_REPORT_INFOS = ''
  process.env.WECHAT_TRANSFER_PERCEPTION = ''
  process.env.WECHAT_TRANSFER_REMARK = ''
})

test.after(() => {
  global.fetch = originalFetch
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key]
  Object.assign(process.env, originalEnv)
})

test('商家转账启用后推导回调地址并暴露收款确认所需配置', () => {
  assert.equal(transferConfigured(), true)
  assert.deepEqual(transferPublicConfig(), {
    enabled: true,
    appId: 'wx-test-app',
    mchId: '1900000001',
    sceneId: '1005',
    error: ''
  })
})

test('发起转账携带佣金报酬场景报备信息，并对同一请求快照原样重试', async () => {
  const calls = []
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    if (!String(url).endsWith('/v3/fund-app/mch-transfer/transfer-bills')) throw new Error(`unexpected URL: ${url}`)
    const payload = JSON.parse(options.body)
    assert.equal(payload.appid, 'wx-test-app')
    assert.equal(payload.out_bill_no, 'WD20260101001')
    assert.equal(payload.transfer_scene_id, '1005')
    assert.equal(payload.openid, 'openid-1')
    assert.equal(payload.transfer_amount, 250000)
    assert.equal(payload.transfer_remark, '岁悦里推广佣金')
    assert.equal(payload.user_recv_perception, '劳务报酬')
    assert.equal(payload.notify_url, 'https://merchant.example/api/transfers/wechat/notify')
    assert.deepEqual(payload.transfer_scene_report_infos, [
      { info_type: '岗位类型', info_content: '主理人' },
      { info_type: '报酬说明', info_content: '推广佣金' }
    ])
    assert.equal(decryptName(payload.user_name), '李秀兰')
    assert.equal(options.headers['Wechatpay-Serial'], 'PLATFORM-SERIAL')
    assert.match(String(options.headers.Authorization), /^WECHATPAY2-SHA256-RSA2048 /)
    return signedResponse({
      out_bill_no: 'WD20260101001',
      transfer_bill_no: 'TB-1',
      create_time: '2026-01-01T10:00:00+08:00',
      state: 'WAIT_USER_CONFIRM',
      package_info: 'package-info=='
    })
  }

  const snapshot = transferRequestSnapshot({
    outBillNo: 'WD20260101001',
    openid: 'openid-1',
    amountFen: 250000,
    userName: '李秀兰'
  })
  assert.equal(snapshot.appId, 'wx-test-app')
  assert.equal(snapshot.mchId, '1900000001')
  assert.equal(decryptName(snapshot.encryptedUserName), '李秀兰')

  const bill = await createTransferBill(snapshot)
  assert.equal(bill.transfer_bill_no, 'TB-1')
  assert.equal(bill.package_info, 'package-info==')
  await createTransferBill(snapshot)
  assert.equal(calls.length, 2)
  assert.equal(calls[1].options.body, calls[0].options.body)
  assert.equal(calls[1].options.headers['Wechatpay-Serial'], calls[0].options.headers['Wechatpay-Serial'])
})

test('原始请求快照与当前商户配置不一致时停止重试', async () => {
  const snapshot = transferRequestSnapshot({ outBillNo: 'WD20260101002', openid: 'openid-2', amountFen: 100 })
  await assert.rejects(() => createTransferBill({ ...snapshot, mchId: '1900000002' }), /商户配置不一致/)
})

test('查单与撤销使用商户单号路径，并校验微信返回的商户信息', async () => {
  let cancelled = false
  global.fetch = async (url) => {
    const target = String(url)
    if (target.endsWith('/v3/fund-app/mch-transfer/transfer-bills/out-bill-no/WD20260101001')) {
      return signedResponse({
        mch_id: '1900000001',
        appid: 'wx-test-app',
        out_bill_no: 'WD20260101001',
        transfer_bill_no: 'TB-1',
        state: 'WAIT_USER_CONFIRM',
        transfer_amount: 250000,
        create_time: '2026-01-01T10:00:00+08:00',
        update_time: '2026-01-01T10:00:00+08:00'
      })
    }
    if (target.endsWith('/v3/fund-app/mch-transfer/transfer-bills/out-bill-no/WD20260101001/cancel')) {
      cancelled = true
      return signedResponse({
        out_bill_no: 'WD20260101001',
        transfer_bill_no: 'TB-1',
        state: 'CANCELING',
        update_time: '2026-01-01T10:05:00+08:00'
      })
    }
    throw new Error(`unexpected URL: ${url}`)
  }

  const bill = await queryTransferBill('WD20260101001')
  assert.equal(bill.state, 'WAIT_USER_CONFIRM')
  const cancel = await cancelTransferBill('WD20260101001')
  assert.equal(cancel.state, 'CANCELING')
  assert.equal(cancelled, true)
})

test('微信返回其他商户的转账单时拒绝使用结果', async () => {
  global.fetch = async () => signedResponse({
    mch_id: '1900000002',
    appid: 'wx-test-app',
    out_bill_no: 'WD-OTHER',
    state: 'SUCCESS'
  })
  await assert.rejects(() => queryTransferBill('WD-OTHER'), /商户信息不匹配/)
})

test('查单响应缺少商户号或 AppID 时拒绝使用结果', async () => {
  global.fetch = async () => signedResponse({
    out_bill_no: 'WD-MISSING-MERCHANT',
    transfer_bill_no: 'TB-MISSING',
    state: 'SUCCESS'
  })
  await assert.rejects(() => queryTransferBill('WD-MISSING-MERCHANT'), /缺少商户号/)
})

test('未启用商家转账时拒绝发起，纯函数加密可逆', async () => {
  assert.equal(decryptName(encryptSensitive('测试用户', platform.publicKey.export({ type: 'spki', format: 'pem' }))), '测试用户')
  process.env.WECHAT_TRANSFER_ENABLED = 'false'
  assert.equal(transferConfigured(), false)
  const disabled = transferPublicConfig()
  assert.equal(disabled.enabled, false)
  assert.match(disabled.error, /未启用微信商家转账/)
  await assert.rejects(() => createTransferBill({
    outBillNo: 'WD1',
    openid: 'openid-1',
    amountFen: 100
  }), /未启用微信商家转账/)
  process.env.WECHAT_TRANSFER_ENABLED = 'true'
})
