import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'suiyueli-manager-identity-'))
process.env.DATA_FILE = path.join(directory, 'data.json')
const store = await import(`../src/store.js?manager-identity=${Date.now()}`)

test.after(() => fs.rmSync(directory, { recursive: true, force: true }))

// 主理人身份只认「通过 userId 关联到会员账号的主理人记录」：
// 个人中心入口与工作台权限必须同源，避免出现入口可见、点进去却被拒绝的情况。
function setup() {
  const database = store.init()
  database.managers = [
    { id: 9401, userId: 'manager-user', name: '已关联主理人', status: 1, commissionRate: 8 },
    { id: 9402, name: '未关联主理人', status: 1, commissionRate: 8 },
    { id: 9403, userId: 'revoked-user', name: '已清退主理人', status: 3, commissionRate: 8 }
  ]
  database.customers = [
    { id: 'manager-user', name: '已关联主理人', member: true, balance: 0, points: 0, managerId: null, isManager: true },
    { id: 'stale-user', name: '仅标记会员', member: true, balance: 0, points: 0, managerId: null, isManager: true },
    { id: 'revoked-user', name: '已清退主理人', member: true, balance: 0, points: 0, managerId: null, isManager: true },
    { id: 'plain-user', name: '普通会员', member: true, balance: 0, points: 0, managerId: null, isManager: false }
  ]
  database.managerApplications = []
  database.commissions = []
  database.withdraws = []
  database.activities = [{ id: 9501, title: '可推广活动', status: 1, memberPrice: 100, price: 100 }]
  database.products = [{ id: 9502, title: '可推广商品', status: 1, memberPrice: 200, price: 200 }]
  database.lives = [{ id: 9503, title: '可推广课程', memberPrice: 300, originalPrice: 300 }]
  store.save()
  return database
}

test('isManager only follows the manager record linked to the account', () => {
  setup()
  const linked = store.getUserProfile('manager-user')
  assert.equal(linked.isManager, true)
  assert.equal(String(linked.manager.id), '9401')

  // 只有 isManager 标记、没有主理人记录：不再显示入口，也不下发工作台数据
  const stale = store.getUserProfile('stale-user')
  assert.equal(stale.isManager, false)
  assert.equal(stale.manager, null)

  // 已清退的主理人记录不再赋予工作台身份
  assert.equal(store.getUserProfile('revoked-user').isManager, false)
  assert.equal(store.getUserProfile('plain-user').isManager, false)
})

test('stale isManager flag no longer blocks a new manager application', () => {
  setup()
  const application = store.applyManager({
    userId: 'stale-user',
    name: '仅标记会员',
    phone: '13800001111',
    groupCount: 1,
    memberCount: 20
  })
  assert.equal(String(application.userId), 'stale-user')
  assert.ok(['待付款', '待审核'].includes(application.status))
})

test('manager dashboard promotions cover activities, products and courses', () => {
  setup()
  const dashboard = store.getManagerDashboard(9401, { userId: 'manager-user' })
  const promotions = dashboard.promotions.map((item) => ({ id: item.id, type: item.type || 'activity' }))
  assert.deepEqual(promotions, [
    { id: 9501, type: 'activity' },
    { id: 9502, type: 'product' },
    { id: 9503, type: 'live' }
  ])
  promotions.forEach((item, index) => {
    assert.equal(typeof dashboard.promotions[index].commissionRate, 'number')
    assert.equal(typeof dashboard.promotions[index].commissionAmount, 'number')
  })
})
