import { badRequest } from './domain-values.js'
import { normalizeContentBlocks } from './content-posts.js'

function normalizeBlocks(blocks, catalog) {
  if (!Array.isArray(blocks)) throw badRequest('图文介绍必须是区块列表')
  if (blocks.length > 100) throw badRequest('正文内容不能超过100个区块')
  const allowed = catalog ? ['text', 'image', 'video'] : ['text', 'image']
  return blocks.flatMap(block => {
    if (!allowed.includes(block?.type)) throw badRequest(catalog ? '详情仅支持文字、图片和视频' : '图文介绍仅支持文字和图片')
    // 旧活动的示意图和视频占位也可能只有说明和图标。
    if (catalog && ['image', 'video'].includes(block.type) && !block.src && !block.url && (block.emoji || block.tone)) {
      return [{ type: block.type, [block.type === 'image' ? 'src' : 'url']: '', emoji: String(block.emoji || ''), tone: String(block.tone || ''), caption: String(block.caption || '') }]
    }
    return normalizeContentBlocks([block], '', true)
  })
}

const textOf = blocks => blocks.filter(block => block.type === 'text').map(block => block.text).join('\n\n')

// 旧编辑器只提交一段介绍，将它放在原第一段文字的位置，保留插图的相对顺序。
function replaceText(blocks, description, catalog) {
  const output = []
  let foundText = false
  for (const block of blocks) {
    if (block.type === 'text') {
      if (!foundText && description) output.push({ type: 'text', text: description })
      foundText = true
    } else output.push(block)
  }
  if (!foundText && description) output.unshift({ type: 'text', text: description })
  return normalizeBlocks(output, catalog)
}

export function descriptionFields(input = {}, current = {}, field = 'description') {
  const catalog = field === 'detail'
  const previous = normalizeBlocks(current.detailBlocks || [], catalog)
  const previousText = previous.length ? textOf(previous) : String(current[field] || '').trim()
  const description = input[field] === undefined ? previousText : String(input[field] ?? '').trim()
  if (input.detailBlocks !== undefined) {
    const blocks = normalizeBlocks(input.detailBlocks, catalog)
    // 旧表单可能回传整条记录，只有 description 真正发生了修改。
    if (blocks.length && description !== previousText && JSON.stringify(blocks) === JSON.stringify(previous)) {
      return { detailBlocks: replaceText(blocks, description, catalog), [field]: description }
    }
    return { detailBlocks: blocks, [field]: textOf(blocks) }
  }
  const detailBlocks = description === previousText && previous.length ? previous : replaceText(previous, description, catalog)
  return { detailBlocks, [field]: description }
}
