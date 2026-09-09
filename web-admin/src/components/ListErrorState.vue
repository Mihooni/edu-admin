<template>
  <div class="list-error" role="alert">
    <div class="list-error__icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor"
        stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    </div>
    <p class="list-error__title">数据加载失败</p>
    <p class="list-error__reason">{{ error }}</p>
    <el-button type="primary" class="list-error__btn" @click="$emit('retry')">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </svg>
      <span>{{ retryText }}</span>
    </el-button>
  </div>
</template>

<script setup>
defineProps({
  error: { type: String, default: '' },
  retryText: { type: String, default: '重新加载' }
})
defineEmits(['retry'])
</script>

<style scoped>
.list-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 260px;
  padding: 32px 24px;
  text-align: center;
  box-sizing: border-box;
}
.list-error__icon {
  color: var(--t-danger, #FF3B30);
  margin-bottom: 14px;
}
.list-error__title {
  margin: 0 0 6px;
  font-size: var(--t-fs-lg);
  font-weight: 600;
  color: var(--t-text-1, #1D1D1F);
}
.list-error__reason {
  margin: 0 0 18px;
  max-width: 440px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--t-text-3, #86868B);
  word-break: break-word;
}
.list-error__btn :deep(svg) {
  margin-right: 6px;
}
@media (prefers-reduced-motion: reduce) {
  .list-error__btn {
    transition: none !important;
  }
}
</style>
