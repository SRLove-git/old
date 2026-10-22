import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'suiyueli-sync-integrity-'))
process.env.DATA_FILE = path.join(directory, 'data.json')
const store = await import(`../src/store.js?sync-integrity=${Date.now()}`)

test.after(() => fs.rmSync(directory, { recursive: true, force: true }))

function setup() {
  const database = store.init()
  database.activities = [
    { id: 9101, title: '已发布活动', status: 1, memberPrice: 10, price: 10, schedules: [], skus: [] },
    { id: 9102, title: '已下架活动', status: 0, memberPrice: 10, price: 10, schedules: [], skus: [] }
  ]
  database.products = [
    {
      id: 9201,
      title: '库存商品',
      status: 1,
      memberPrice: 20,
      price: 20,
      stock: 3,
      limitPerUser: 2,
      serviceMode: 'delivery',
      sellType: 'sku',
      hasSku: true,
      schedules: [],
      skus: [{ id: 'sku-1', name: '默认规格', memberPrice: 20, price: 20, stock: 3 }]
    },
    { id: 9202, title: '已下架商品', status: 0, memberPrice: 20, price: 20, stock: 3, schedules: [], skus: [] }
  ]
  database.orders = []
  database.customers = [{ id: 'sync-user', name: '同步测试会员', balance: 0, wechatOpenId: 'openid-sync' }]
  store.save()
  return database
}

test('public collections exclude unpublished activities and products', () => {
  const database = setup()
  database.managers = [
    { id: 9301, name: '正常主理人', status: 1 },
    { id: 9302, name: '冻结主理人', status: 2 },
    { id: 9303, name: '清退主理人', status: 3 }
  ]
  assert.deepEqual(store.listActivitiesForDisplay({ publishedOnly: true }).map((item) => item.id), [9101])
  assert.deepEqual(store.listProducts({ publishedOnly: true }).map((item) => item.id), [9201])
  assert.deepEqual(store.listPublicManagers().map((item) => item.id), [9301])
})

test('product orders reserve and release stock and enforce cumulative purchase limits', () => {
  const database = setup()
  const product = database.products.find((item) => item.id === 9201)
  const order = store.createOrder({
    activityId: 9201,
    userId: 'sync-user',
    skuId: 'sku-1',
    count: 1,
    address: { name: '测试会员' }
  })

  assert.equal(product.stock, 2)
  assert.equal(product.skus[0].stock, 2)
  assert.throws(() => store.createOrder({ activityId: 9201, userId: 'sync-user', skuId: 'missing', count: 1 }), /规格已失效/)
  assert.throws(() => store.createOrder({ activityId: 9201, userId: 'sync-user', skuId: 'sku-1', count: 2 }), /每人限购2份/)

  store.cancelOrder(order.id, 'sync-user')
  assert.equal(product.stock, 3)
  assert.equal(product.skus[0].stock, 3)
  store.cancelOrder(order.id, 'sync-user')
  assert.equal(product.stock, 3)
  assert.equal(product.skus[0].stock, 3)
})

test('payment is blocked when a product is taken offline after order creation', () => {
  const database = setup()
  const order = store.createOrder({ activityId: 9201, userId: 'sync-user', skuId: 'sku-1', count: 1 })
  database.products.find((item) => item.id === 9201).status = 0
  assert.throws(() => store.prepareOrderPayment(order.id, 'sync-user'), /已下架/)
})

test('configuration and category display limits are committed as one validated update', () => {
  const database = setup()
  const [categoryId, category] = Object.entries(database.categories)[0]
  const previousName = database.config.brand.chineseName
  const previousLimit = category.homeDisplayLimit

  assert.throws(() => store.updateConfiguration(
    { brand: { chineseName: '不应保存' } },
    [{ id: categoryId, homeDisplayLimit: 51 }]
  ), /0到50/)
  assert.equal(database.config.brand.chineseName, previousName)
  assert.equal(database.categories[categoryId].homeDisplayLimit, previousLimit)

  const result = store.updateConfiguration(
    { brand: { chineseName: '同步后的品牌名' } },
    [{ id: categoryId, homeDisplayLimit: 4 }]
  )
  assert.equal(result.config.brand.chineseName, '同步后的品牌名')
  assert.equal(result.categories[categoryId].homeDisplayLimit, 4)
})
