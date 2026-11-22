import assert from 'node:assert/strict'
import test from 'node:test'
import { transferredImages, uploadImageType } from '@suiyueli/rich-editor/upload-image'

test('image file lists keep order without duplicating the clipboard items', () => {
  const photo = new File(['photo'], '旅行.JPEG')
  const screenshot = new File(['image'], '截图', { type: 'image/png' })
  const note = new File(['notes'], '备注.txt', { type: 'text/plain' })
  const files = [photo, note, screenshot]
  const items = files.map(file => ({ kind: 'file', getAsFile: () => file }))
  assert.deepEqual(transferredImages({ files, items }), [photo, screenshot])
  assert.deepEqual(transferredImages({ files: [], items: [...items, { kind: 'string' }] }), [photo, screenshot])
  assert.equal(uploadImageType(photo), 'image/jpeg')
  assert.equal(uploadImageType(screenshot), 'image/png')
  assert.throws(() => uploadImageType(note), /图片格式/)
})
