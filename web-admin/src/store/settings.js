import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getSettings, saveSettings } from '@/api/modules'
import { resolveTerms, roleLabel as roleLabelFn, DEFAULT_SCHEME } from '@/constants/terms'

const LS_KEY = 'edu_settings'

function loadCache() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}
  } catch {
    return {}
  }
}

// Pinia 机构设置 + 统一称呼管理
export const useSettingsStore = defineStore('settings', () => {
  // 完整设置（机构信息、规则等）
  const settings = ref({})
  // 称呼方案
  const termScheme = ref(DEFAULT_SCHEME)
  const termOverrides = ref({})

  // 从缓存初始化，保证登录页等首屏即可用默认教培版（无需等待接口）
  const cache = loadCache()
  if (cache.termScheme) termScheme.value = cache.termScheme
  if (cache.termOverrides) termOverrides.value = cache.termOverrides

  // 解析后的术语表（预设 + 自定义覆盖）
  const terms = computed(() => resolveTerms(termScheme.value, termOverrides.value))

  // 取词：t('instructor') -> 老师/教练
  const t = (key) => (terms.value && terms.value[key] != null ? terms.value[key] : key)

  // 角色徽标称呼
  const roleLabel = (role) => roleLabelFn(role, terms.value)

  // 拉取最新设置
  const loadSettings = async () => {
    try {
      const data = await getSettings()
      settings.value = data || {}
      // 后端 GET /api/settings 返回 snake_case 键（term_scheme / term_overrides），需对齐读取
      if (data && data.term_scheme) termScheme.value = data.term_scheme
      if (data && data.term_overrides) termOverrides.value = data.term_overrides || {}
      localStorage.setItem(LS_KEY, JSON.stringify({
        termScheme: termScheme.value,
        termOverrides: termOverrides.value,
      }))
      return data
    } catch (e) {
      // 接口失败时使用缓存/默认，不阻断页面渲染
      return null
    }
  }

  // 保存称呼设置（方案 + 微调）
  const saveTermSettings = async (scheme, overrides) => {
    const payload = { ...(settings.value || {}), term_scheme: scheme, term_overrides: overrides || {} }
    const res = await saveSettings(payload)
    termScheme.value = scheme
    termOverrides.value = overrides || {}
    localStorage.setItem(LS_KEY, JSON.stringify({
      termScheme: termScheme.value,
      termOverrides: termOverrides.value,
    }))
    return res
  }

  return {
    settings,
    termScheme,
    termOverrides,
    terms,
    t,
    roleLabel,
    loadSettings,
    saveTermSettings,
  }
})
