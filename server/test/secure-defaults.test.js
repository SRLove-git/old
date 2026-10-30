import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const serverRoot = fileURLToPath(new URL('../', import.meta.url))
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'suiyueli-secure-defaults-'))
test.after(() => fs.rmSync(directory, { recursive: true, force: true }))

// 模块级凭据必须在独立进程中测试，不能从开发者终端继承真实环境配置。
function isolated(environment, body) {
  const dataDir = fs.mkdtempSync(path.join(directory, 'case-'))
  const script = `
    import assert from 'node:assert/strict'
    import crypto from 'node:crypto'
    import fs from 'node:fs'
    import { seed } from './src/seed.js'
    import * as store from './src/store.js'
    import * as session from './src/lib/session.js'
    import * as auth from './src/middleware/auth.js'
    globalThis.fetch = async () => { throw new Error('External requests are prohibited in this test') }
    function signedWith(secret) {
      const body = Buffer.from(JSON.stringify({userId:'member-test',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')
      return body+'.'+crypto.createHmac('sha256',secret).update(body).digest('base64url')
    }
    function existingDatabase() {
      const database = structuredClone(seed)
      database.adminAccounts = [
        {id:'admin-super',username:'admin',name:'Existing admin',role:'super_admin',permissions:['*'],status:1,...session.passwordRecord('existing-test-password')},
        {id:'disabled-staff',username:'disabled',name:'Disabled staff',role:'staff',permissions:[],status:0,...session.passwordRecord('disabled-test-password')}
      ]
      fs.writeFileSync(process.env.DATA_FILE, JSON.stringify(database))
      return database.adminAccounts
    }
    ${body}
  `
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: serverRoot,
    env: { PATH: process.env.PATH, DATA_FILE: path.join(dataDir, 'data.json'), ...environment },
    encoding: 'utf8', timeout: 10000
  })
  assert.equal(result.status, 0, result.stderr || String(result.error || 'isolated validation failed'))
}

for (const [label, environment] of [['unset NODE_ENV', {}], ['production', { NODE_ENV: 'production' }]]) {
  test(`${label}: missing credentials never enable public session/admin defaults or bootstrap a password`, () => {
    isolated(environment, `
      assert.equal(store.init().adminAccounts.length, 0)
      assert.throws(() => session.encodeSession({userId:'member-test',exp:Math.floor(Date.now()/1000)+3600}), error => error.status === 503)
      assert.equal(session.decodeSession(signedWith('suiyueli-local-session-secret')), null)
      // 即使已有启用的管理员，也不能用公开开发 Token 绕过身份验证。
      store.get().adminAccounts.push({id:'admin-existing',username:'existing',name:'Existing admin',role:'super_admin',permissions:['*'],status:1})
      assert.equal(auth.adminTokenConfigured(), false)
      assert.equal(auth.adminSession({headers:{'x-admin-token':'admin-token'}}), null)
      let status
      auth.adminAuth({headers:{'x-admin-token':'admin-token'},originalUrl:'/api/config',method:'GET'}, {status(value){status=value;return this},json(){}}, () => assert.fail('must not authorize'))
      assert.equal(status, 401)
    `)
  })
}

test('explicit development retains local credential defaults', () => {
  isolated({ NODE_ENV: 'development' }, `
    const db = store.init()
    assert.equal(db.adminAccounts.length, 1)
    assert.ok(store.authenticateAdmin('admin', 'suiyueli-admin'))
    const encoded = session.encodeSession({userId:'member-test',exp:Math.floor(Date.now()/1000)+3600})
    assert.equal(session.decodeSession(encoded).userId, 'member-test')
    assert.equal(auth.adminTokenConfigured(), true)
    assert.equal(auth.adminSession({headers:{'x-admin-token':'admin-token'}}).id, 'admin-super')
  `)
})

for (const [label, environment] of [['unset NODE_ENV', {}], ['production', { NODE_ENV: 'production' }]]) {
  test(`${label}: explicit credentials enable sessions and initial admin without public fallbacks`, () => {
    isolated({ ...environment, SESSION_SECRET: 'explicit-test-secret', ADMIN_PASSWORD: 'explicit-test-password', ADMIN_TOKEN: 'explicit-test-admin-token' }, `
      store.init()
      assert.ok(store.authenticateAdmin('admin', 'explicit-test-password'))
      assert.equal(store.authenticateAdmin('admin', 'suiyueli-admin'), null)
      const encoded = session.encodeSession({userId:'member-test',exp:Math.floor(Date.now()/1000)+3600})
      assert.equal(session.decodeSession(encoded).userId, 'member-test')
      assert.equal(session.decodeSession(signedWith('suiyueli-local-session-secret')), null)
      assert.equal(auth.adminTokenConfigured(), true)
      assert.equal(auth.adminSession({headers:{'x-admin-token':'explicit-test-admin-token'}}).id, 'admin-super')
      assert.equal(auth.adminSession({headers:{'x-admin-token':'admin-token'}}), null)
    `)
  })
}

for (const [label, environment] of [
  ['unset environment with no bootstrap password', {}],
  ['production with no bootstrap password', { NODE_ENV: 'production' }],
  ['production with a different bootstrap password', { NODE_ENV: 'production', ADMIN_PASSWORD: 'new-bootstrap-password' }]
]) {
  test(`${label}: preserve persisted admin passwords and enabled/disabled status`, () => {
    isolated(environment, `
      const original = existingDatabase()
      const accounts = store.init().adminAccounts
      assert.equal(accounts.length, 2)
      for (const prior of original) {
        const actual = accounts.find(account => account.id === prior.id)
        assert.equal(actual.status, prior.status)
        assert.equal(actual.salt, prior.salt)
        assert.equal(actual.passwordHash, prior.passwordHash)
      }
      assert.ok(store.authenticateAdmin('admin', 'existing-test-password'))
      assert.equal(store.authenticateAdmin('admin', 'new-bootstrap-password'), null)
      assert.equal(store.authenticateAdmin('disabled', 'disabled-test-password'), null)
    `)
  })
}
