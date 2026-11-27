export const imageFormats = 'JPG、PNG、WebP、GIF、BMP、TIFF、AVIF、HEIC/HEIF'

const mimeByExtension = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', tif: 'image/tiff',
  tiff: 'image/tiff', avif: 'image/avif', heic: 'image/heic', heif: 'image/heif'
}
const mimeTypes = new Set(Object.values(mimeByExtension))
export const imageAccept = [...mimeTypes, ...Object.keys(mimeByExtension).map(ext => '.' + ext)].join(',')

// Finder and Explorer may supply an extension without a MIME type.
export function transferredImages(data) {
  const files = Array.from(data?.files || [])
  const candidates = files.length ? files : Array.from(data?.items || [])
    .filter(item => item.kind === 'file')
    .map(item => item.getAsFile())
  return candidates.filter(file => file && (file.type.startsWith('image/') ||
    Object.hasOwn(mimeByExtension, file.name.split('.').pop().toLowerCase())))
}

async function bitmapBlob(bitmap) {
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const output = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.82))
    if (!output) throw new Error('图片转换失败')
    return output
  } finally { bitmap.close() }
}

export function uploadImageType(file) {
  if (!file.size) throw new Error('图片文件为空，请重新选择')
  const extension = file.name.split('.').pop().toLowerCase()
  if (mimeTypes.has(file.type)) return file.type
  if (Object.hasOwn(mimeByExtension, extension)) return mimeByExtension[extension]
  throw new Error('可上传的图片格式为 ' + imageFormats)
}

export async function prepareUploadImage(file) {
  const mime = uploadImageType(file)
  const blob = file.type === mime ? file : file.slice(0, file.size, mime)
  if (!['image/bmp', 'image/avif', 'image/heic', 'image/heif'].includes(mime)) return blob

  try {
    let bitmap
    if (mime === 'image/bmp' || mime === 'image/avif') {
      bitmap = await createImageBitmap(blob)
    } else {
      const { heicTo } = await import('heic-to/csp')
      bitmap = await heicTo({ blob, type: 'bitmap' })
    }
    return await bitmapBlob(bitmap)
  } catch {
    if (mime === 'image/avif') return blob
    throw new Error('无法读取这张图片，请重新导出后上传')
  }
}
