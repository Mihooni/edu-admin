// 共享调色板常量 —— 与 src/styles/variables.scss 的 --t-chart-* / --t-class-fallback 保持一致。
// ECharts 等运行时不读 CSS 变量的场景，统一从此处取值，禁止在页面内写死十六进制字面量。

// 班级 / 课程默认色（亮色主题值；暗色由 CSS 变量 --t-class-fallback 覆盖时另行处理）
export const CLASS_FALLBACK = '#0071e3'

// 图表调色板（与 --t-chart-1..6 对应：Apple 系统色 → 蓝 → 绿 → 橙 → 红 → 紫 → 粉）
export const CHART_PALETTE = ['#0071e3', '#34C759', '#FF9500', '#FF3B30', '#AF52DE', '#FF2D55']

// 教师配色（周视图等按教师区分场景），首项与班级默认色一致
export const TEACHER_COLORS = [
  '#0071e3', '#34C759', '#FF9500', '#FF3B30',
  '#AF52DE', '#FF2D55', '#FF9F0A', '#30D158'
]

// 读取运行时的主题班级默认色（暗色主题下为 #2DD4BF），保证 JS 侧与 CSS 同步
export function classFallback() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return CLASS_FALLBACK
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue('--t-class-fallback')
    .trim()
  return v || CLASS_FALLBACK
}
