const createQrCode = require('./vendor/qrcode-generator.js')

// Vendored MIT encoder supplies version selection, encoding and error correction.
createQrCode.stringToBytes = createQrCode.stringToBytesFuncs['UTF-8']

function buildMatrix(text) {
  const value = String(text == null ? '' : text)
  if (!value || value.length > 1024) throw new Error('二维码内容为空或过长')
  const qr = createQrCode(0, 'M')
  qr.addData(value, 'Byte')
  qr.make()
  const size = qr.getModuleCount()
  return Array.from({ length: size }, (_, row) => (
    Array.from({ length: size }, (_, column) => qr.isDark(row, column) ? 1 : 0)
  ))
}

function draw(ctx, text, size = 200) {
  const matrix = buildMatrix(text)
  const pixels = Math.floor(Number(size))
  const quiet = 4
  const cell = Math.floor(pixels / (matrix.length + quiet * 2))
  if (!Number.isFinite(pixels) || cell < 1) throw new Error('二维码画布尺寸过小')
  // Whole-pixel modules plus a four-module quiet zone prevent blurred edges.
  const offset = Math.floor((pixels - matrix.length * cell) / 2)
  ctx.setFillStyle('#ffffff')
  ctx.fillRect(0, 0, pixels, pixels)
  ctx.setFillStyle('#141821')
  matrix.forEach((row, y) => row.forEach((value, x) => {
    if (value) ctx.fillRect(offset + x * cell, offset + y * cell, cell, cell)
  }))
}

module.exports = { buildMatrix, draw }
