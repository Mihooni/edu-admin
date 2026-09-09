# DESIGN.md — 星课统一设计系统

> **本文件已被 `DESIGN-v3.md` 取代。** 请以 v3 为准。
> v2 内容保留在本文件供历史参考，新页面和改动请遵循 `DESIGN-v3.md`。
>
> 历史版本：v2（2026-08-20）暖橙编辑式 → v3（2026-08-23）三端分化设计系统

---

## 0. 设计读取与规范锚

### 0.1 Design Read
- 产品：儿童体育培训机构（篮球+体适能，3-8 岁）双端小程序 + Web 后台。
- 受众：家长端面向 28-40 岁年轻父母（信任 + 活力）；管理端面向教练/顾问/管理员（效率 + 可靠）。
- 视觉语言：**暖橙编辑式**——暖白纸面 + 暖灰文字 + 深橙强调色 + 分隔线式排版 + 大数字层级。气质介于 Keep 的运动能量与 薄荷健康 的成长记录之间，但执行更克制（不炫技、不渐变文字、不霓虹）。
- 反 AI 味是硬约束，见 §7。

### 0.2 三拨盘（taste-skill）
| 拨盘 | 值 | 含义 |
|------|----|------|
| 视觉冒险度 | 3 | 克制：一致优先，暖橙作重音色不大面积铺色，禁止渐变文字/光晕/霓虹 |
| 动效强度 | 3 | 极简：仅 :active 反馈与轻过渡（≤200ms），尊重 prefers-reduced-motion，无入场编排 |
| 信息密度 | 10 | 高密度：行高紧凑、分隔线分组、少大留白；单位面积信息量大，像高效工具而非落地页 |

### 0.3 形状锁定
- **控件**（按钮/输入/标签/分页）：`6px`（`--r-control`）
- **容器**（卡片/弹窗/抽屉）：`12px`（`--r-lg`）
- **微小片**（徽标/状态标签）：`4px`（`--r-sm`）
- **圆形**（头像/开关/单选点/进度环）：`full`
- 规则：同一页面只出现上述档位对应用途；禁止"方卡 + 胶囊按钮"混搭。控件圆角 6px 是 C 方向的编辑感来源，取代旧的全胶囊按钮。

### 0.4 状态三态
- loading：骨架/圈，全站 v-loading 或局部 loading
- empty：插画弱化 + 具体文案 + 下一步（禁止笼统"暂无数据"）
- error：内联错误块（图标 + 原因 + 重试按钮），区分"无数据"与"加载失败"

---

## 1. 视觉主题与氛围

- **品牌哲学**：体育本应阳光、清晰、可信。以"深橙"作为行动色承载主按钮、激活态与关键数据；中性面用暖白纸面 + 暖灰文字，保持 Apple 式克制留白但偏暖。
- **视觉基调**：暖、清晰、紧凑、克制。
- **关键词**：暖白纸面 / 暖灰文字 / 深橙重音 / 分隔线分组 / 大数字层级 / 零渐变文字 / 零霓虹。
- **光影**：无重投影，统一"1px 细边框 + 单层极轻阴影"；卡片表面为纯白；强调渐变仅用于家长端 Hero 主卡（一处），管理端不用渐变。

---

## 2. 配色体系

### Primary（深橙主色，来自方向 A，但按 variance 3 沉降饱和度）
| 角色 | HEX | CSS 变量 | 场景 |
|------|-----|----------|------|
| Primary | `#EA580C` | `--primary` | 主按钮、激活态、链接、关键数字、tab 激活 |
| Primary Strong | `#C2410C` | `--primary-hover` | hover、按下、深橙强调 |
| Primary Light | `#FB923C` | `--primary-light` | 渐变末端、浅橙元素 |
| Primary BG | `#FFF4ED` | `--primary-bg` | 选中行、浅标签底、聚焦光圈底 |
| Primary Line | `rgba(234,88,12,0.30)` | `--primary-glass` | 聚焦边框、浅标签边 |
| Primary Gradient | `linear-gradient(135deg,#FB923C 0%,#EA580C 100%)` | `--primary-gradient` | **仅家长端会员/Hero 主卡一处**，管理端禁用 |

> 说明：旧版苹果蓝 `#3B82F6` 全量替换为 `#EA580C`；`#2563EB`→`#C2410C`；`#60A5FA`→`#F97316`；`#EFF6FF`→`#FFF4ED`。

### Secondary（班级/分组暖辅色——区别于主橙的同系暖色）
| 角色 | HEX | 场景 |
|------|-----|------|
| Amber | `#D97706` | 班级/分组图标底、班徽（白图标在上） |
| Amber BG | `#FEF3C7` | 班级标签浅底 |

> 旧版游离鼠尾草绿 `#A8D5BA` 全量替换为 `#D97706`（班级图标底）。暖色系内双色（橙=行动 / 琥珀=班组），不引入冷色，杜绝色温分裂。

### Semantic（语义色，暖调和谐）
| 角色 | HEX | 变量 | 场景 |
|------|-----|------|------|
| Success | `#16A34A` | `--success` | 成功、已签到、正常、在读 |
| Warning | `#D97706` | `--warning` | 提醒、待处理、即将到期（与琥珀同色，语义复用） |
| Danger | `#DC2626` | `--danger` | 错误、缺课、删除、退费 |
| Info | `#6B7280` | `--gray-6` | 中性信息 |

### Neutral（暖灰阶——从冷灰切换到暖灰 Stone 系，根治色温分裂）
| 角色 | HEX | 变量 | 场景 |
|------|-----|------|------|
| Page BG | `#F8F8F6` | `--page-bg` / `--bg` | 页面背景（净底微暖，2026-08-21 去橙黄底） |
| Surface / Card | `#FFFFFF` | `--card` | 卡片、弹层表面 |
| Gray-1 | `#F4F4F2` | `--gray-1` | 最浅暖灰（行底、分隔） |
| Gray-2 | `#ECEBE8` | `--gray-2` | 浅暖灰 |
| Gray-3 | `#E0DFDB` | `--gray-3` | 边框暖灰 |
| Gray-4 | `#B8AE9E` | `--gray-4` | 占位图标灰 |
| Gray-5 | `#8C8270` | `--gray-5` | 次要文字、caption |
| Gray-6 | `#6B6253` | `--gray-6` | 辅助正文 |
| Gray-7 | `#4A4438` | `--gray-7` | 正文 |
| Gray-8 | `#332E25` | `--gray-8` | 主要文字 |
| Gray-9 | `#241F17` | `--gray-9` | 标题 |
| Gray-10 | `#1A1610` | `--gray-10` / `--black` | 最深文字 |
| Line | `#E7E6E2` | `--line` | 所有 1px 边框（暖） |

### Shadow（极轻，染暖色调）
| 角色 | 值 | 变量 |
|------|-----|------|
| sm | `0 1px 2px rgba(60,40,15,0.05)` | `--shadow-sm` |
| md | `0 2px 8px rgba(60,40,15,0.06)` | `--shadow-md` |
| lg | `0 8px 24px rgba(60,40,15,0.08)` | `--shadow-lg` |
| primary | `0 1px 2px rgba(234,88,12,0.22)` | `--shadow-primary` |
| hero | `0 8px 20px rgba(234,88,12,0.18)` | `--shadow-hero` |

---

## 3. 字体与排版（来自方向 B——保持现状字阶，只清理游离值）

- **Font Family**：`-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Plus Jakarta Sans', 'Noto Sans SC', 'PingFang SC', 'Helvetica Neue', sans-serif`
- **数字**：一律 `font-variant-numeric: tabular-nums`；大数字可叠 `font-feature-settings: "tnum"`。
- **字重只用 4 级**：400 / 500 / 600 / 700。禁止 800+。
- **行高 token（按角色）**：`--leading-none`(1，大数字) / `--leading-tight`(1.2，大标题) / `--leading-snug`(1.3，小标题) / `--leading-normal`(1.5，正文) / `--leading-relaxed`(1.6，长文)。3+ 行包裹文本 ≥1.4。优先用 token，禁硬编码游离行高。
- **字间距 token（按字号）**：`--tracking-tightest`(-0.04em，超大数字) / `--tracking-tighter`(-0.02em，大标题/大数字) / `--tracking-tight`(-0.01em，中标题/数字) / `0`(正文，无字距) / `--tracking-wide`(0.05em，小标签/副标题) / `--tracking-wider`(0.12em，眉批/大写小标签)。禁 px 单位字间距、禁游离 em 值。

| 级别 | 字号 | 字重 | 用途 |
|------|------|------|------|
| Hero | 28px | 700 | 首页大数字 |
| Display | 20px | 700 | 页面主标题 |
| Title | 17px | 600 | 卡片标题、区块标题 |
| Subtitle | 16px | 600 | 次级标题 |
| Body | 15px | 400 | 正文 |
| Sub | 14px | 400 | 辅助说明 |
| Caption | 13px | 400 | 标签、注脚 |
| Tag | 11px | 500 | 徽标、状态标签 |
| Num | 18px | 700 | 数字突出（tabular） |
| Input | 16px | 400 | 表单输入（防 iOS 放大） |

> 旧 body 15px 裁决：**保留 15px**（与家长端正文阅读匹配），Web 后台仍用 14px（高密度工具）。

---

## 4. 布局与细节（来自方向 C——分隔线式编辑排版）

### 4.1 间距系统
4px 基数：`4/8/12/16/20/24/32/40`（`--s1`~`--s8`）。组件内外距一律取自该体系。density 10 下，行内距偏紧凑（卡片内距默认 16px，非 20px），区块间距 16-20px（非 24+）。

### 4.2 分组方式（C 方向核心）
- **默认用分隔线 + 留白分组**，不堆卡片：列表项用 `border-bottom: 1px solid var(--line)`；同级内容用 `divide-y`。
- **仅在需要 z 轴层级时用卡片**：弹窗、抽屉、浮层、Hero 主卡。内容列表区尽量不套卡片。
- 卡片标准：白底 + 1px 暖边框 + 12px 圆角 + `--shadow-sm` + 内距 16px。

### 4.3 编辑式层级（C 方向招牌）
- **大数字 + 小标签**：关键数据用 28-46px 数字 + 11px 大写小标签（letter-spacing 0.08em），替代"卡片标题 + 描述"的老套。
- **左对齐时间列**：列表行用左侧固定宽时间列 + 竖线 + 右侧内容（schedule/list 通用）。
- **非对称留白**：标题区允许左对齐 + 右侧 meta，不强制居中。
- **区块标题**：13px / 700 / letter-spacing 0.12em / `--gray-5`，前置 3px 暖橙竖条（可选）。

### 4.4 圆角/阴影/图标
- 圆角见 §0.3。
- 阴影只取 sm/md/lg/hero，禁止 `0 10px 30px` 重投影。
- 图标：1.5-1.8px 线性描边，`currentColor`；班级/分组用面性琥珀块（白图标在上）。无 emoji（正文禁用）。

---

## 5. 交互与信息架构

### 5.1 双端差异（统一语言微差异）
两端共用同一套 token 与组件规范；差异仅在：
- **家长端**：允许 Hero 渐变主卡（一处）、大数字更突出、圆角偏大（16px）、密度略松（density 8）。
- **管理端**：禁用渐变、白卡 + 暖橙强调、密度最高（density 10）、控件 6px 圆角、表格/列表分隔线为主。

### 5.2 操作路径原则
- 核心动作 ≤2 步可达；危险操作必须二次确认（弹窗或输入关键词）。
- 列表项点击进详情，详情内做编辑；不在列表行内嵌复杂表单。
- 底部 tabbar 4 项固定（家长：首页/活动/积分/我的；员工：首页/成员/工作台/我的）。

### 5.3 反馈
- :active 即时 `transform: scale(0.97)`（100-160ms）。
- 加载/空/错三态齐备（见 §0.4）。
- Toast 居中底部，3s 自动消失。

---

## 6. 组件规范

### Buttons（6px 圆角，非全胶囊；主按钮家长端可渐变、管理端纯色）
- **Primary**：家长端 `linear-gradient(135deg,#FB923C,#EA580C)`；管理端纯 `#EA580C`；白字；高 44px；圆角 6px；`--shadow-primary`；`:active scale(0.97)`。
- **Secondary**：白底 + 暖边框 `--line` + 暖灰文字 `--gray-8`；圆角 6px。
- **Ghost/Text**：无背景，文字 `--primary`；:active 浅底 `--primary-bg`。
- **Danger**：浅底红字 `--danger-bg` + `--danger`；或纯 `--danger` 白字。
- **禁用**：`opacity: 0.4`；无阴影。

### Cards
- 白底 + 1px `--line` + 12px 圆角 + `--shadow-sm` + 内距 16px + `overflow:hidden`。
- 列表区尽量不用卡片，改用分隔线行（见 §4.2）。

### Inputs
- 1px 暖边框 + 6px 圆角 + 白底；聚焦 `box-shadow: 0 0 0 1.5px var(--primary-glass) inset, 0 0 0 4px var(--primary-bg)`；placeholder `--gray-5`；移动端 16px。

### List Rows（C 方向招牌）
- `display:flex; align-items:center; padding:12px 0; border-bottom:1px solid var(--line)`。
- 左侧固定宽列（时间/图标/序号）+ 竖线 + 右侧主内容。
- 末行 `border-bottom:none`。

### Tags / Badges
- 圆角 4px；padding 2px 8px；11px/500；语义底色 + 同色字（success/warning/danger/primary/gray 各一套浅底）。

### Navigation
- 小程序导航栏背景 `#F8F8F6`（净底微暖），文字黑；底部 tabbar 激活 `--primary`。
- tabbar 底色暖白 `rgba(250,247,242,0.98)`（修复旧冷灰/暖残留混杂）。

### Modals / Sheets
- 底部 sheet：白底 + 顶部 12px 圆角 + `--shadow-lg`；遮罩 `rgba(26,22,16,0.18)`。
- 居中 dialog：白底 + 12px 圆角 + 边框 + 无外投影。

---

## 7. Do's and Don'ts（反 AI 味硬约束）

**Do's**
- 主色只用暖橙 `#EA580C` 系；激活/强调/主按钮统一它。
- 班级/分组用琥珀 `#D97706` 系；与主橙同暖系，不混冷色。
- 所有颜色走 token 变量；svg-icon 的 color 属性用具体 HEX（`#EA580C`/`#D97706`/`#16A34A` 等），集中常量管理。
- 列表分组用分隔线 + 留白，少套卡片。
- 大数字 + 小标签做层级，不靠字号堆砌。
- 文案具体、给下一步；数据用有机值（24/40、8/12、2027.03.15）。

**Don'ts（反 AI 味）**
- ❌ 紫蓝渐变光晕、霓虹外发光、大标题渐变文字（text-fill 渐变）。
- ❌ 纯黑 `#000000`；用 `#1A1610` 暖黑。
- ❌ 过饱和重音色（饱和度 > 85% 的荧光色）。
- ❌ 三等分卡片横排、每个区块都加 eyebrow 小标签眉批、编号式 meta-label（"SECTION 01"）。
- ❌ 全员玻璃拟态；backdrop-filter 只用于真正浮层语义。
- ❌ 斜体（中文 CJK 伪斜体丑陋）。
- ❌ emoji 入正文。
- ❌ 通用占位名（张三）、整数假数据（99.99%）、AI 文案陈词（赋能/无缝/释放/颠覆/革命性）。
- ❌ Element 默认蓝 `#409eff`、硬编码 `#303133/#606266` 绕开 token。
- ❌ `transition: all`；逐属性声明。`ease-in` 用于 UI；用 `cubic-bezier(0.16,1,0.3,1)`。
- ❌ 从 `scale(0)` 入场；从 `scale(0.95)+opacity:0` 起。
- ❌ UI 动效 > 300ms；无 `prefers-reduced-motion` 兜底。
- ❌ 移动端输入 < 16px。

---

## 8. 响应式

- 小程序以 px 为单位（非 rpx），统一 px 设计系统；适配 `safe-area-inset-bottom`；触控目标 ≥44px。
- 底部留白 `calc(88px + safe-area-inset-bottom)` 避开 tabbar。
- Web 断点：mobile `<768px`、tablet `768-1024`、desktop `>1024`；侧栏 `<768` 收抽屉。

---

## 9. Motion 哲学（motion=3，极简）

- 仅保留 :active 反馈与轻过渡；入场用克制 `fade`（0.2s，`cubic-bezier(0.16,1,0.3,1)`）。
- 时长令牌：`--dur-fast`≈0.12s / `--dur-base`≈0.2s；曲线 `--ease-out: cubic-bezier(0.16,1,0.3,1)`。
- 高频操作（tab 切换、列表滚动）不加动画。
- **必须** `@media (prefers-reduced-motion: reduce){ animation:none; transition:none }`。

---

## 10. Agent Prompt Guide（AI 代理提示）

**Quick Reference**：主色 `#EA580C`（暖橙）、班级色 `#D97706`（琥珀）、纸面 `#F8F8F6`（净底微暖）、暖灰文字、卡片白底暖边框、极轻暖调阴影、圆角统一（控件 6 / 容器 12 / 微小片 4 / 圆形 full）、分隔线式列表、大数字+小标签、动效 ≤200ms、拨盘 3/3/10。

**Component Prompts**
1. 主按钮（家长端渐变 / 管理端纯色）：暖橙、白字、44px 高、6px 圆角、按下 scale(0.97)。
2. 卡片：白底、1px 暖边框、12px 圆角、极轻暖阴影、内距 16px。
3. 输入：1px 暖边框、6px 圆角、聚焦暖橙光圈、移动端 16px。
4. 列表行：分隔线分组、左固定列 + 竖线 + 右内容、padding 12px 0。
5. 状态标签：4px 圆角、浅底同色字、11px/500。
6. 班级图标：琥珀 `#D97706` 面性块 + 白图标。

**Iteration Guide**
- 改色只改 token 源头（`variables.wxss` 的 `--primary` 等 + svg-icon color 常量），组件只引用变量。
- 任何新页面 `@import variables.wxss`，禁止另起调色板。
- 完成即 `node check-compile.mjs` 校验。
- 提交前自检：三态齐全 / 全走 token / 无重投影 / 无渐变文字 / 无 emoji / 输入 ≥16px / 有 reduced-motion。

---

## 11. v2.1 潮流进阶层（Editorial Advance）

> 目的：在 v2 反 AI 味硬约束之上，回应"毛玻璃 / 环境渐变 / 微交互 / 不对称布局 / 大胆字体对比 / 错落 bento / 视觉冲击"的诉求。
> 落地面：仅登录页、家长首页、管理首页三处旗舰展演页。其余页面保持 v2 基线。

### 11.1 调和策略（品牌护城河不动，抬高表达天花板）
v2 已具备：液态玻璃底部栏 `.bottom-bar`、编辑式大数字 `.edia-num`(52px)、非对称留白、`:active scale(0.97)`。v2.1 把"突破"落到 v2 缺的表达手段，且**不豁免任何 §7 硬约束**：

1. **环境渐变网格（surface 层，非 text）**：暖橙 / 琥珀 / 奶白三色 soft radial mesh 作背景肌理，替代纯 `#F8F8F6` 平面。明确豁免 §7 的"紫蓝渐变光晕 / 霓虹"——仅限**暖调**、低透明度（≤0.12）、**仅用于 surface 背景**，绝不用于文字或图标着色。
2. **浮动玻璃景深**：真正"浮"在 mesh 之上的卡片用 `backdrop-filter: blur()` + 半透明白 + 1px 高光描边 + 软阴影。克制：仅 Hero 主卡 / 关键数据卡 / 底部操作栏，不泛用（仍守 §7"不全员玻璃拟态"）。
3. **编辑式超大刊头字**：在 v2 46px 刊头基础上新增 `--font-display-xl`（52–64px tabular 数字 / 刊头），保持无衬线 + 半透明副标题，制造字重 700↔400 的层级对比（"大胆字体对比"的正解，而非堆字号）。
4. **错落 bento 网格**：非对称多尺寸单元格。**非** §7 禁的"三等分等宽卡片"——用 2 列 grid，单元格跨行跨列不等（如 2:1、1:1+1:2），制造错落层次。
5. **克制微交互**：tap spring（`scale(0.97)→1` + `--ease-spring`）、滚动错落入场（fade + `translateY(8px)`，≤280ms，阶梯 delay）、关键 CTA 磁吸高光。全部 ≤300ms 且 `prefers-reduced-motion` 关闭。

### 11.2 v2.1 新增 Token（写入 `variables.wxss`）
```css
--font-display-xl: 52px;                       /* 刊头 / 超大数字（展演页可放大到 64px） */
--mesh-1: rgba(234, 88, 12, 0.10);             /* 环境渐变停点：暖橙 */
--mesh-2: rgba(217, 119, 6, 0.08);             /* 环境渐变停点：琥珀 */
--mesh-3: rgba(255, 244, 237, 0.85);           /* 环境渐变停点：奶白柔光 */
--shadow-float: 0 12px 32px rgba(60, 40, 15, 0.10);
--shadow-float-hover: 0 18px 44px rgba(60, 40, 15, 0.14);
--dur-reveal: 280ms;                           /* 错落入场时长（≤300ms） */
/* --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1); 已存在 */
```

### 11.3 v2.1 新增工具类（写入 `app.wxss`）
- `.ambient`：环境渐变网格底（`position:absolute; inset:0; pointer-events:none`），由多个 `radial-gradient` 暖色球叠加。
- `.orb`：浮动光球（绝对定位的柔和暖色 radial 圆，pointer-events none），用于刊头右侧 / 卡角装饰。
- `.float-card`：浮动玻璃卡（半透明白 + `backdrop-filter:blur(16px)` + 1px 高光描边 + `--shadow-float`）；`:hover/:active` 抬升至 `--shadow-float-hover`。不支持 blur 的环境降级为 `.glass`（半透明白实底）。
- `.display-num`：超大 tabular 数字（继承 `.edia-num`，可在展演页放大到 `--font-display-xl`）。
- `.kicker`：大写宽字距小标签（纯文字，不编号）——替代 §7 禁的"编号式 meta-label"（如"SECTION 01"），仅作语义眉批。
- `.bento`（容器）/ `.bento-2`（2 列）/ `.bento-cell` / 跨列修饰 `.span-2` `.tall`：错落网格。
- `.tap-spring`：`:active` 用 `--ease-spring` 回弹（替代干瘪 `scale(0.97)`）。
- `.reveal` / `.reveal-1..6`：滚动错落入场（fade + `translateY(8px)` + 阶梯 delay）；含 `@media (prefers-reduced-motion: reduce){ .reveal* { animation:none; opacity:1; transform:none } }`。

### 11.4 硬约束（v2.1 不豁免，与 v2 §7 完全一致）
无渐变文字（text-fill）/ 无霓虹 / 无紫蓝光晕 / 无 emoji 入正文 / 无整数假数据 / 4 半径 / 4 字重 / 输入 ≥16px / 动效 ≤300ms + reduced-motion。

### 11.5 落地面（已落地 / 计划）
- 登录页 v10：非对称刊头（左刊头 + 右浮动光球）+ 浮动玻璃凭证卡 + 动态氛围球（见 `pages/login`）。
- 家长 / 管理首页：bento 仪表盘 + 进度环 + 错落入场（见 `pages/index`）。
