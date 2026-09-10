# 测试与验收指南

> 面向开发者 / 部署者：改代码后或部署完成后，按本文验证系统各环节正常。
> 日常使用问题请看 `使用手册.md` 与 `docs/常见问题FAQ.md`。

## 前置条件

| 工具 | 要求 |
|------|------|
| Node.js | >= 18（推荐 20+） |
| Chrome / Chromium | Web 审计套件需要（Playwright 驱动，仅第三步用到） |

## 第一步：启动系统

```bash
cd <你的项目目录>
bash start-all.sh
```

脚本自动：安装缺失依赖 → 初始化并填充数据库（如首次） → 构建管理端 → 启动后端（`http://localhost:3001`）。

## 第二步：核心回归（必跑，3 条命令）

| 命令 | 覆盖 | 预期 |
|------|------|------|
| `node smoke-test.mjs` | 39 项接口断言（登录/看板/成员/订单/排期/报名/请假/沟通/反馈/权限） | 39 通过 / 0 失败 |
| `node backend/tests/full-system.test.js` | 后端全量回归（隔离测试库，不污染你的数据） | PASS 256 / FAIL 0 |
| `cd web-admin && npx vite build` | 管理端构建 | 无报错 |

> 后端测试使用独立临时数据库副本，无需先启动服务，也不会动 `backend/db/data.db`。

## 第三步：扩展验收套件（可选，`npm run verify`）

`tools/verify-all.mjs` 汇总约 20 个套件（业务剧本、双计费模式、多孩报名、薪资计算、退款边界、Web 角色权限等）。

**前置**：需后端已运行在 `:3001`（`bash start-all.sh`）；部分 Web 套件依赖 Playwright：

```bash
npm install -g playwright && npx playwright install chromium
```

单跑某一套件：`node tools/<套件名>.mjs`（如 `node tools/refund-test.mjs`）。

### 深浅色主题回归（改了样式必跑）

```bash
CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  node tools/dark-mode-audit.mjs --theme dark    # 预期：亮色像素占比 ≤ ~6%（彩色控件），0 console 错误
node tools/dark-mode-audit.mjs --theme light     # 预期：亮色像素占比高、无 console 错误
```

报告与截图落在 `tools/uitest/dark-audit*/`。

## 第四步：人工验证 Web 管理端

1. 打开 `http://localhost:3001`
2. 管理员登录：手机号 `13800000001` / 密码 `123456`（示例数据）
3. 逐页检查：工作台 → 排课 → 签到 → 成员 → 班级 → 销售 → 请假 → 家长沟通 → 反馈 → 员工 → 设置
4. 顶栏切换 跟随系统 / 浅色 / 深色 三档，逐页确认无违和色块
5. 重点交互：新建排期（含重复规则）、新建销售单（确认后会员卡自动激活）、会员卡暂停/恢复、请假审批、单发家长通知、导出（弹窗二次确认）

## 常见问题排查

| 现象 | 处理 |
|------|------|
| 登录提示频繁 | 登录限流 100 次/15 分钟、全局限流 200 次/分钟，重启后端即复位 |
| 数据混乱想重置 | 删除 `backend/db/data.db*`，重新 `node backend/db/init.js && node backend/db/seed.js` |
| 依赖安装失败 | `better-sqlite3` 需编译环境：macOS 装 Xcode CLT（`xcode-select --install`），Linux 装 `build-essential python3` |

## 详细文档

- 使用手册：`使用手册.md`
- 常见问题 FAQ：`docs/常见问题FAQ.md`
- 上线说明：`部署上线说明.md`
- 设计规范：`DESIGN.md`
