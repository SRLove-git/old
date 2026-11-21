const blockKeys = new WeakMap()
let nextKey = 0

export function editorBlockKey(block) {
  if (!blockKeys.has(block)) blockKeys.set(block, ++nextKey)
  return blockKeys.get(block)
}

export function incompleteImage(block) {
  return block.type === 'image' && !String(block.src || '').trim() && !block.emoji && !block.tone
}

export function hasDetailContent(block) {
  if (block.type === 'text') return Boolean(String(block.text || '').trim())
  return Boolean(String(block.src || block.url || block.emoji || block.tone || '').trim())
}

export function insertImageBlock(blocks, paragraph, offset) {
  const index = blocks.indexOf(paragraph)
  if (index === -1 || paragraph.type !== 'text') return null
  const text = paragraph.text || ''
  const at = Math.max(0, Math.min(offset, text.length))
  const image = { type: 'image', src: '', caption: '' }
  if (at === 0) {
    blocks.splice(index, 0, image)
    return blocks[index]
  }
  paragraph.text = text.slice(0, at)
  blocks.splice(index + 1, 0, image, { type: 'text', text: text.slice(at) })
  return blocks[index + 1]
}
