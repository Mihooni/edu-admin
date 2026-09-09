<template>
  <span class="status-dot-wrap" :class="{ subtle }">
    <i class="status-dot" :class="`tone-${tone}`" :style="{ backgroundColor: dotColor }"></i>
    <span class="status-dot-label">{{ label }}</span>
  </span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  tone: { type: String, default: 'neutral' }, // neutral / info / success / warning / error
  label: { type: String, default: '' },
  pulse: { type: Boolean, default: false },
  subtle: { type: Boolean, default: false },
})

const COLORS = {
  neutral: 'var(--t-text-faint)',
  info: 'var(--t-info)',
  success: 'var(--t-success)',
  warning: 'var(--t-warning)',
  error: 'var(--t-danger)',
}

const dotColor = computed(() => COLORS[props.tone] || COLORS.neutral)
</script>

<style lang="scss" scoped>
.status-dot-wrap {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  color: var(--t-text-2);
  white-space: nowrap;

  &.subtle {
    font-size: 12px;
    color: var(--t-text-2);
  }
}

.status-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;

  &.tone-success { color: var(--t-success-text); }
  &.tone-warning { color: var(--t-warning-text); }
  &.tone-error { color: var(--t-danger-text); }
  &.tone-info { color: var(--t-info); }
  &.tone-neutral { color: var(--t-text-faint); }
}
</style>
