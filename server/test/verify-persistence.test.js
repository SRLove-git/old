import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

test('核销和补签写盘失败时保持原状态，恢复后重试只办理一次', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'suiyueli-verify-retry-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const dataFile = path.join(dir, 'data.json')
  process.env.DATA_FILE = dataFile
  const store = await import('../src/store.js')
  const db = store.init()
  db.orders = [{ id: 'o1', code: '1122 3344', status: '待核销', serviceMode: 'verify_code' }]
  db.cards = [{ id: 'card', userId: 'u1', title: '课卡', remain: 2, total: 2, attendanceRecords: [] }]
  store.save()
  const originalLogs = structuredClone(db.logs)
  const makeup = () => store.makeupCheckInCard('card', { date: '2025-01-01', reason: '纸质签到核实' }, { operator: '测试员' })
  // 文件应是普通文件；临时将同名路径变成目录，让真实的原子替换失败。
  fs.renameSync(dataFile, path.join(dir, 'original.json'))
  fs.mkdirSync(dataFile)
  assert.throws(() => store.verifyOrder('o1'))
  assert.throws(makeup)
  assert.equal(db.orders[0].status, '待核销')
  assert.deepEqual(db.logs, originalLogs)
  assert.equal(db.cards[0].remain, 2)
  assert.deepEqual(db.cards[0].attendanceRecords, [])
  fs.rmdirSync(dataFile)
  fs.renameSync(path.join(dir, 'original.json'), dataFile)
  assert.equal(store.verifyOrder('o1').status, '待评价')
  assert.equal(makeup().remain, 1)
  assert.equal(makeup().remain, 1)
  const saved = JSON.parse(fs.readFileSync(dataFile, 'utf8'))
  assert.equal(saved.cards[0].attendanceRecords.length, 1)
  assert.equal(saved.cards[0].remain, 1)
})
