# CONVENTIONS.md — 星课小程序工程约定

> 与 `DESIGN.md`（设计系统）互补：本文收口工程层约定（命名/目录/状态/注释/层级/提交），DESIGN.md 收口视觉层规范。
> 新建页面、新增组件、修改样式前请先对照本文。

---

## 1. 命名约定

### 1.1 页面命名
- `admin-` 前缀 = 管理端页面（如 `admin-students`、`admin-schedule`）。
- 无前缀 = 家长端页面（如 `schedule`、`membership`、`points`）。
- 公共页 = `common` 域或无业务前缀（如 `login`、`agreement`）。
- 功能态后缀：`-detail`（详情）、`-edit`（新增+编辑表单）、`-log`（记录列表）。
- **禁止**用 `-new`/`-old`/`-v2` 表版本（如 `admin-schedule-new` 应改名 `schedule-edit`，待执行）。

### 1.2 CSS token 命名
- 单一前缀体系：时长统一 `--dur-*`（`--dur-fast`/`--dur-base`/`--dur-reveal`）；`--duration*` 为兼容别名，新代码用 `--dur-*`。
- 圆角：`--r-control`(6)/`--r-md`(8 输入)/`--r-sm`(4)/`--r-lg`(12)/`--r-full`(圆形)；`--r-xl` 等价 `--r-lg` 兼容别名。
- 阴影：`--shadow-sm/md/lg/primary/hero/float`；`--shadow-btn` 是 `--shadow-primary` 别名。**禁止**再造同值 token。
- z 层级：`--z-base/dropdown/sticky/bar/overlay/toast`，**所有 z-index 走 token，禁止硬编码**（存量 40+ 处渐进迁移中）。

### 1.3 类命名
- canonical 共享类见 `app.wxss`（`.card/.btn-primary/.edia-*/.empty/.empty-tip/.page-error/.page-loading/.bottom-bar/.head-row/.section-title` 等）。
- **禁止**各页自创同义类（如自创 `.empty-tip`，已收口至 app.wxss）。
- 修饰类用 `--xxx`（如 `.card-tappable`、`.edia-num.accent`），不用 `_xxx`。

---

## 2. 目录结构

```
miniprogram/
  app.js / app.json / app.wxss          # 全局入口与 canonical 样式
  config.js / local-config.js          # 环境配置
  styles/variables.wxss                # 设计 token 单一源头
  styles/icons.wxss                    # 图标库
  components/                          # 全局组件（class-card / svg-icon / role-tab-bar）
  utils/                               # 工具
    core/ (规划)                        # 基础设施：request/api、storage、format
    biz/  (规划)                        # 业务：terms、workbench
  pages/                               # 页面（规划按域分子目录）
    parent/  (规划)                    # 家长端
    admin/   (规划)                    # 管理端
    common/  (规划)                    # 公共（login/agreement）
  custom-tab-bar/                      # 自定义 tabbar
```
> 当前 `pages/` 扁平，规划按域分 `parent/admin/common`，迁移时分批改 `app.json` + `navigateTo` 引用。

---

## 3. 状态分层

| 层 | 位置 | 存什么 | 生命周期 |
|----|------|--------|----------|
| 内存态 | `app.globalData` | 用户信息、角色、学生切换、terms 缓存 | 会话级，重启清空 |
| 持久态 | `wx.storage` | token、openid、userInfo、terms 缓存 | 跨会话 |
| 页面态 | `Page.data` + `setData` | 列表、表单、loading/empty/error 三态 | 页面级 |

- 角色态单一来源：页面读 `app.getRole()` 而非各自维护 `data.isStaff`（待落实）。
- terms 接入规划用 `Behavior` 自动注入 `T`，消除每页手写 `setData({T})` 样板（待落实）。

---

## 4. 三态强制（loading / empty / error）

- `request`（`utils/api.js`）失败回吐结构化错误：网络层 `{ code:'NETWORK', message, ...raw }`，业务层 `{ code, message, data }`。
- 页面 `catch` **必须**显式处理：网络失败 → `setData({ loading:false, error:true })` + 渲染 `.page-error` + 重试按钮（`.btn-secondary.pe-btn`）；请求成功但空 → `.empty`。
- **禁止** catch 后静默 `records:[]` 把"加载失败"伪装成"暂无数据"。
- canonical 结构：`wx:if=loading` → `wx:elif=error` → `wx:elif=空` → `wx:else=列表`。

---

## 5. 注释规范

- 公共函数用 JSDoc（`@param`/`@returns`）。
- 复杂业务逻辑注释"为什么"而非"做什么"。
- 文件头标 `@file`/`@module`/`@since`（如 variables.wxss v2.1 token 标 `@since v2.1 旗舰页`）。
- **删除**过程性注记（"学习 prompt"/"借鉴 editorial showcase"/"B: 统一"等开发期标记），保留功能说明。
- `app.wxss` 分区注释保留，但去临时标记。

---

## 6. 渐变治理（DESIGN §5.1/§6 强制）

- **唯一允许渐变**：家长端会员主卡（`member-detail` `.hero-card`）+ 家长端 `points` 积分余额卡（2026-09-07 设计打磨轮经批准保留）；`schedule-detail` `.btn-pill-primary` 为家长端渐变按钮。
- 管理端**全部禁渐变**：`staff-home`/`workbench`/`admin-dashboard` 等的 hero 卡改 `.card` + 主色/琥珀图标块 + 深色数字。
- 工具页（`leave`/`feedback`）删渐变标题条，改 `.head-row`/`.head-title` 或 `.card` + 主色图标块。
- `.btn-primary` 已为纯色 `--primary`（2026-09-08 核实，原「全局渐变待分端」描述过时）；`.hero-card` 为全局唯一渐变卡类。

---

## 7. z-index 渐进迁移

存量硬编码（40+ 处）按语义映射到 token：
- `z-index: 1`（内容层叠）→ 保留或 `--z-base`
- `z-index: 10/20/100`（sticky/dropdown）→ `--z-sticky`/`--z-dropdown`
- `z-index: 1000`（picker 遮罩/模态）→ `--z-overlay`
- `z-index: 9000/9999/10000`（固定栏/弹层）→ `--z-bar`（固定栏）或 `--z-overlay`（模态）
- toast → `--z-toast`

---

## 8. 提交与验证

- 改动后必跑 `node check-compile.mjs`（48 wxss + 全部 WXML）。
- 后端改动跑 `node --check` 各文件 + 冒烟。
- 非 trivial 改动写 Agent Note（改了什么、为什么、验证结果）。
- 涉及产品取舍以 DESIGN.md / 本文档为准；冲突时先标注再决策，勿擅自改方向。

---

## 待落实清单（优先级降序）

> 2026-09-08 复核更新：勾选已完成项、修正与代码事实漂移的条目（详见各项内注记）。

- [x] P1 `index` 员工死分支删除 —— **已完成 2026-09-07**（任务§3 有完成记录，`isStaff` 员工分支全清）
- [x] P1 `.card:active` 拆 `.card-tappable` + 全站可点卡片补类 —— **已完成 2026-09-07**（任务§5，14 处可点卡补类）
- [x] P1 `profile` 渐变精细调色 —— **前提已失效，关闭**：profile 家长端合并卡 `.combined-bg` 现为纯色 `--primary`（非渐变），员工卡 `.profile-hero` 为白底 `.card`；无需逐项调色
- [x] P2 `.btn-primary--solid` 分端机制 + 管理端主按钮迁移 —— **前提已失效，关闭**：`app.wxss` `.btn-primary` 现已是纯色 `var(--primary)`（非渐变），管理端无需再拆 solid 变体；渐变按钮仅剩家长端 `schedule-detail` 的 `.btn-pill-primary`（家长端允许）
- [x] P2 `admin-schedule-new` → `schedule-edit` 重命名 —— **已完成 2026-09-07**（任务§4，全站旧路径 0 残留）
- [x] P2 打磨项（任务§6）—— **已完成 2026-09-07**（10 子项；growth-record 教练头像与 feedback 回复两项因后端无数据/无字段转产品待办）
- [ ] P3 分包（管理端拆 subPackages）、`Behavior` 封装 terms、`pages/` 域分目录
- [ ] P3 DESIGN.md 扩充：Toast/Picker/Skeleton/Tab/Search/Confirm 组件规范、暗色模式接口、a11y 基线、性能预算、图片规格、多机构换肤、CHANGELOG
- [x] 产品待办：feedback 机构回复闭环 —— **已完成 2026-09-08**：迁移 `010_feedback_reply.js`（feedback 表补 `reply`/`reply_at`/`replied_by` 列）+ `PUT /api/feedback/:id/reply`（回复置 done，空回复撤回回 pending）+ web-admin 反馈详情回复框 + 小程序 `feedback.js` 条件渲染（本就在位）。隔离库端到端验证：提交→回复→家长回读→撤回全通过；全量回归 PASS 256/FAIL 0
- [ ] 产品待办：growth-record 教练头像（`teachers.avatar` 列已存在但全空、无上传路径；点评表 `coach_id` 现网 7 条全为空值）
