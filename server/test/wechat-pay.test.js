import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import test from 'node:test'

import {
  closeWechatPayment,
  createJsapiPayment,
  queryWechatPayment,
  queryWechatRefund
} from '../src/lib/wechat-pay.js'

const merchant = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const platform = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const originalFetch = global.fetch
const originalEnv = { ...process.env }

function signedResponse(body, status = 200, requestId = 'request-id-test') {
  const raw = body == null ? '' : JSON.stringify(body)
  const timestamp = String(Math.floor(Date.now() / 1000))
  const nonce = 'response-nonce'
  const signature = crypto.sign('RSA-SHA256', Buffer.from(`${timestamp}\n${nonce}\n${raw}\n`), platform.privateKey).toString('base64')
  return new Response(raw || null, {
    status,
    headers: {
      'content-type': 'application/json',
      'request-id': requestId,
      'wechatpay-timestamp': timestamp,
      'wechatpay-nonce': nonce,
      'wechatpay-signature': signature,
      'wechatpay-serial': 'PLATFORM-SERIAL'
    }
  })
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
  process.env.WECHAT_PAY_API_HOSTS = 'https://primary.example,https://backup.example'
})

test.after(() => {
  global.fetch = originalFetch
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key]
  Object.assign(process.env, originalEnv)
})

test('APIv3 client signs requests, verifies responses, fails over, and uses correct endpoints', async () => {
  const calls = []
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    assert.match(String(options.headers.Authorization), /^WECHATPAY2-SHA256-RSA2048 /)
    if (String(url).startsWith('https://primary.example')) throw new Error('primary unavailable')
    if (String(url).endsWith('/v3/pay/transactions/jsapi')) {
      const payload = JSON.parse(options.body)
      assert.equal(payload.amount.total, 1234)
      assert.match(payload.time_expire, /\+08:00$/)
      return signedResponse({ prepay_id: 'wx-prepay-id' })
    }
    if (String(url).includes('/v3/pay/transactions/out-trade-no/ORDER-1?mchid=')) {
      return signedResponse({ appid: 'wx-test-app', mchid: '1900000001', out_trade_no: 'ORDER-1', trade_state: 'NOTPAY' })
    }
    if (String(url).endsWith('/v3/pay/transactions/out-trade-no/ORDER-1/close')) return signedResponse(null, 204)
    if (String(url).endsWith('/v3/refund/domestic/refunds/REFUND-1')) return signedResponse({ out_refund_no: 'REFUND-1', status: 'PROCESSING' })
    throw new Error(`unexpected URL: ${url}`)
  }

  const payment = await createJsapiPayment({
    outTradeNo: 'ORDER-1', description: '测试订单', amountFen: 1234, openid: 'openid-test', expiresAt: Date.now() + 600_000
  })
  assert.deepEqual(Object.keys(payment).sort(), ['nonceStr', 'package', 'paySign', 'signType', 'timeStamp'])
  assert.equal(payment.package, 'prepay_id=wx-prepay-id')
  assert.equal((await queryWechatPayment('ORDER-1')).trade_state, 'NOTPAY')
  await closeWechatPayment('ORDER-1')
  assert.equal((await queryWechatRefund('REFUND-1')).status, 'PROCESSING')
  assert.ok(calls.some((call) => call.url.startsWith('https://backup.example')))
})

test('APIv3 client rejects a tampered response before using its body', async () => {
  process.env.WECHAT_PAY_API_HOSTS = 'https://primary.example'
  global.fetch = async () => {
    const response = signedResponse({ appid: 'wx-test-app', mchid: '1900000001', trade_state: 'SUCCESS' })
    response.headers.set('wechatpay-signature', Buffer.from('tampered-signature').toString('base64'))
    return response
  }
  await assert.rejects(() => queryWechatPayment('ORDER-TAMPERED'), /\u5e94\u7b54\u9a8c\u7b7e\u5931\u8d25/)
})
