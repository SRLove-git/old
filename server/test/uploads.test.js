import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import sharp from 'sharp'
import { saveImageDataUrl, UPLOAD_DIR } from '../src/lib/uploads.js'

test('uploaded images are converted to WebP below the quality-check limit', async (t) => {
  const width = 900
  const height = 900
  const source = await sharp(crypto.randomBytes(width * height * 3), {
    raw: { width, height, channels: 3 }
  }).jpeg({ quality: 90 }).toBuffer()

  const url = await saveImageDataUrl(`data:image/jpeg;base64,${source.toString('base64')}`, 'test-image')
  const filename = path.basename(url)
  const savedPath = path.join(UPLOAD_DIR, filename)
  t.after(() => fs.rmSync(savedPath, { force: true }))

  assert.match(url, /^\/api\/uploads\/files\/test-image-.+\.webp$/)
  assert.ok(fs.statSync(savedPath).size <= 190_000)
})
