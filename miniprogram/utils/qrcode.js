// 极简二维码样式生成器：基于文本哈希生成 21x21 的伪二维码矩阵。
// 仅用于演示「推广码 / 会员码」的扫码占位，不保证可被真实扫码器识别。

function buildMatrix(text) {
  const n = 21
  const m = Array.from({ length: n }, () => Array(n).fill(0))
  let h = 2166136261
  const seed = String(text == null ? '' : text)
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = (h * 16777619) >>> 0
  }
  const rnd = () => {
    h ^= h << 13
    h ^= h >>> 17
    h ^= h << 5
    h >>>= 0
    return h / 4294967295
  }
  const finder = (r, c) => {
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 7; j++) {
        const border = i === 0 || i === 6 || j === 0 || j === 6
        const core = i >= 2 && i <= 4 && j >= 2 && j <= 4
        m[r + i][c + j] = border || core ? 1 : 0
      }
    }
  }
  finder(0, 0)
  finder(0, n - 7)
  finder(n - 7, 0)
  for (let i = 8; i < n - 8; i++) {
    m[6][i] = i % 2 === 0 ? 1 : 0
    m[i][6] = i % 2 === 0 ? 1 : 0
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const inFinder = (i < 8 && j < 8) || (i < 8 && j >= n - 8) || (i >= n - 8 && j < 8)
      if (inFinder || i === 6 || j === 6) continue
      m[i][j] = rnd() > 0.5 ? 1 : 0
    }
  }
  return m
}

// 在 wx.createCanvasContext 上绘制指定文本的二维码，占满 size x size 区域
function draw(ctx, text, size) {
  const n = 21
  const quiet = 4
  const cell = Number(size || 200) / (n + quiet * 2)
  ctx.setFillStyle('#ffffff')
  ctx.fillRect(0, 0, size, size)
  ctx.setFillStyle('#141821')
  const matrix = buildMatrix(text)
  matrix.forEach((row, r) => {
    row.forEach((v, c) => {
      if (v) ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell + 0.5, cell + 0.5)
    })
  })
}

module.exports = { buildMatrix, draw }
