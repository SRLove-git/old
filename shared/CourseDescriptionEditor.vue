<script setup>
import { computed, onBeforeUnmount, reactive, watch } from 'vue'
import ParagraphImageInput from './ParagraphImageInput.vue'
import { editorBlockKey, insertImageBlock } from './editor-blocks.js'

const blocks = defineModel({ type: Array, required: true })
const props = defineProps({
  uploadImage: { type: Function, required: true },
  previewUrl: { type: Function, required: true }
})
const emit = defineEmits(['uploading'])
const pending = reactive(new Set())
const errors = reactive(new WeakMap())
const uploading = computed(() => blocks.value.some(block => pending.has(block)))
watch(uploading, value => emit('uploading', value), { flush: 'sync' })
onBeforeUnmount(() => emit('uploading', false))

async function upload(block, file) {
  if (!file || pending.has(block)) return
  pending.add(block)
  errors.delete(block)
  try {
    const src = await props.uploadImage(file)
    if (!src) throw new Error('图片上传失败，请重试')
    if (blocks.value.includes(block)) block.src = src
  } catch (error) {
    if (blocks.value.includes(block)) errors.set(block, error.message || '图片上传失败，请重试')
  } finally {
    pending.delete(block)
  }
}

function replaceImage(block, event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  return upload(block, file)
}

function insert(paragraph, { offset, file }) {
  const block = insertImageBlock(blocks.value, paragraph, offset)
  if (block) upload(block, file)
}

function move(index, step) {
  const [block] = blocks.value.splice(index, 1)
  blocks.value.splice(index + step, 0, block)
}
</script>

<template>
  <div class="course-description-editor">
    <div v-for="(block, index) in blocks" :key="editorBlockKey(block)" class="course-block">
      <div class="block-header">
        <strong>{{ block.type === 'image' ? '图片' : '段落' }}</strong>
        <a-space :size="0">
          <a-button size="mini" type="text" :disabled="index === 0" @click="move(index, -1)">上移</a-button>
          <a-button size="mini" type="text" :disabled="index === blocks.length - 1" @click="move(index, 1)">下移</a-button>
          <a-button size="mini" type="text" status="danger" @click="blocks.splice(index, 1)">删除</a-button>
        </a-space>
      </div>
      <ParagraphImageInput v-if="block.type === 'text'" v-model="block.text" :auto-size="{ minRows: 3, maxRows: 10 }" placeholder="输入课程介绍" @insert-image="insert(block, $event)" />
      <template v-else>
        <img v-if="block.src" :src="previewUrl(block.src)" alt="课程正文插图" />
        <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="上传课程正文图片" :disabled="pending.has(block)" @change="replaceImage(block, $event)" />
        <span v-if="pending.has(block)" role="status">图片上传中…</span>
        <span v-if="errors.has(block)" class="upload-error" role="alert">{{ errors.get(block) }}</span>
        <a-input v-model="block.caption" placeholder="图片说明（选填）" />
      </template>
    </div>
    <a-space wrap>
      <a-button size="small" type="outline" @click="blocks.push({ type: 'text', text: '' })">添加文字</a-button>
      <a-button size="small" type="outline" @click="blocks.push({ type: 'image', src: '', caption: '' })">添加图片</a-button>
    </a-space>
  </div>
</template>

<style scoped>
.course-description-editor, .course-block { display: grid; width: 100%; gap: 10px; }
.course-block { box-sizing: border-box; padding: 12px; border: 1px solid var(--color-border-2); border-radius: 8px; }
.block-header { display: flex; align-items: center; justify-content: space-between; }
.course-block img { max-width: 100%; max-height: 180px; object-fit: contain; }
.upload-error { color: rgb(var(--danger-6)); }
</style>
