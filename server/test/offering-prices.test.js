import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizePaidOfferingPrices,
  optionalDisplayPrice,
  requiredPaidPrice
} from '../src/lib/offering-prices.js'

test('paid prices are rounded and zero-value paid offerings are rejected', () => {
  assert.equal(requiredPaidPrice('12.345', '会员价'), 12.35)
  assert.equal(optionalDisplayPrice(0, '原价'), 0)
  assert.throws(() => requiredPaidPrice(0, '会员价'), /最低为0.01元/)
  assert.throws(() => optionalDisplayPrice(-1, '原价'), /不能小于0元/)
})

test('offering prices and sku prices are normalized consistently', () => {
  const offering = normalizePaidOfferingPrices(
    {
      memberPrice: '9.999',
      price: '12.345',
      originalPrice: '20',
      skus: [{ name: '标准版', memberPrice: '8.888', price: '10.556' }]
    },
    '商品'
  )
  assert.equal(offering.memberPrice, 10)
  assert.equal(offering.price, 12.35)
  assert.equal(offering.originalPrice, 20)
  assert.equal(offering.skus[0].memberPrice, 8.89)
  assert.equal(offering.skus[0].price, 10.56)
})

test('course prices can omit the regular price normalization', () => {
  const offering = normalizePaidOfferingPrices(
    { memberPrice: 19.9, price: 0, skus: [] },
    '课程',
    { includeRegularPrice: false }
  )
  assert.equal(offering.memberPrice, 19.9)
  assert.equal(offering.price, 0)
})
