// 主题引擎：light / dark / system 三态
// - data-theme 属性驱动 index.scss 的 --t-* token 块与 Element Plus 暗色 css-vars（html.dark）
// - color-scheme 声明让浏览器原生控件（滚动条/表单/补全）跟随主题，消除暗色系统下的「花白」
// - 切换时派发 window 'theme-changed' 事件，ECharts 等 canvas 场景监听后按新 token 重绘
import { shallowRef } from 'vue'

const KEY = 'edu_theme'
const MODES = ['system', 'light', 'dark']
const mq = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null

// 历史脏值（旧版本写入的非法值）归一为 system
const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
export const themeMode = shallowRef(MODES.includes(raw) ? raw : 'system')

// 每次主题真正应用（含 system 跟随系统翻转）时自增。
// 视图内用 computed 依赖它即可在主题变化时重算 getComputedStyle 派生色。
export const themeTick = shallowRef(0)

export function resolvedDark() {
  if (themeMode.value === 'dark') return true
  if (themeMode.value === 'light') return false
  return !!(mq && mq.matches)
}

export function applyTheme() {
  const dark = resolvedDark()
  const el = document.documentElement
  el.setAttribute('data-theme', dark ? 'dark' : 'light')
  el.classList.toggle('dark', dark) // Element Plus dark css-vars 的钩子
  el.style.colorScheme = dark ? 'dark' : 'light'
  themeTick.value++
  window.dispatchEvent(new Event('theme-changed'))
}

export function setThemeMode(mode) {
  if (!MODES.includes(mode)) return
  try { localStorage.setItem(KEY, mode) } catch (e) { /* 隐私模式忽略 */ }
  themeMode.value = mode
  applyTheme()
}

// system → light → dark → system 循环
export function cycleThemeMode() {
  const i = MODES.indexOf(themeMode.value)
  setThemeMode(MODES[(i + 1) % MODES.length])
}

export const THEME_LABELS = { system: '跟随系统', light: '浅色', dark: '深色' }

export function initTheme() {
  applyTheme()
  if (mq) {
    const onChange = () => { if (themeMode.value === 'system') applyTheme() }
    if (mq.addEventListener) mq.addEventListener('change', onChange)
    else mq.addListener(onChange)
  }
}
