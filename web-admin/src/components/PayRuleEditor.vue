<template>
  <div class="pay-rule-editor">
    <div class="form-section">
      <div class="form-label">计费模式</div>
    <el-radio-group v-model="draft.type" class="mode-group" @change="emitChange">
      <el-radio-button value="fixed">按课时</el-radio-button>
      <el-radio-button value="per_head">按人头</el-radio-button>
      <el-radio-button value="hybrid">混合计费</el-radio-button>
    </el-radio-group>
    <p class="form-hint">
      {{ modeHint }}
    </p>
    </div>

    <template v-if="draft.type === 'fixed'">
      <div class="form-section">
        <div class="form-label">基础单价（元/节）</div>
        <el-input-number v-model="draft.baseRate" :min="0" :max="2000" :step="10" controls-position="right" class="rule-input" @change="emitChange" />
      </div>

      <div class="form-section">
        <div class="form-label-row">
          <span class="form-label">人数阶梯</span>
          <el-button text type="primary" size="small" :icon="Plus" @click="addTier">添加档位</el-button>
        </div>
        <p class="form-hint">达到指定人数后自动按高档单价结算</p>
      <div v-if="draft.tiers.length" class="tier-list">
        <div v-for="(tier, i) in draft.tiers" :key="i" class="tier-row">
          <span class="tier-badge">≥</span>
          <el-input-number v-model="tier.minStudents" :min="1" :max="999" size="small" controls-position="right" class="tier-input" @change="emitChange" />
          <span class="tier-text">人</span>
          <span class="tier-sep">→</span>
          <el-input-number v-model="tier.rate" :min="0" :max="2000" :step="10" size="small" controls-position="right" class="tier-input" @change="emitChange" />
          <span class="tier-text">元/节</span>
          <el-button text type="danger" size="small" :icon="Delete" class="tier-del" @click="removeTier(i)" />
        </div>
      </div>
      <p v-else class="form-hint">未设置阶梯时，所有课时均按基础单价计算。</p>
      </div>
    </template>

    <template v-else-if="draft.type === 'per_head'">
      <div class="form-section">
        <div class="form-label">每人单价（元/人）</div>
        <el-input-number v-model="draft.perHeadRate" :min="0" :max="200" :step="1" controls-position="right" class="rule-input" @change="emitChange" />
        <p class="form-hint">按实际签到人数 × 单价计算，如 5 元/人 × 12 人 = 60 元</p>
      </div>
    </template>

    <template v-else>
      <div class="form-section">
        <div class="form-label">每节基础费（元）</div>
        <el-input-number v-model="draft.baseRate" :min="0" :max="2000" :step="10" controls-position="right" class="rule-input" @change="emitChange" />
      </div>
      <div class="form-row">
        <div class="form-section">
          <div class="form-label">免费人数（含）</div>
          <el-input-number v-model="draft.freeHeadCount" :min="0" :max="999" size="small" controls-position="right" class="rule-input-sm" @change="emitChange" />
        </div>
        <div class="form-section">
          <div class="form-label">超出每人加价（元）</div>
          <el-input-number v-model="draft.extraPerHead" :min="0" :max="200" :step="1" size="small" controls-position="right" class="rule-input-sm" @change="emitChange" />
        </div>
      </div>
      <p class="form-hint">例：60 元/节，免费 6 人，超出每人加 5 元 → 10 人 = 60 + 4 × 5 = 80 元</p>
    </template>

    <div class="preview-section">
      <div class="preview-head">
        <span class="preview-title">预览</span>
        <div class="preview-control">
          <el-input-number v-model="previewCount" :min="0" :max="200" size="small" controls-position="right" class="preview-input" />
          <span class="preview-unit">人签到</span>
        </div>
      </div>
      <div class="preview-result">
        <span class="preview-calc">{{ previewText }}</span>
        <span class="preview-amount">¥{{ previewAmount.toLocaleString() }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, watch, computed } from 'vue'
import { Plus, Delete } from '@element-plus/icons-vue'

const props = defineProps({
  modelValue: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue'])

const empty = () => ({
  type: 'fixed',
  baseRate: 0,
  tiers: [],
  perHeadRate: 0,
  freeHeadCount: 0,
  extraPerHead: 0,
})

const draft = reactive(empty())
const previewCount = ref(12)
let filled = false

const fill = (rule) => {
  const r = rule && typeof rule === 'object' ? rule : {}
  draft.type = ['fixed', 'per_head', 'hybrid'].includes(r.type) ? r.type : 'fixed'
  draft.baseRate = Number(r.baseRate) || 0
  draft.tiers = Array.isArray(r.tiers)
    ? r.tiers.map((t) => ({ minStudents: Number(t.minStudents) || 0, rate: Number(t.rate) || 0 }))
    : []
  draft.perHeadRate = Number(r.perHeadRate) || 0
  draft.freeHeadCount = Number(r.freeHeadCount) || 0
  draft.extraPerHead = Number(r.extraPerHead) || 0
}

watch(
  () => props.modelValue,
  (v) => {
    if (!filled && v) {
      fill(v)
      filled = true
    }
  },
  { immediate: true }
)

const emitChange = () => emit('update:modelValue', JSON.parse(JSON.stringify(draft)))

const addTier = () => {
  const max = draft.tiers.length ? Math.max(...draft.tiers.map((t) => t.minStudents)) : 0
  draft.tiers.push({ minStudents: max + 1, rate: draft.baseRate })
  emitChange()
}

const removeTier = (i) => {
  draft.tiers.splice(i, 1)
  emitChange()
}

const modeHint = computed(() => ({
  fixed: '每节课按固定单价结算，可设置人数门槛自动升档。例：80 元/节，超过 15 人 120 元/节。',
  per_head: '按该节课实际签到人数 × 单价结算。例：5 元/人。',
  hybrid: '每节基础费 + 超出免费人数后按人头加价。例：60 元/节，超出 6 人每多 1 人加 5 元。',
}[draft.type]))

const calcAmount = (n) => {
  const count = Math.max(0, Math.floor(Number(n) || 0))
  if (draft.type === 'per_head') return count * (draft.perHeadRate || 0)
  if (draft.type === 'hybrid') {
    return (draft.baseRate || 0) + Math.max(0, count - (draft.freeHeadCount || 0)) * (draft.extraPerHead || 0)
  }
  const hit = [...draft.tiers]
    .sort((a, b) => b.minStudents - a.minStudents)
    .find((t) => count >= t.minStudents)
  return hit ? hit.rate : draft.baseRate || 0
}

const previewAmount = computed(() => calcAmount(previewCount.value))

const previewText = computed(() => {
  const n = Math.max(0, Math.floor(Number(previewCount.value) || 0))
  if (draft.type === 'per_head') return `${draft.perHeadRate || 0} 元/人 × ${n} 人`
  if (draft.type === 'hybrid') {
    const extra = Math.max(0, n - (draft.freeHeadCount || 0))
    return extra > 0
      ? `${draft.baseRate || 0} + (${n} − ${draft.freeHeadCount || 0}) × ${draft.extraPerHead || 0}`
      : `${draft.baseRate || 0} 元/节`
  }
  const hit = [...draft.tiers]
    .sort((a, b) => b.minStudents - a.minStudents)
    .find((t) => n >= t.minStudents)
  return hit ? `${hit.rate} 元/节（≥${hit.minStudents} 人）` : `${draft.baseRate || 0} 元/节`
})
</script>

<style lang="scss" scoped>
.pay-rule-editor {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.form-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.form-row {
  display: flex;
  gap: 16px;
}
.form-row .form-section {
  flex: 1;
}
.form-label {
  font-size: var(--t-fs-sm);
  font-weight: 600;
  color: var(--t-text-1);
}
.form-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.form-hint {
  font-size: var(--t-fs-xs);
  color: var(--t-text-2);
  line-height: 1.6;
}
.mode-group {
  width: 100%;
}
.mode-group :deep(.el-radio-button) {
  flex: 1;
}
.mode-group :deep(.el-radio-button__inner) {
  width: 100%;
}
.rule-input {
  width: 180px;
}
.rule-input-sm {
  width: 100%;
}
.tier-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.tier-row {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--t-surface-hover);
  border: 1px solid var(--t-line);
  border-radius: var(--t-radius-md);
  padding: 10px 14px;
}
.tier-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: var(--t-radius-sm);
  background: var(--t-accent-bg);
  color: var(--t-accent-text);
  font-size: var(--t-fs-sm);
  font-weight: 700;
}
.tier-text {
  font-size: var(--t-fs-sm);
  color: var(--t-text-2);
  white-space: nowrap;
}
.tier-sep {
  color: var(--t-text-3);
  font-size: var(--t-fs-base);
}
.tier-input {
  width: 110px !important;
}
.tier-del {
  margin-left: auto;
}
.preview-section {
  border: 1px solid var(--t-line);
  border-radius: var(--t-radius-md);
  padding: 16px;
  background: var(--t-surface);
}
.preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.preview-title {
  font-size: var(--t-fs-sm);
  font-weight: 600;
  color: var(--t-text-1);
}
.preview-control {
  display: flex;
  align-items: center;
  gap: 8px;
}
.preview-unit {
  font-size: var(--t-fs-xs);
  color: var(--t-text-2);
}
.preview-result {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--t-line);
}
.preview-calc {
  font-size: var(--t-fs-sm);
  color: var(--t-text-2);
}
.preview-amount {
  font-size: var(--t-fs-3xl);
  font-weight: 700;
  color: var(--t-accent-strong);
  font-variant-numeric: tabular-nums;
}
</style>
