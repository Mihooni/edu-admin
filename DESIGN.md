# DESIGN.md — 星课 Web 工作台设计系统

> 适用范围：Web 管理后台（`web-admin/`）。真实源是代码里的设计 token：
> `web-admin/src/styles/variables.scss`（编译期 `$` 变量）与
> `web-admin/src/styles/index.scss`（运行时 `--t-*` CSS 变量，含深浅色两套）。
> 改样式先改 token，组件只引用变量。
>
> 历史版本：v2（2026-08-20）暖橙编辑式 → v3（2026-08-23）三端分化 →
> v3.1（2026-09-10）本仓库收敛为 Web 端；小程序端设计规范随付费扩展提供。

---

## 1. 视觉基调

- **产品**：教培 / 健身机构管理工作台（高密度工具，非落地页）。
- **语言**：Apple 式极简——克制留白、细边框、极轻阴影、蓝色仅作强调不铺面。
- **关键词**：清晰 / 紧凑 / 层级靠字重与留白 / 零渐变文字 / 零霓虹。
- **深浅色双主题**：全站颜色必须走 `--t-*` token，任何组件不得写死色值；
  暗黑模式为第一公民（`html[data-theme='dark']` 令牌块），新样式改完必须跑
  `node tools/dark-mode-audit.mjs --theme dark && --theme light` 双回归。

## 2. 颜色 Token（`--t-*`）

### 主色
| 角色 | 浅色 | 深色 | 变量 |
|------|------|------|------|
| Accent | `#0071e3` | `#0A84FF` | `--t-accent` |
| Accent Strong | hover/按下加深 | `#409CFF` | `--t-accent-strong` |
| Accent BG | 蓝 8% 浅底 | 蓝 16% 深底 | `--t-accent-bg` |
| Accent Line | 蓝 30% 边 | 蓝 36% 边 | `--t-accent-line` |

### 表面与线条
| 角色 | 浅色 | 深色 | 变量 |
|------|------|------|------|
| Page BG | `#FFFFFF` | `#0B0B0F` | `--t-bg` |
| BG Alt（表头/隔行） | `#FAFAFA` | `#15151A` | `--t-bg-alt` |
| Surface（卡片） | `#FFFFFF` | `#17171C` | `--t-surface` |
| Surface Hover | `#F5F5F7` | `#1F1F26` | `--t-surface-hover` |
| Surface Strong | `#E8E8ED` | `#26262E` | `--t-surface-strong` |
| Line | `#E8E8ED` | `#2A2A33` | `--t-line` |
| Line Strong | `#D2D2D7` | `#3A3A44` | `--t-line-strong` |

### 文字（对比度基准：主文字对底 ≥ 7:1，次级 ≥ 4.5:1）
| 角色 | 浅色 | 深色 | 变量 |
|------|------|------|------|
| Text 1（标题/主） | `#1D1D1F` | `#F5F5F7` | `--t-text-1` |
| Text 2（正文/次） | `#515154` | `#B9B9BF` | `--t-text-2` |
| Text 3（辅助） | `#86868B` | `#8E8E94` | `--t-text-3` |
| Text Faint（占位） | `#AEAEB2` | `#6E6E76` | `--t-text-faint` |

### 语义色（浅色 / 深色采用 Apple 系统色变体）
| 角色 | 浅色 | 深色 | 变量 |
|------|------|------|------|
| Success | `#34C759` 系 | `#30D158` | `--t-success` |
| Warning | `#FF9500` | `#FF9F0A` | `--t-warning` |
| Danger | `#FF3B30` | `#FF453A` | `--t-danger` |
| Info | `#8E8E93` | `#98989F` | `--t-info` |

浅底标签统一用 `color-mix(in srgb, var(--t-success) 12%, transparent)` 模式派生，禁止另起一套半透明常量。

### 图表色板
`--t-chart-1..6`：浅色主题苹果蓝系六色；深色主题 HIG 亮色六色
（`#0A84FF #30D158 #FF9F0A #FF453A #BF5AF2 #FF375F`）。
**ECharts 画布读不到 CSS 变量**：canvas 类颜色一律经
`web-admin/src/utils/theme-colors.js` 的 `chartPalette() / teacherColors() /
classFallback() / courseTextColor()` 取 token，并靠 `themeTick`（`utils/theme.js`）
响应式重算；页面级图表监听 `window 'theme-changed'` 事件重绘。

## 3. Element Plus 对接

- 暗色底座：`main.js` 引入 `element-plus/theme-chalk/dark/css-vars.css`，
  `html.dark` 类由 `utils/theme.js` 的 `applyTheme()` 与 `data-theme` 同步切换。
- 覆写块在 `index.scss` 的 `html[data-theme='dark']` 内：
  `--el-color-primary` 对齐 `#0A84FF`；`light-3/5/7/8/9` 一律**向黑混合**、
  `dark-2` 向白混合（与 EP 官方暗色约定一致），用 `color-mix` 派生，不再手调 hex。
- 主题模式三档：system / light / dark（localStorage 键 `edu_theme`），
  `index.html` 内联预渲染脚本防首屏闪白。

## 4. 字体与排版

- Font Family：`-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', 'Helvetica Neue', sans-serif`
- 数字一律 `font-variant-numeric: tabular-nums`。
- 字重只用 400 / 500 / 600 / 700。
- 字阶 token：`--t-fs-2xs .. --t-fs-3xl`（11 → 30px 体系），页面禁止游离字号。
- 行高：正文 1.5、长文 1.7、大数字 1.1。

## 5. 布局与组件

- **间距 token**：`--t-spacing-sm/md/lg/xl/2xl`（8/12/16/24/32）。
- **圆角**：控件 `--t-radius-sm`(6) / 卡片 `--t-radius-card`(12) / 弹窗 `--t-radius-lg`。同页不混搭。
- **阴影**：`--t-card-shadow` 单层极轻；深色主题阴影加深、抬依赖面亮度差而非投影。
- **列表/表格**：表头底 `--t-bg-alt`；行 hover `--t-hover-bg`；斑马纹同用 alt。
- **状态展示**：统一 `<StatusDot>`（tone: success/warning/danger/neutral）与 `<EntityAvatar>`（tone-* 用 color-mix 浅底）；页面不再自造彩色徽标。
- **三态**：loading 骨架/v-loading；empty 具体文案 + 下一步；error 内联错误块 + 重试（`ListErrorState`）。

## 6. 交互与动效

- 过渡 ≤ 200ms，曲线 `cubic-bezier(0.16, 1, 0.3, 1)`；禁 `transition: all`。
- 入场仅 `fade + translateY(8px)`，禁 `scale(0)`。
- 必须兜底 `@media (prefers-reduced-motion: reduce)`。
- 危险操作二次确认（`ElMessageBox`），导出操作弹窗确认时间范围。

## 7. Don'ts（硬约束）

- ❌ 组件内写死颜色（含 `#fff`/`rgba(255,…)`——需要白字时必须确认承载面恒为深色实底，如课程标识色 banner，并注释说明与主题无关）。
- ❌ 只适配浅色就提交——`dark-mode-audit` 亮色像素占比异常视为 bug。
- ❌ 紫蓝渐变 / 霓虹光晕 / 渐变文字 / emoji 入正文 / 三等分卡片阵列。
- ❌ 绕过 `--t-*` 直接引用编译期 `$` 做运行时主题色。
- ❌ Element 默认蓝 `#409eff` 出现在覆写层之外。

## 8. 小程序端

家长 / 教练 / 管理三端小程序（含其 warm-orange v2 历史规范与 `variables.wxss` 体系）
不在本仓库，随可选付费扩展一并提供与维护。
