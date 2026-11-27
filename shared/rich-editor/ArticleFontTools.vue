<script setup>
import { computed } from 'vue'

const props = defineProps({ selected: Object, colors: Object })
const emit = defineEmits(['command', 'clear'])
const fonts = [
  ['宋体', 'SimSun, Songti SC, serif'],
  ['黑体', 'SimHei, Heiti SC, sans-serif'],
  ['楷体', 'KaiTi, Kaiti SC, serif'],
  ['仿宋', 'FangSong, STFangsong, serif'],
  ['微软雅黑', 'Microsoft YaHei, PingFang SC, sans-serif'],
  ['Arial', 'Arial, sans-serif']
]
const sizes = [
  ['12px', '小五 · 9 磅'],
  ['14px', '五号 · 10.5 磅'],
  ['16px', '小四 · 12 磅'],
  ['18px', '13.5 磅'],
  ['18.67px', '四号 · 14 磅'],
  ['20px', '小三 · 15 磅'],
  ['21.33px', '三号 · 16 磅'],
  ['24px', '小二 · 18 磅'],
  ['28px', '21 磅'],
  ['29.33px', '二号 · 22 磅'],
  ['32px', '小一 · 24 磅'],
  ['34.67px', '一号 · 26 磅'],
  ['36px', '27 磅'],
  ['48px', '小初 · 36 磅'],
  ['56px', '初号 · 42 磅']
]
const marks = [
  ['bold', '加粗', 'B', 'toggleBold'],
  ['italic', '斜体', 'I', 'toggleItalic'],
  ['underline', '下划线', 'U', 'toggleUnderline'],
  ['strike', '删除线', 'S', 'toggleStrike']
]
const colorTools = [
  ['ink', '字色', 'A', 'setColor'],
  ['highlight', '文字底色', 'ab', 'setBackgroundColor']
]
const family = computed(() => {
  const value = props.selected.family || ''
  const first = value.split(',')[0].trim().replace(/['"]/g, '').toLowerCase()
  return fonts.find(([, stack]) => stack.split(',')[0].toLowerCase() === first)?.[1] || value
})
</script>

<template>
  <div class="font-tools">
    <select
      aria-label="字体"
      title="字体"
      :value="family"
      @change="
        emit('command', $event.target.value ? 'setFontFamily' : 'unsetFontFamily', $event.target.value)
      "
    >
      <option value="">默认字体</option>
      <option v-if="family && !fonts.some(([, stack]) => stack === family)" :value="family">
        {{ family.split(',')[0] }}
      </option>
      <option v-for="[label, stack] in fonts" :key="stack" :value="stack" :style="{ fontFamily: stack }">
        {{ label }}
      </option>
    </select>
    <select
      aria-label="字号"
      title="字号"
      :value="selected.size"
      @change="emit('command', $event.target.value ? 'setFontSize' : 'unsetFontSize', $event.target.value)"
    >
      <option value="">默认字号</option>
      <option v-if="selected.size && !sizes.some(([size]) => size === selected.size)" :value="selected.size">
        {{ selected.size }}
      </option>
      <option v-for="[size, label] in sizes" :key="size" :value="size">{{ label }}</option>
    </select>
    <button
      v-for="[key, label, symbol, command] in marks"
      :key="key"
      type="button"
      :class="'mark-' + key"
      :aria-label="label"
      :title="label"
      :aria-pressed="selected[key]"
      @mousedown.prevent
      @click="emit('command', command)"
    >
      {{ symbol }}
    </button>
    <span v-for="[key, label, symbol, command] in colorTools" :key="key" class="color-tool">
      <button
        type="button"
        :aria-label="'应用' + label"
        :title="'应用' + label"
        @mousedown.prevent
        @click="emit('command', command, colors[key])"
      >
        <span :class="'swatch-' + key" :style="{ '--swatch': colors[key] }">{{ symbol }}</span>
      </button>
      <label :title="'选择' + label"
        >▾<input
          type="color"
          :aria-label="label"
          :value="colors[key]"
          @input="emit('command', command, $event.target.value)"
      /></label>
    </span>
    <button
      class="clear"
      aria-label="清除格式"
      title="清除文字格式"
      type="button"
      @mousedown.prevent
      @click="emit('clear')"
    >
      Tₓ
    </button>
  </div>
</template>

<style scoped>
.font-tools {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 3px;
}
.font-tools select,
.font-tools button,
.color-tool label {
  box-sizing: border-box;
  height: 27px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: #2b3240;
  font: inherit;
  font-size: 13px;
}
.font-tools select {
  max-width: 110px;
  padding: 0 2px;
  border-color: #d6dbe2;
  background: white;
}
.font-tools button {
  min-width: 25px;
  padding: 0 4px;
  cursor: pointer;
}
.font-tools button:hover,
.color-tool label:hover {
  background: #eef2f7;
}
.font-tools button[aria-pressed='true'] {
  color: #1456ae;
  background: #e1edff;
}
.font-tools :focus-visible {
  outline: 2px solid #567eb5;
  outline-offset: 0;
}
.mark-bold {
  font-weight: 750 !important;
}
.mark-italic {
  font-style: italic !important;
}
.mark-underline {
  text-decoration: underline;
}
.mark-strike {
  text-decoration: line-through;
}
.color-tool {
  display: inline-flex;
  align-items: center;
}
.color-tool label {
  display: grid;
  place-items: center;
  position: relative;
  width: 13px;
  font-size: 10px;
}
.color-tool input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  padding: 0;
  opacity: 0;
  cursor: pointer;
}
.color-tool label:focus-within {
  outline: 2px solid #567eb5;
}
.swatch-ink {
  border-bottom: 3px solid var(--swatch);
  font-weight: 600;
}
.swatch-highlight {
  background: var(--swatch);
  padding: 0 2px;
}
</style>
