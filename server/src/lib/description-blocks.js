import { badRequest } from './domain-values.js'
import { normalizeContentBlocks } from './content-posts.js'

function normalizeBlocks(blocks) {
  if (!Array.isArray(blocks)) throw badRequest('图文介绍必须是区块列表')
  if (blocks.some(block => !block || !['text', 'image'].includes(block.type))) {
    throw badRequest('图文介绍仅支持文字和图片')
  }
  return normalizeContentBlocks(blocks)
}

const textOf = blocks => blocks.filter(block => block.type === 'text').map(block => block.text).join('\n\n')

// 旧编辑器只提交一段介绍，将它放在原第一段文字的位置，保留插图的相对顺序。
function replaceText(blocks, description) {
  const output = []
  let foundText = false
  for (const block of blocks) {
    if (block.type === 'text') {
      if (!foundText && description) output.push({ type: 'text', text: description })
      foundText = true
    } else output.push(block)
  }
  if (!foundText && description) output.unshift({ type: 'text', text: description })
  return normalizeBlocks(output)
}

export function descriptionFields(input = {}, current = {}) {
  const previous = normalizeBlocks(current.detailBlocks || [])
  const previousText = previous.length ? textOf(previous) : String(current.description || '').trim()
  const description = input.description === undefined ? previousText : String(input.description ?? '').trim()
  if (input.detailBlocks !== undefined) {
    const blocks = normalizeBlocks(input.detailBlocks)
    // 旧表单可能回传整条记录，只有 description 真正发生了修改。
    if (blocks.length && description !== previousText && JSON.stringify(blocks) === JSON.stringify(previous)) {
      return { detailBlocks: replaceText(blocks, description), description }
    }
    return { detailBlocks: blocks, description: textOf(blocks) }
  }
  const detailBlocks = description === previousText && previous.length ? previous : replaceText(previous, description)
  return { detailBlocks, description }
}
