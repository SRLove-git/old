import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { httpError } from './http.js'

export const UPLOAD_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads')

fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const IMAGE_STAGING_DIR = path.resolve(UPLOAD_DIR, '../.image-staging')
const SPACE_CHECK_INTERVAL = 8 * 1024 * 1024
const DISK_RESERVE = 256 * 1024 * 1024
let stagingReady
let nextStagingCleanup = 0
let activeImageStreams = 0
const TARGET_IMAGE_BYTES = 190_000
const IMAGE_WIDTHS = [1600, 1280, 1024, 800, 640]
const IMAGE_QUALITIES = [82, 74, 66, 58, 50]

async function optimizeImage(input) {
  const { data, info } = await sharp(input).rotate()
    .resize({ width: IMAGE_WIDTHS[0], height: IMAGE_WIDTHS[0], fit: 'inside', withoutEnlargement: true })
    .toColourspace('srgb').raw().toBuffer({ resolveWithObject: true })
  const raw = { width: info.width, height: info.height, channels: info.channels }
  let smallest = null

  for (const width of IMAGE_WIDTHS) {
    for (const quality of IMAGE_QUALITIES) {
      const output = await sharp(data, { raw })
        .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
        .webp({ quality, effort: 5 })
        .toBuffer()

      if (!smallest || output.length < smallest.length) smallest = output
      if (output.length <= TARGET_IMAGE_BYTES) return output
    }
  }
  return smallest
}

export async function saveImageDataUrl(dataUrl, filenamePrefix = 'image') {
  const match = String(dataUrl || '').match(/^data:(image\/(?:png|jpeg|webp|gif|tiff|avif));base64,([A-Za-z0-9+/=]+)$/)
  if (!match) throw httpError(400, '仅支持 PNG、JPG、WebP、GIF、TIFF 或 AVIF 图片')

  const buffer = Buffer.from(match[2], 'base64')
  if (!buffer.length) throw httpError(400, '图片文件为空')
  return saveImage(buffer, filenamePrefix)
}

async function saveImage(input, filenamePrefix) {
  let optimized
  try {
    const metadata = await sharp(input).metadata()
    if (!['jpeg', 'png', 'webp', 'gif', 'tiff'].includes(metadata.format) &&
        !(metadata.format === 'heif' && metadata.compression === 'av1')) {
      throw httpError(400, '不支持该图片的实际编码')
    }
    optimized = await optimizeImage(input)
  } catch (error) {
    if (error?.status) throw error
    throw httpError(400, '图片文件无效或无法压缩')
  }

  const filename = `${filenamePrefix}-${Date.now()}-${crypto.randomBytes(5).toString('hex')}.webp`
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), optimized)
  return `/api/uploads/files/${filename}`
}

async function prepareImageStaging() {
  await fs.promises.mkdir(IMAGE_STAGING_DIR, { recursive: true, mode: 0o700 })
  // Remove abandoned uploads left by an interrupted process, without touching recent transfers.
  const staleBefore = Date.now() - 24 * 60 * 60 * 1000
  for (const entry of await fs.promises.readdir(IMAGE_STAGING_DIR)) {
    if (!/^[a-f0-9-]{36}\.part$/.test(entry)) continue
    const file = path.join(IMAGE_STAGING_DIR, entry)
    const stat = await fs.promises.stat(file).catch(() => null)
    if (stat && stat.mtimeMs < staleBefore) await fs.promises.rm(file, { force: true })
  }
}

async function ensureDiskSpace() {
  const disk = await fs.promises.statfs(IMAGE_STAGING_DIR)
  if (disk.bavail * disk.bsize < DISK_RESERVE) throw httpError(507, '服务器可用空间不足，请稍后重试')
}

export async function saveImageStream(req, filenamePrefix = 'image') {
  if (!req.is(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/tiff', 'image/avif'])) {
    throw httpError(400, '请选择支持的图片格式')
  }
  if (activeImageStreams >= 4) throw httpError(503, '当前图片上传较多，请稍后重试')
  activeImageStreams++
  const file = path.join(IMAGE_STAGING_DIR, crypto.randomUUID() + '.part')
  try {
    if (Date.now() >= nextStagingCleanup) {
      nextStagingCleanup = Date.now() + 60 * 60 * 1000
      stagingReady = prepareImageStaging().catch(error => { nextStagingCleanup = 0; throw error })
    }
    await stagingReady
    await ensureDiskSpace()
    const handle = await fs.promises.open(file, 'wx', 0o600)
    try {
      let sinceCheck = 0
      async function* chunks() {
        for await (const chunk of req.iterator({ destroyOnReturn: false })) {
          sinceCheck += chunk.length
          if (sinceCheck >= SPACE_CHECK_INTERVAL) {
            await ensureDiskSpace()
            sinceCheck = 0
          }
          yield chunk
        }
      }
      await handle.writeFile(chunks())
    } finally {
      await handle.close()
    }
    return await saveImage(file, filenamePrefix)
  } finally {
    activeImageStreams--
    await fs.promises.rm(file, { force: true })
  }
}

export async function saveBannerMediaDataUrl(dataUrl, mediaType = 'image') {
  if (mediaType !== 'video') return saveImageDataUrl(dataUrl, 'banner')

  return saveVideoDataUrl(dataUrl, 'banner')
}

export function saveVideoDataUrl(dataUrl, filenamePrefix = 'video') {
  const match = String(dataUrl || '').match(/^data:(video\/(?:mp4|webm));base64,([A-Za-z0-9+/=]+)$/)
  if (!match) throw httpError(400, '视频仅支持 MP4 或 WebM 格式')
  const buffer = Buffer.from(match[2], 'base64')
  if (!buffer.length || buffer.length > 15 * 1024 * 1024) throw httpError(400, '视频不能超过15MB')
  const extension = match[1] === 'video/webm' ? 'webm' : 'mp4'
  const filename = `${filenamePrefix}-${Date.now()}-${crypto.randomBytes(5).toString('hex')}.${extension}`
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer)
  return `/api/uploads/files/${filename}`
}

export function saveCourseVideoDataUrl(dataUrl, filenamePrefix = 'course-video', originalFilename = '') {
  const match = String(dataUrl || '').match(/^data:([^;,]*);base64,([A-Za-z0-9+/=]+)$/)
  const mediaType = String(match?.[1] || '').toLowerCase()
  const sourceExtension = path.extname(String(originalFilename || '')).slice(1).toLowerCase()
  const typeExtensions = {
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'video/x-m4v': 'm4v'
  }
  const extension = typeExtensions[mediaType] || sourceExtension
  if (!match || !['mp4', 'webm', 'mov', 'm4v'].includes(extension)) {
    throw httpError(400, '课程视频仅支持 MP4、WebM、MOV 或 M4V 格式')
  }
  const buffer = Buffer.from(match[2], 'base64')
  if (!buffer.length) throw httpError(400, '视频文件不能为空')
  if (buffer.length > 200 * 1024 * 1024) throw httpError(400, '课程视频不能超过200MB')
  const filename = `${filenamePrefix}-${Date.now()}-${crypto.randomBytes(5).toString('hex')}.${extension}`
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer)
  return `/api/uploads/files/${filename}`
}
