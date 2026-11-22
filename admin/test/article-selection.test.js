import assert from 'node:assert/strict'
import test from 'node:test'
import { Schema } from '@tiptap/pm/model'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import { formatAroundArticleMedia, prepareParagraphSelection } from '@suiyueli/rich-editor/selection'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*' },
    orderedList: { group: 'block', content: 'item+', attrs: { start: { default: 1 } } },
    item: { content: 'paragraph+' },
    articleMedia: { group: 'block', atom: true },
    text: {}
  }
})
const paragraph = (text) => schema.node('paragraph', null, schema.text(text))

function transaction(doc, anchor, head) {
  return EditorState.create({ doc, selection: TextSelection.create(doc, anchor, head) }).tr
}

test('跨段反向选区保留原段落、选中文字和方向', () => {
  const doc = schema.node('doc', null, [paragraph('甲乙丙'), paragraph('丁戊己')])
  const tr = transaction(doc, 8, 2)
  assert.equal(prepareParagraphSelection(tr, true), true)
  assert.equal(tr.doc, doc)
  assert.ok(tr.selection.anchor > tr.selection.head)
  assert.equal(tr.doc.textBetween(tr.selection.from, tr.selection.to), '乙丙丁戊')
})

test('选至下一段开头时只作用于前一段，完整段落不会额外换行', () => {
  const doc = schema.node('doc', null, [paragraph('甲乙'), paragraph('丙丁')])
  const tr = transaction(doc, 1, 5)
  assert.equal(prepareParagraphSelection(tr, true), true)
  assert.equal(tr.doc, doc)
  assert.deepEqual([tr.selection.from, tr.selection.to], [1, 3])
})

test('在段中选几个字或只放光标时，设置标题仍使用原有段落', () => {
  const doc = schema.node('doc', null, [paragraph('今天上午十点出发')])
  for (const head of [3, 5]) {
    const tr = transaction(doc, 3, head)
    assert.ok(prepareParagraphSelection(tr, true))
    assert.equal(tr.doc, doc)
    assert.deepEqual([tr.selection.anchor, tr.selection.head], [3, head])
  }
})

test('转换列表中间一项时保留选区两侧的原编号', () => {
  const items = ['甲', '乙', '丙'].map((text) => schema.node('item', null, paragraph(text)))
  const doc = schema.node('doc', null, schema.node('orderedList', { start: 4 }, items))
  const tr = transaction(doc, 8, 9)
  assert.equal(prepareParagraphSelection(tr, true), true)
  assert.deepEqual(
    tr.doc.content.content.map((n) => [n.textContent, n.attrs.start]),
    [
      ['甲', 4],
      ['乙', 5],
      ['丙', 6]
    ]
  )
  assert.equal(tr.doc.textBetween(tr.selection.from, tr.selection.to), '乙')
})

test('跨图片的排版命令分别处理两侧文字，完成后恢复反向选区', () => {
  const doc = schema.node('doc', null, [paragraph('甲乙'), schema.node('articleMedia'), paragraph('丙丁')])
  const tr = transaction(doc, 7, 2)
  const parts = []
  assert.ok(prepareParagraphSelection(tr, true))
  assert.ok(
    formatAroundArticleMedia(tr, () => {
      parts.push(tr.doc.textBetween(tr.selection.from, tr.selection.to))
      return true
    })
  )
  assert.deepEqual(parts, ['丙', '乙'])
  assert.equal(tr.doc.textBetween(tr.selection.from, tr.selection.to), '乙丙')
  assert.ok(tr.selection.anchor > tr.selection.head)
})
