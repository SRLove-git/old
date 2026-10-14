import fs from 'node:fs'
import path from 'node:path'

export function readJsonFileSync(filePath) {
  if (!fs.existsSync(filePath)) return null
  const source = fs.readFileSync(filePath, 'utf8')
  if (!source.trim()) return null

  try {
    const value = JSON.parse(source)
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError('根节点必须是 JSON 对象')
    }
    return value
  } catch (cause) {
    const error = new Error(`数据文件无法解析，已停止启动以避免覆盖：${filePath}`, { cause })
    error.code = 'DATA_FILE_INVALID'
    throw error
  }
}

export function writeJsonFileAtomicSync(filePath, value) {
  const directory = path.dirname(filePath)
  const temporaryPath = path.join(directory, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`)
  const backupPath = `${filePath}.bak`
  const payload = `${JSON.stringify(value, null, 2)}\n`
  let descriptor = null

  fs.mkdirSync(directory, { recursive: true })
  try {
    descriptor = fs.openSync(temporaryPath, 'wx', 0o600)
    fs.writeFileSync(descriptor, payload, 'utf8')
    fs.fsyncSync(descriptor)
    fs.closeSync(descriptor)
    descriptor = null

    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
      fs.copyFileSync(filePath, backupPath)
    }
    fs.renameSync(temporaryPath, filePath)
  } catch (error) {
    if (descriptor !== null) fs.closeSync(descriptor)
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath)
    throw error
  }
}
