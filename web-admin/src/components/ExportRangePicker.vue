<template>
  <el-date-picker
    v-model="range"
    type="daterange"
    range-separator="至"
    start-placeholder="导出开始日期"
    end-placeholder="导出结束日期"
    value-format="YYYY-MM-DD"
    :shortcuts="shortcuts"
    clearable
    placeholder="任意时间段"
    style="width: 260px"
    @change="onChange"
  />
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: Array, default: null },
  // 默认选中的快捷项：today / 7 / 30 / month / year / null
  defaultShortcut: { type: String, default: null },
})
const emit = defineEmits(['update:modelValue'])

const fmt = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const daysAgo = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

const shortcuts = [
  { text: '今天', value: () => { const s = fmt(new Date()); return [s, s] } },
  { text: '近 7 天', value: () => [fmt(daysAgo(6)), fmt(new Date())] },
  { text: '近 30 天', value: () => [fmt(daysAgo(29)), fmt(new Date())] },
  { text: '本月', value: () => { const d = new Date(); return [`${fmt(d).slice(0, 7)}-01`, fmt(d)] } },
  { text: '本年', value: () => { const d = new Date(); return [`${d.getFullYear()}-01-01`, fmt(d)] } },
]

const applyShortcut = (key) => {
  const item = shortcuts.find((s) => {
    const text = s.text
    return (key === 'today' && text === '今天')
      || (key === '7' && text === '近 7 天')
      || (key === '30' && text === '近 30 天')
      || (key === 'month' && text === '本月')
      || (key === 'year' && text === '本年')
  })
  return item ? item.value() : null
}

const range = ref(props.modelValue || applyShortcut(props.defaultShortcut))

watch(() => props.modelValue, (v) => {
  range.value = v
})

const onChange = (val) => {
  emit('update:modelValue', val)
}

defineExpose({ range })
</script>
