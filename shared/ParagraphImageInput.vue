<script setup>
import { ref } from 'vue'

const text = defineModel({ type: String, default: '' })
defineProps({ placeholder: String, autoSize: Object })
const emit = defineEmits(['insert-image'])
const container = ref(null)
const picker = ref(null)
let hasFocused = false
let insertionOffset = 0

function caret() {
  const textarea = container.value?.querySelector('textarea')
  return hasFocused && textarea ? textarea.selectionEnd : text.value.length
}

function rememberFocus(event) {
  if (event.target.tagName === 'TEXTAREA') hasFocused = true
}

function chooseImage() {
  insertionOffset = caret()
  picker.value.click()
}

function picked(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (file) emit('insert-image', { file, offset: insertionOffset })
}

function pasteImage(event) {
  if (event.target.tagName !== 'TEXTAREA') return
  const file = Array.from(event.clipboardData?.files || []).find(item => item.type.startsWith('image/'))
  if (!file) return
  event.preventDefault()
  emit('insert-image', { file, offset: event.target.selectionEnd })
}
</script>

<template>
  <div ref="container" class="paragraph-image-input" @paste="pasteImage" @focusin="rememberFocus">
    <a-textarea v-model="text" :placeholder="placeholder" :auto-size="autoSize" />
    <input ref="picker" type="file" accept="image/jpeg,image/png,image/webp" hidden @change="picked" />
    <a-button size="mini" type="outline" @mousedown.prevent @click="chooseImage">在光标处插入图片</a-button>
  </div>
</template>

<style scoped>
.paragraph-image-input { display: grid; width: 100%; gap: 6px; }
.paragraph-image-input > button { justify-self: start; }
</style>
