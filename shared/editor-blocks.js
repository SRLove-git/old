export function incompleteImage(block) {
  return block.type === 'image' && !String(block.src || '').trim() && !block.emoji && !block.tone
}

export function hasDetailContent(block) {
  if (block.type === 'text') return Boolean(String(block.text || '').trim() || block.html?.includes('<hr'))
  return Boolean(String(block.src || block.url || block.emoji || block.tone || '').trim())
}
