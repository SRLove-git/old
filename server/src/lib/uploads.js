import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { httpError } from './http.js'

export const UPLOAD_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads')

fs.mkdirSync(UPLOAD_DIR, { recursive: true })

export function saveImageDataUrl(dataUrl, filenamePrefix = 'image') {
  const match = String(dataUrl || '').match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/)
  if (!match) throw httpError(400, '仅支持 PNG、JPG 或 WebP 图片')

  const buffer = Buffer.from(match[2], 'base64')
  if (!buffer.length || buffer.length > 2 * 1024 * 1024) throw httpError(400, '图片大小不能超过2MB')

  const extension = match[1] === 'image/png' ? 'png' : (match[1] === 'image/webp' ? 'webp' : 'jpg')
  const filename = `${filenamePrefix}-${Date.now()}-${crypto.randomBytes(5).toString('hex')}.${extension}`
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer)
  return `/api/uploads/files/${filename}`
}

export function saveBannerMediaDataUrl(dataUrl, mediaType = 'image') {
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
