import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const jsQR = require('jsqr')
const qr = require('../../miniprogram/utils/qrcode.js')

// Rasterize the actual wx canvas drawing commands, then decode them with an
// independent QR reader. This rejects the previous hash-pattern placeholder.
function render(value, size) {
  const pixels = new Uint8ClampedArray(size * size * 4)
  let colour
  const ctx = {
    setFillStyle(hex) {
      colour = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16))
    },
    fillRect(x, y, width, height) {
      for (const n of [x, y, width, height]) assert.equal(Number.isInteger(n), true)
      for (let row = y; row < y + height; row++) {
        for (let column = x; column < x + width; column++) {
          const offset = (row * size + column) * 4
          pixels.set([...colour, 255], offset)
        }
      }
    }
  }
  qr.draw(ctx, value, size)
  return pixels
}

for (const [value, size] of [
  ['880820260001', 100],
  ['880820260002', 200],
  ['会员-岁悦里-12345', 224],
  ['member:1234567890😀', 224],
  [`member-${'1234567890'.repeat(35)}`, 500]
]) {
  test(`rendered QR decodes its exact payload at ${size}px (${value.length} chars)`, () => {
    const result = jsQR(render(value, size), size, size)
    assert.ok(result, 'independent QR decoder must recognize the rendered image')
    assert.equal(result.data, value)
  })
}

test('QR wrapper rejects empty, oversized payloads and undersized canvases', () => {
  assert.throws(() => qr.buildMatrix(''), /为空/)
  assert.throws(() => qr.buildMatrix('a'.repeat(1025)), /过长/)
  assert.throws(() => qr.draw({}, '880820260001', 20), /尺寸过小/)
})

test('vendored QR encoder matches the pinned upstream distribution', () => {
  assert.deepEqual(
    fs.readFileSync(new URL('../../miniprogram/utils/vendor/qrcode-generator.js', import.meta.url)),
    fs.readFileSync(require.resolve('qrcode-generator'))
  )
})
