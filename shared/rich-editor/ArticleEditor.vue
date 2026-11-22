<script setup>
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { Editor, Extension } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'
import StarterKit from '@tiptap/starter-kit'
import { TextStyleKit } from '@tiptap/extension-text-style'
import TextAlign from '@tiptap/extension-text-align'
import BubbleMenu from '@tiptap/extension-bubble-menu'
import { Message } from '@arco-design/web-vue'
import { IconAlignCenter, IconUnorderedList } from '@arco-design/web-vue/es/icon'
import ArticleFontTools from './ArticleFontTools.vue'
import { formatAroundArticleMedia, prepareParagraphSelection } from './article-selection.js'
import {
  ArticleDocument,
  articleMedia,
  articleBlocks,
  editorContent,
  preparePastedHtml
} from './article-document.js'

const props = defineProps({
  modelValue: { type: Array, required: true },
  uploadImage: { type: Function, required: true },
  previewUrl: { type: Function, required: true },
  allowVideo: { type: Boolean, default: true },
  allowCards: { type: Boolean, default: true },
  uploadVideo: Function,
  imageAccept: { type: String, default: 'image/png,image/jpeg,image/webp' },
  title: String,
  source: String,
  publishedAt: String,
  summary: String,
  cover: String
})
const emit = defineEmits(['update:modelValue', 'uploading'])
const surface = ref(null)
const quickTools = ref(null)
const colors = ref({ ink: '#333333', highlight: '#fff093' })
const editor = shallowRef(null)
const selected = ref({})
const panel = ref(null)
let panelBookmark
let panelNode
let panelEdited = false
const picker = ref(null)
const videoPicker = ref(null)
const busy = ref(false)
const preview = ref(false)
let selectionForFile
let selectionForControl
let imageToReplace
let disposed = false

const paragraphLayout = Extension.create({
  name: 'paragraphSpacing',
  addGlobalAttributes() {
    const attrs = {}
    for (const [key, css, pattern] of [
      ['lineHeight', 'line-height', /^(?:[12](?:\.\d+)?|3)$/],
      ['textIndent', 'text-indent', /^(?:1|2|3|4)em$/],
      ['paragraphGap', 'margin-bottom', /^(?:0|4|8|12|16|24|32)px$/]
    ]) {
      attrs[key] = {
        default: null,
        parseHTML: (el) => {
          // The display defaults use the margin shorthand. Only import an explicit override.
          if (key === 'paragraphGap' && !/(?:^|;)\s*margin-bottom\s*:/i.test(el.getAttribute('style') || ''))
            return null
          const value = el.style.getPropertyValue(css)
          return pattern.test(value) ? value : null
        },
        renderHTML: (a) => (a[key] ? { style: css + ':' + a[key] } : {})
      }
    }
    return [{ types: ['paragraph', 'heading'], attributes: attrs }]
  }
})

function refreshState(e) {
  const heading = e.isActive('heading')
  const { doc, selection } = e.state
  selected.value = {
    count:
      selection.empty || selection.node
        ? 0
        : Array.from(doc.textBetween(selection.from, selection.to, '')).length,
    ...Object.fromEntries(
      ['bold', 'italic', 'underline', 'strike', 'bulletList', 'orderedList', 'blockquote', 'link'].map(
        (k) => [k, e.isActive(k)]
      )
    ),
    level: heading ? e.getAttributes('heading').level : 0,
    align: e.getAttributes(heading ? 'heading' : 'paragraph').textAlign || 'left',
    height: e.getAttributes(heading ? 'heading' : 'paragraph').lineHeight || '',
    indent: e.getAttributes(heading ? 'heading' : 'paragraph').textIndent || '',
    gap: e.getAttributes(heading ? 'heading' : 'paragraph').paragraphGap || '',
    size: e.getAttributes('textStyle').fontSize || '',
    family: e.getAttributes('textStyle').fontFamily || '',
    media: e.state.selection.node?.type.name === 'articleMedia' ? e.state.selection.node.attrs.kind : '',
    undo: e.can().undo(),
    redo: e.can().redo()
  }
}

function rememberSelection(event) {
  selectionForControl = event.target.matches('select,input[type=color]')
    ? editor.value.state.selection.getBookmark()
    : null
}

function toolChain() {
  const e = editor.value
  const chain = e.chain()
  if (selectionForControl) {
    const bookmark = selectionForControl
    selectionForControl = null
    chain.command(({ tr }) => {
      const selection = bookmark.resolve(tr.doc)
      if (!selection.eq(tr.selection)) tr.setSelection(selection)
      return true
    })
  }
  return chain.focus()
}

function run(command, ...args) {
  if (command === 'setColor') colors.value.ink = args[0]
  if (command === 'setBackgroundColor') colors.value.highlight = args[0]
  const chain = toolChain()
  chain[command](...args).run()
}

function runBlock(command, ...args) {
  const separateWrappers = [
    'setHeading',
    'setParagraph',
    'toggleBulletList',
    'toggleOrderedList',
    'toggleBlockquote'
  ].includes(command)
  const ok = toolChain()
    .command(({ tr, chain }) => {
      closeHistory(tr)
      if (!tr.selection.node && prepareParagraphSelection(tr, separateWrappers)) {
        const apply = () => {
          const commands = chain()
          return commands[command](...args).run()
        }
        if (separateWrappers ? formatAroundArticleMedia(tr, apply) : apply()) return true
      }
      tr.setMeta('preventDispatch', true)
      return false
    })
    .run()
  if (!ok) Message.info('请选中需要排版的文字')
  return ok
}

function setParagraphStyle(key, value) {
  runBlock('command', ({ commands }) => {
    const attrs = { [key]: value || null }
    const updatedHeading = commands.updateAttributes('heading', attrs)
    const updatedParagraph = commands.updateAttributes('paragraph', attrs)
    return updatedHeading || updatedParagraph
  })
}

function clearFormatting() {
  const chain = toolChain().unsetAllMarks()
  if (editor.value.state.selection.empty) chain.clearNodes()
  chain.run()
}

function validHttpsUrl(value) {
  if (!/^https:\/\//i.test(value)) return false
  try {
    const url = new URL(value)
    return Boolean(url.hostname && !url.username && !url.password)
  } catch {
    return false
  }
}

function editMedia(kind, existing = false) {
  if (!finishPanel()) return
  const e = editor.value
  const attrs = existing ? e.state.selection.node?.attrs : {}
  if (!attrs) return
  e.commands.setMeta('articleQuickTools', 'hide')
  panelBookmark = e.state.selection.getBookmark()
  panelNode = existing ? e.state.selection.node : null
  panelEdited = false
  panel.value = {
    align: '',
    ...attrs,
    kind,
    existing,
    url: kind === 'inlineLink' ? e.getAttributes('link').href || '' : attrs.url || ''
  }
}
function savePanel() {
  const e = editor.value
  const form = panel.value
  const selection = panelBookmark.resolve(e.state.doc)
  const url = String(form.url || '').trim()
  if (form.kind === 'inlineLink') {
    if (url && !validHttpsUrl(url)) return Message.error('请输入完整的 HTTPS 网址')
    e.view.dispatch(e.state.tr.setSelection(selection))
    const chain = e.chain().focus()
    if (selection.empty) chain.extendMarkRange('link')
    if (!url) chain.unsetLink().run()
    else if (e.state.selection.empty && !e.isActive('link')) {
      chain.insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url } }] }).run()
    } else chain.setLink({ href: url }).run()
  } else {
    if (
      form.kind === 'link' &&
      (!String(form.title || '').trim() || !(validHttpsUrl(url) || url.startsWith('/pages/')))
    )
      return Message.error('请填写链接标题和有效地址')
    if (form.kind === 'video' && !/^(https:\/\/|\/api\/uploads\/files\/|\/assets\/)/.test(url))
      return Message.error('请填写有效的视频地址')
    if (form.kind === 'image' && !/^(https:\/\/|\/api\/uploads\/files\/|\/assets\/)/.test(form.src || ''))
      return Message.error('请上传图片或填写有效图片地址')
    if (
      form.kind === 'image' &&
      form.width != null &&
      form.width !== '' &&
      !(Number.isInteger(Number(form.width)) && Number(form.width) >= 1 && Number(form.width) <= 100)
    )
      return Message.error('图片宽度应为 1 到 100 之间的整数')
    const attrs = {
      kind: form.kind,
      url,
      src: form.src || '',
      caption: form.caption || '',
      title: form.title || '',
      description: form.description || '',
      width: form.width || '',
      align: form.align || ''
    }
    if (form.existing) {
      if (selection.node !== panelNode) return Message.warning('内容位置已变动，请重新选择')
      e.chain().focus().setNodeSelection(selection.from).updateAttributes('articleMedia', attrs).run()
    } else insertContent(e, selection, { type: 'articleMedia', attrs }, true)
  }
  panel.value = null
}

function finishPanel() {
  if (panel.value && panelEdited) savePanel()
  else panel.value = null
  return !panel.value
}
defineExpose({ finishPanel })

function applyOnEnter(event) {
  if (event.target.tagName !== 'INPUT' || event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  savePanel()
}

function insertContent(e, selection, content, afterMedia) {
  const range =
    afterMedia && selection.node?.type.name === 'articleMedia'
      ? selection.to
      : { from: selection.from, to: selection.to }
  e.chain().focus().insertContentAt(range, content).run()
}

function chooseFile(replace = false) {
  if (!finishPanel()) return
  selectionForFile = editor.value.state.selection.getBookmark()
  imageToReplace = replace ? editor.value.state.selection.node?.attrs : null
  picker.value.multiple = !replace
  picker.value.click()
}

async function withUpload(bookmark, insert, afterMedia = false) {
  const e = editor.value
  if (busy.value || preview.value) return
  busy.value = true
  emit('uploading', true)
  e.setEditable(false, false)
  try {
    const content = await insert()
    if (disposed) return
    insertContent(e, bookmark.resolve(e.state.doc), content, afterMedia)
  } catch (error) {
    if (!disposed) Message.error(error.message || '素材上传失败，请重试')
  } finally {
    if (!disposed) {
      busy.value = false
      e.setEditable(true, false)
      emit('uploading', false)
    }
  }
}

function insertFiles(files, selection, existingImage, afterMedia = false) {
  return withUpload(
    selection,
    async () => {
      const images = []
      for (const file of files) {
        images.push({
          type: 'articleMedia',
          attrs: { ...existingImage, kind: 'image', src: await props.uploadImage(file) }
        })
      }
      return images
    },
    afterMedia
  )
}

function chooseVideo() {
  if (!finishPanel()) return
  selectionForFile = editor.value.state.selection.getBookmark()
  videoPicker.value.click()
}

function pickVideo(event) {
  const [file] = event.target.files
  event.target.value = ''
  if (file) void withUpload(selectionForFile, async () => ({
    type: 'articleMedia', attrs: { kind: 'video', url: await props.uploadVideo(file) }
  }), true)
}

function picked(event) {
  const files = Array.from(event.target.files || [])
  event.target.value = ''
  if (files.length) void insertFiles(files, selectionForFile, imageToReplace, !imageToReplace)
}

function paste(view, event) {
  const data = event.clipboardData
  if (!data) return false
  const files = Array.from(data.files).filter((file) => file.type.startsWith('image/'))
  const html = data.getData('text/html')
  const selection = view.state.selection.getBookmark()
  if (files.length && !data.getData('text/plain').trim() && !html.replace(/<[^>]*>/g, '').trim()) {
    void insertFiles(files, selection)
    return true
  }
  if (!html) return false
  // 浏览器复制的行内图片有时是 data URL，须在插入文档前转换成后台素材。
  const template = document.createElement('template')
  template.innerHTML = html
  const embedded = [...template.content.querySelectorAll('img')].filter((img) =>
    /^data:image\//i.test(img.getAttribute('src') || '')
  )
  if (!embedded.length) {
    // 整段粘贴时保留来源段落的对齐、行距等属性；行内粘贴仍由编辑器按光标合并。
    if (
      template.content.querySelector('p,div,section,h1,h2,h3,ul,ol,blockquote,figure') &&
      view.state.selection.$from.parent.content.size === 0
    ) {
      editor.value.commands.insertContent(preparePastedHtml(html))
      return true
    }
    return false
  }
  void withUpload(selection, async () => {
    for (const img of embedded) {
      const blob = await (await fetch(img.getAttribute('src'))).blob()
      img.removeAttribute('data-src')
      img.setAttribute(
        'src',
        await props.uploadImage(new File([blob], 'clipboard-image', { type: blob.type }))
      )
    }
    return preparePastedHtml(template.innerHTML)
  })
  return true
}

function togglePreview() {
  if (!finishPanel()) return
  editor.value.commands.setMeta('articleQuickTools', 'hide')
  preview.value = !preview.value
  editor.value.setEditable(!preview.value, false)
}

function moveMedia(direction) {
  const e = editor.value
  const { node, from, $from } = e.state.selection
  if (!node || $from.depth !== 0) return
  const index = $from.index()
  const other = e.state.doc.maybeChild(index + direction)
  if (!other) return
  const at = direction < 0 ? from - other.nodeSize : from + other.nodeSize
  const tr = e.state.tr.delete(from, from + node.nodeSize).insert(at, node)
  e.view.dispatch(tr)
  e.chain().focus().setNodeSelection(at).run()
}

onMounted(() => {
  const scroller = surface.value.closest('.arco-modal-body')
  editor.value = new Editor({
    element: surface.value,
    parseOptions: { preserveWhitespace: true },
    content: editorContent(props.modelValue),
    extensions: [
      ArticleDocument,
      articleMedia(props.previewUrl, props.allowVideo, props.allowCards),
      paragraphLayout,
      StarterKit.configure({
        document: false,
        code: false,
        codeBlock: false,
        trailingNode: { node: 'paragraph', notAfter: ['heading', 'blockquote', 'bulletList', 'orderedList'] },
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: false,
          defaultProtocol: 'https',
          isAllowedUri: validHttpsUrl
        }
      }),
      TextStyleKit.configure({ lineHeight: false }),
      BubbleMenu.configure({
        pluginKey: 'articleQuickTools',
        element: quickTools.value,
        updateDelay: 100,
        appendTo: surface.value.closest('.arco-modal') || surface.value.parentElement,
        shouldShow: ({ editor: e, view, state, from, to }) =>
          e.isEditable &&
          !panel.value &&
          !preview.value &&
          !busy.value &&
          from < to &&
          !state.selection.node &&
          Boolean(state.doc.textBetween(from, to)) &&
          (view.hasFocus() || quickTools.value?.contains(document.activeElement)),
        options: {
          placement: 'top',
          offset: 8,
          flip: { padding: 6 },
          shift: { padding: 6 },
          hide: { boundary: scroller || 'clippingAncestors' },
          scrollTarget: scroller || window
        }
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] })
    ],
    editorProps: {
      handleKeyDown(view, event) {
        const shortcut = /Mac|iPhone|iPad/.test(navigator.platform)
          ? event.metaKey && !event.ctrlKey
          : event.ctrlKey && !event.metaKey
        if (!event.isComposing && shortcut && !event.altKey && !event.shiftKey) {
          const align = { l: 'left', e: 'center', r: 'right', j: 'justify' }[event.key.toLowerCase()]
          if (align) return runBlock('setTextAlign', align)
        }
        if (event.key !== 'Escape' || quickTools.value.style.visibility !== 'visible') return false
        event.stopPropagation()
        view.dispatch(view.state.tr.setMeta('articleQuickTools', 'hide'))
        return true
      },
      attributes: { 'aria-label': '文章正文', role: 'textbox', 'aria-multiline': 'true' },
      transformPastedHTML: preparePastedHtml,
      handlePaste: paste,
      handleDrop(view, event, slice, moved) {
        const files = Array.from(event.dataTransfer?.files || []).filter((file) =>
          file.type.startsWith('image/')
        )
        if (moved || !files.length) return false
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY })
        if (at) editor.value.commands.setTextSelection(at.pos)
        void insertFiles(files, view.state.selection.getBookmark())
        return true
      }
    },
    onUpdate: ({ editor: e }) => emit('update:modelValue', articleBlocks(e)),
    onTransaction: ({ editor: e, transaction }) => {
      if (panel.value && transaction.docChanged) panelBookmark = panelBookmark.map(transaction.mapping)
      if (selectionForControl && transaction.docChanged)
        selectionForControl = selectionForControl.map(transaction.mapping)
      refreshState(e)
    }
  })
  refreshState(editor.value)
})
onBeforeUnmount(() => {
  disposed = true
  editor.value?.destroy()
})
</script>

<template>
  <div class="article-composer">
    <div class="composer-head">
      <span
        >正文
        <small v-if="!preview && selected.count" class="selection-count"
          >已选 {{ selected.count }} 字</small
        ></span
      >
      <div class="editor-actions">
        <template v-if="!preview">
          <button type="button" :disabled="busy || !selected.undo" @mousedown.prevent @click="run('undo')">
            撤销
          </button>
          <button type="button" :disabled="busy || !selected.redo" @mousedown.prevent @click="run('redo')">
            重做
          </button>
        </template>
        <button type="button" :disabled="busy" @click="togglePreview">
          {{ preview ? '返回编辑' : '手机排版预览' }}
        </button>
      </div>
    </div>
    <fieldset
      v-if="!preview"
      class="composer-tools"
      :disabled="busy"
      aria-label="正文排版"
      @pointerdown.capture="rememberSelection"
      @focusin="rememberSelection"
    >
      <div class="ribbon-group">
        <span class="group-label">字体</span>
        <ArticleFontTools :selected="selected" :colors="colors" @command="run" @clear="clearFormatting" />
      </div>
      <div class="ribbon-group">
        <span class="group-label">段落</span>
        <div class="ribbon-controls">
          <label
            >样式<select
              aria-label="段落样式"
              :value="selected.level"
              @change="
                Number($event.target.value)
                  ? runBlock('setHeading', { level: Number($event.target.value) })
                  : runBlock('setParagraph')
              "
            >
              <option value="0">正文</option>
              <option v-for="n in 3" :key="n" :value="n">{{ n }} 级标题</option>
            </select></label
          >
          <label
            >对齐<select
              aria-label="对齐"
              :value="selected.align"
              @change="runBlock('setTextAlign', $event.target.value)"
            >
              <option value="left">居左</option>
              <option value="center">居中</option>
              <option value="right">居右</option>
              <option value="justify">两端</option>
            </select></label
          >
          <label
            >行距<select
              aria-label="行距"
              :value="selected.height"
              @change="setParagraphStyle('lineHeight', $event.target.value)"
            >
              <option value="">默认</option>
              <option v-for="n in ['1', '1.5', '1.8', '2', '2.5', '3']" :key="n">{{ n }}</option>
            </select></label
          >
          <label
            >首行缩进<select
              aria-label="首行缩进"
              :value="selected.indent"
              @change="setParagraphStyle('textIndent', $event.target.value)"
            >
              <option value="">无</option>
              <option v-for="n in [1, 2, 3, 4]" :key="n" :value="n + 'em'">{{ n }} 字</option>
            </select></label
          >
          <label
            >段后距<select
              aria-label="段后距"
              :value="selected.gap"
              @change="setParagraphStyle('paragraphGap', $event.target.value)"
            >
              <option value="">默认</option>
              <option v-for="n in [0, 4, 8, 12, 16, 24, 32]" :key="n" :value="n + 'px'">{{ n }} px</option>
            </select></label
          >
          <button
            type="button"
            :aria-pressed="selected.bulletList"
            @mousedown.prevent
            @click="runBlock('toggleBulletList')"
          >
            无序列表
          </button>
          <button
            type="button"
            :aria-pressed="selected.orderedList"
            @mousedown.prevent
            @click="runBlock('toggleOrderedList')"
          >
            有序列表
          </button>
          <button
            type="button"
            :aria-pressed="selected.blockquote"
            @mousedown.prevent
            @click="runBlock('toggleBlockquote')"
          >
            引用
          </button>
        </div>
      </div>
      <div class="ribbon-group">
        <span class="group-label">插入</span>
        <div class="ribbon-controls">
          <button type="button" @mousedown.prevent @click="run('setHorizontalRule')">分隔线</button>
          <button type="button" @mousedown.prevent @click="chooseFile()">插入图片</button>
          <button type="button" @mousedown.prevent @click="editMedia('image')">图片地址</button>
          <button type="button" @mousedown.prevent @click="editMedia('inlineLink')">文字链接</button>
          <button v-if="allowCards" type="button" @mousedown.prevent @click="editMedia('link')">链接卡片</button>
          <button v-if="allowVideo" type="button" @mousedown.prevent @click="editMedia('video')">视频链接</button>
          <button v-if="uploadVideo" type="button" @mousedown.prevent @click="chooseVideo">上传视频</button>
        </div>
      </div>
    </fieldset>
    <div
      ref="quickTools"
      role="toolbar"
      aria-label="选中文字快捷工具栏"
      class="quick-tools"
      @pointerdown.capture="rememberSelection"
      @focusin="rememberSelection"
      @keydown.esc.stop.prevent="editor.chain().focus().setMeta('articleQuickTools', 'hide').run()"
    >
      <ArticleFontTools :selected="selected" :colors="colors" @command="run" @clear="clearFormatting" />
      <div class="quick-paragraph">
        <button
          type="button"
          aria-label="段落居中"
          title="段落居中"
          :aria-pressed="selected.align === 'center'"
          @mousedown.prevent
          @click="runBlock('setTextAlign', selected.align === 'center' ? 'left' : 'center')"
        >
          <IconAlignCenter />
        </button>
        <button
          type="button"
          aria-label="项目符号"
          title="项目符号"
          :aria-pressed="selected.bulletList"
          @mousedown.prevent
          @click="runBlock('toggleBulletList')"
        >
          <IconUnorderedList />
        </button>
      </div>
    </div>
    <input
      ref="picker"
      hidden
      type="file"
      :accept="imageAccept"
      multiple
      @change="picked"
    />
    <input v-if="uploadVideo" ref="videoPicker" hidden type="file" accept="video/mp4,video/webm" @change="pickVideo" />
    <div v-if="!preview && !busy && selected.media && !panel" class="media-tools">
      <button type="button" @mousedown.prevent @click="editMedia(selected.media, true)">
        编辑{{ { image: '图片', video: '视频', link: '链接卡片' }[selected.media] }}
      </button>
      <button v-if="selected.media === 'image'" type="button" @mousedown.prevent @click="chooseFile(true)">
        替换图片
      </button>
      <button type="button" @mousedown.prevent @click="moveMedia(-1)">上移</button
      ><button type="button" @mousedown.prevent @click="moveMedia(1)">下移</button>
      <button type="button" @mousedown.prevent @click="run('deleteSelection')">删除</button>
    </div>
    <div
      v-if="panel && !preview && !busy"
      class="composer-panel"
      @input="panelEdited = true"
      @change="panelEdited = true"
      @keydown.enter="applyOnEnter"
    >
      <label v-if="panel.kind === 'link'">标题<input v-model="panel.title" /></label>
      <label v-if="panel.kind === 'image'">图片地址<input v-model="panel.src" /></label>
      <label v-else>链接地址<input v-model="panel.url" placeholder="https://" /></label>
      <template v-if="panel.kind === 'image'">
        <label
          >图片宽度（%）<input v-model="panel.width" type="number" min="1" max="100" placeholder="自动"
        /></label>
        <label
          >图片对齐<select v-model="panel.align" aria-label="图片对齐">
            <option value="">默认居中</option>
            <option value="left">居左</option>
            <option value="center">居中</option>
            <option value="right">居右</option>
          </select></label
        >
      </template>
      <label v-if="['image', 'video'].includes(panel.kind)">说明<input v-model="panel.caption" /></label>
      <label v-if="panel.kind === 'link'">说明<input v-model="panel.description" /></label>
      <button type="button" @click="savePanel">应用</button
      ><button type="button" @click="panel = null">取消</button>
    </div>
    <div v-if="busy" role="status" class="media-tools">正在上传正文素材…</div>
    <div :class="['article-sheet', { 'phone-sheet': preview }]">
      <template v-if="preview"
        ><h2>{{ title || '正文预览' }}</h2>
        <p class="byline">{{ [source, publishedAt].filter(Boolean).join(' · ') }}</p>
        <img v-if="cover" :src="previewUrl(cover)" class="preview-cover" alt="文章封面" />
        <p v-if="summary">{{ summary }}</p></template
      >
      <div ref="surface"></div>
    </div>
  </div>
</template>

<style scoped>
.article-composer {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--color-border-2);
  border-radius: 8px;
  background: var(--color-fill-1);
  overflow: hidden;
}
.composer-head,
.composer-tools,
.media-tools,
.composer-panel {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  padding: 7px 10px;
}
.composer-head {
  justify-content: space-between;
  font-weight: 600;
}
.selection-count {
  color: var(--color-text-2);
  font-weight: 400;
  margin-left: 6px;
}
.composer-tools {
  margin: 0;
  min-width: 0;
  border: 0;
  border-block: 1px solid var(--color-border-2);
  background: #f8f9fb;
  display: grid;
  gap: 6px;
}
.ribbon-group {
  display: grid;
  grid-template-columns: 2.5em minmax(0, 1fr);
  align-items: center;
  gap: 6px;
}
.group-label {
  color: #626b79;
  font-size: 12px;
}
.ribbon-controls,
.editor-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
}
.quick-tools {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  position: absolute;
  visibility: hidden;
  z-index: 5;
  max-width: min(100%, calc(100vw - 18px));
  padding: 5px 7px;
  box-sizing: border-box;
  border: 1px solid #d5dbe3;
  border-radius: 7px;
  background: #fff;
  box-shadow: 0 3px 14px #24385129;
}
.quick-paragraph {
  display: flex;
  gap: 2px;
  padding-left: 4px;
  border-left: 1px solid #d5dbe3;
}
.quick-paragraph button {
  display: grid;
  place-items: center;
  width: 25px;
  height: 27px;
  background: transparent;
  border: 0;
  border-radius: 4px;
  color: #394352;
  cursor: pointer;
}
.quick-paragraph button:hover,
.quick-paragraph button[aria-pressed='true'] {
  color: #1456ae;
  background: #e1edff;
}
.article-composer button,
.composer-tools select,
.composer-panel input {
  border: 1px solid var(--color-border-2);
  background: var(--color-bg-2);
  border-radius: 4px;
  padding: 3px 7px;
  color: var(--color-text-1);
}
.article-composer button {
  cursor: pointer;
  min-height: 26px;
}
.article-composer button:hover,
.article-composer button[aria-pressed='true'] {
  background: var(--color-primary-light-1);
  color: rgb(var(--primary-6));
}
.article-composer button:disabled {
  opacity: 0.45;
  cursor: default;
}
.composer-tools label,
.composer-panel label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}
.composer-tools input[type='color'] {
  width: 23px;
  height: 23px;
  padding: 1px;
}
.article-sheet {
  padding: 18px 24px;
  background: white;
  color: #333;
  line-height: 1.8;
  font-size: 16px;
}
.phone-sheet {
  max-width: 375px;
  box-sizing: border-box;
  margin: 16px auto;
  border: 1px solid #e2e5e4;
  border-radius: 8px;
}
.preview-cover {
  width: 100%;
  height: auto;
}
.byline {
  color: #727b75;
  font-size: 13px;
}
.article-sheet :deep(.tiptap) {
  min-height: 210px;
  outline: none;
  overflow-wrap: anywhere;
}
.article-sheet :deep(.tiptap p) {
  margin: 0 0 12px;
}
.article-sheet :deep(h1) {
  font-size: 26px;
  margin: 18px 0 10px;
}
.article-sheet :deep(h2) {
  font-size: 22px;
  margin: 16px 0 8px;
}
.article-sheet :deep(h3) {
  font-size: 18px;
  margin: 12px 0 8px;
}
.article-sheet :deep(blockquote) {
  margin: 12px 0;
  padding-left: 12px;
  border-left: 3px solid #9aaea4;
}
.article-sheet :deep(ol),
.article-sheet :deep(ul) {
  padding-left: 24px;
}
.article-sheet :deep(figure) {
  margin: 12px 0;
}
.article-sheet :deep(figure img),
.article-sheet :deep(figure video) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: auto;
}
.article-sheet :deep(figure[data-align='left'] img) {
  margin-left: 0;
}
.article-sheet :deep(figure[data-align='right'] img) {
  margin-right: 0;
}
.article-sheet :deep(figcaption) {
  color: #747d78;
  text-align: center;
  font-size: 13px;
}
.article-sheet :deep(figure[data-align='left'] figcaption) {
  text-align: left;
}
.article-sheet :deep(figure[data-align='right'] figcaption) {
  text-align: right;
}
.article-sheet :deep(figure[data-article-media='link']) {
  padding: 12px;
  background: #f4f7f5;
}
.article-sheet :deep(figure small) {
  display: block;
  color: #526b60;
}
.article-sheet :deep(.ProseMirror-selectednode) {
  outline: 2px solid #669382;
}
</style>
