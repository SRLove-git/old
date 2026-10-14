import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { readJsonFileSync, writeJsonFileAtomicSync } from '../src/lib/json-file-store.js'

function withTemporaryDirectory(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'suiyueli-json-store-'))
  try {
    return run(directory)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

test('missing and empty files are treated as uninitialized storage', () => {
  withTemporaryDirectory((directory) => {
    const filePath = path.join(directory, 'data.json')
    assert.equal(readJsonFileSync(filePath), null)
    fs.writeFileSync(filePath, '')
    assert.equal(readJsonFileSync(filePath), null)
  })
})

test('atomic writes preserve the previous version as a backup', () => {
  withTemporaryDirectory((directory) => {
    const filePath = path.join(directory, 'data.json')
    writeJsonFileAtomicSync(filePath, { version: 1, items: ['first'] })
    writeJsonFileAtomicSync(filePath, { version: 2, items: ['second'] })

    assert.deepEqual(readJsonFileSync(filePath), { version: 2, items: ['second'] })
    assert.deepEqual(readJsonFileSync(`${filePath}.bak`), { version: 1, items: ['first'] })
    assert.equal(fs.readdirSync(directory).some((name) => name.endsWith('.tmp')), false)
  })
})

test('invalid JSON is reported and never replaced with seed data', () => {
  withTemporaryDirectory((directory) => {
    const filePath = path.join(directory, 'data.json')
    const corrupted = '{"orders": ['
    fs.writeFileSync(filePath, corrupted)

    assert.throws(
      () => readJsonFileSync(filePath),
      (error) => error.code === 'DATA_FILE_INVALID' && error.message.includes(filePath)
    )
    assert.equal(fs.readFileSync(filePath, 'utf8'), corrupted)
  })
})

test('valid JSON with an invalid root type is rejected', () => {
  withTemporaryDirectory((directory) => {
    const filePath = path.join(directory, 'data.json')
    fs.writeFileSync(filePath, '[]')
    assert.throws(() => readJsonFileSync(filePath), { code: 'DATA_FILE_INVALID' })
  })
})
