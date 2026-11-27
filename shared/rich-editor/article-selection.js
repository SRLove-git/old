import { TextSelection } from '@tiptap/pm/state'
import { canSplit } from '@tiptap/pm/transform'

function splitWrappers(tr, pos, atEnd) {
  let edge = tr.doc.resolve(pos)
  // pos is already at a paragraph boundary. Only list/quote containers can need splitting.
  while (edge.depth > 0) {
    if (atEnd && edge.parentOffset === edge.parent.content.size) edge = tr.doc.resolve(edge.after())
    else if (edge.parentOffset === 0) edge = tr.doc.resolve(edge.before())
    else if (edge.parentOffset === edge.parent.content.size) edge = tr.doc.resolve(edge.after())
    else break
  }
  const depth = edge.depth
  if (depth <= 0) return true
  const after = []
  for (let d = 1; d <= edge.depth; d++) {
    const node = edge.node(d)
    after.push(
      node.type.name === 'orderedList'
        ? { type: node.type, attrs: { ...node.attrs, start: node.attrs.start + edge.index(d) } }
        : null
    )
  }
  if (!canSplit(tr.doc, edge.pos, depth, after)) return false
  tr.split(edge.pos, depth, after)
  return true
}

export function prepareParagraphSelection(tr, separateWrappers = false) {
  const selection = tr.selection
  if (!(selection instanceof TextSelection)) return true
  let first, last
  tr.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
    if (!node.isTextblock) return
    const start = pos + 1
    const end = start + node.content.size
    if (selection.empty || (start < selection.to && end > selection.from)) {
      first ??= start
      last = end
    }
    return false
  })
  if (first == null) return false
  const mapStart = tr.mapping.maps.length
  if (separateWrappers && (!splitWrappers(tr, last, true) || !splitWrappers(tr, first, false))) return false
  const mapped = tr.mapping.slice(mapStart)
  const start = mapped.map(Math.max(first, selection.from), 1)
  const end = mapped.map(Math.min(last, selection.to), -1)
  const nextSelection =
    selection.anchor <= selection.head
      ? TextSelection.create(tr.doc, start, end)
      : TextSelection.create(tr.doc, end, start)
  if (!nextSelection.eq(tr.selection)) tr.setSelection(nextSelection)
  return true
}

// Media cards are top-level atoms. Wrap the selected paragraphs on each side
// independently so lists and quotes can span an image without moving it.
export function formatAroundArticleMedia(tr, apply) {
  const { from, to, anchor, head } = tr.selection
  const ranges = []
  let range
  tr.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === 'articleMedia') range = null
    if (!node.isTextblock) return
    const end = Math.min(to, pos + 1 + node.content.size)
    if (range) range.to = end
    else {
      range = { from: Math.max(from, pos + 1), to: end }
      ranges.push(range)
    }
    return false
  })
  if (ranges.length < 2) return apply()
  const mapStart = tr.mapping.maps.length
  let right, rightMapStart
  for (const part of ranges.reverse()) {
    const mapping = tr.mapping.slice(mapStart)
    tr.setSelection(TextSelection.create(tr.doc, mapping.map(part.from, 1), mapping.map(part.to, -1)))
    if (!apply()) return false
    if (right == null) {
      right = tr.selection.to
      rightMapStart = tr.mapping.maps.length
    }
  }
  const left = tr.selection.from
  right = tr.mapping.slice(rightMapStart).map(right, -1)
  tr.setSelection(TextSelection.create(tr.doc, anchor <= head ? left : right, anchor <= head ? right : left))
  return true
}
