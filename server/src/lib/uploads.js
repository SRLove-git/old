import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { httpError } from './http.js'

export const UPLOAD_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads')

fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const MAX_IMAGE_INPUT_BYTES = 2 * 1024 * 1024
const TARGET_IMAGE_BYTES = 190_000
const IMAGE_WIDTHS = [1600, 1280, 1024, 800, 640]
const IMAGE_QUALITIES = [82, 74, 66, 58, 50]

async function optimizeImage(buffer) {
  let smallest = null

  for (const width of IMAGE_WIDTHS) {
    for (const quality of IMAGE_QUALITIES) {
      const output = await sharp(buffer)
        .rotate()
        .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
        .webp({ quality, effort: 5 })
        .toBuffer()

      if (!smallest || output.length < smallest.length) smallest = output
      if (output.length <= TARGET_IMAGE_BYTES) return output
    }
  }

  if (!smallest || smallest.length > TARGET_IMAGE_BYTES) {
    throw httpError(400, '图片内容过于复杂，压缩后仍超过200KB，请降低分辨率后重试')
  }
  return smallest
}

export async function saveImageDataUrl(dataUrl, filenamePrefix = 'image') {
  const match = String(dataUrl || '').match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/)
  if (!match) throw httpError(400, '仅支持 PNG、JPG 或 WebP 图片')

  const buffer = Buffer.from(match[2], 'base64')
  if (!buffer.length || buffer.length > MAX_IMAGE_INPUT_BYTES) throw httpError(400, '图片大小不能超过2MB')

  let optimized
  try {
    optimized = await optimizeImage(buffer)
  } catch (error) {
    if (error?.status) throw error
    throw httpError(400, '图片文件无效或无法压缩')
  }

  const filename = `${filenamePrefix}-${Date.now()}-${crypto.randomBytes(5).toString('hex')}.webp`
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), optimized)
  return `/api/uploads/files/${filename}`
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
