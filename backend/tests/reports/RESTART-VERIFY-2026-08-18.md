# 后端重启与三角色冒烟验证报告

日期：2026-08-18
范围：应用 P1/P2 修复后的后端重启 + 三角色实时冒烟 + 回归确认

## 1. 重启结果

- 旧实例（PID 1681，加载旧代码）已优雅停止。
- 新后端已启动：**PID 15401**，监听 `http://localhost:3001`。
- 健康检查：`GET /api/health` → `{"code":0,"data":{"status":"ok"}}`。
- `backend.pid` 已更新为 15401。

## 2. 顺手根治的既有 bug：db/init.js 循环依赖

**现象**：`bash start.sh` 在"初始化数据库"步骤（`node db/init.js`）报
`TypeError: initDbSchema is not a function`（被 `| tail` 掩盖，不阻断 server 启动，但日志吓人）。

**根因**：`init.js` 的 `init(db)` 本就接收 db 参数（无逻辑循环），但其 `require.main === module` 直跑分支用
`const db = require('./index')` 取库，而 `index.js:28` 又 `require('./init')`。直跑 init.js 时，index.js 反向
require 回"尚未执行到 `module.exports`"的半初始化 init.js 模块（导出为空），导致 `initDbSchema` 为 `undefined`。

**修复**：`db/init.js` 直跑分支改为直接基于 `better-sqlite3` 建库（不再 require `index.js`），彻底打破循环。
`server.js → index.js → init(db)` 主链路不受影响（该分支仅在"直接 node db/init.js"时进入）。

**验证**：重启后 `start.sh` 第 3 步不再报错，第 5 步健康检查通过。

## 3. 三角色实时冒烟（真实 seed 数据，命中 3001 实例）

脚本：`backend/tests/live-smoke-3role.mjs`
结果：**26 通过 / 0 失败**

覆盖：
- 健康检查
- 管理员角色：看板 / 成员列表 / 排期 / 教师列表（P2-9 脱敏字段生效）
- 教练角色：课时统计 / 教练排期
- 家长角色：绑定成员 / 订单 / 通知
- 越权隔离：家长、教练访问 `/admin/dashboard` 均被正确拒绝（403）
- 请假业务链路（P2-1 approve 主路径）：管理员建排课 → 家长报名 → 家长请假 → 管理员审批
  → 校验 `GET /schedules/:id` 的 `students[].checkin_status === 'leave'`（确已生成 leave 考勤）

> 说明：seed 仅播种 管理员/教练/家长 三角色，**无销售角色账号**；销售角色的接口层覆盖由
> `full-system.test.js`（IDS.sales）承担。

## 4. 隔离回归（各自从当前源码拉起独立服务）

| 套件 | 结果 | 说明 |
|------|------|------|
| `backend/tests/p2-fixes.test.js` | **14 PASS / 0 FAIL** | P2-1 缺席→leave 转换 + 扣课幂等，及 P2-4~P2-9 针对性验证 |
| `backend/tests/full-system.test.js` | **256 PASS / 0 FAIL / 1 WARN（共 257）** | 与改动前基线完全一致，无回归 |

两套隔离测试同时验证了 `init.js` 改动未破坏服务启动链路（均正常 bootstrap 并通过）。

## 5. 已知遗留（既有、非致命，本轮未改）

- **启动备份失败**：`[Backup] 备份失败: backup.step is not a function`
  根因：当前 better-sqlite3 为 v11.10.0 预编译包，`db.backup()` 返回的对象**不含 `.step`/`.transfer`**
  （原生 backup API 在该构建中不可用）。`utils/backup.js:52-54` 的 `db.backup(filepath); backup.step(-1)`
  因此失败。不影响任何业务接口，服务照常运行。
  建议（二选一，需用户确认后实施）：
  1. 将 `createBackup` 改为 WAL 安全文件拷贝（同时拷贝 `data.db` + `data.db-wal` + `data.db-shm`）；
  2. 重编 better-sqlite3 以启用原生 backup API。
  此改动涉及数据备份语义，故未在本轮"重启+冒烟"范围内擅自修改。

## 结论

P1（除线上支付 P1-1）/ P2 全部修复已在运行中的后端生效，三角色实时冒烟与两套隔离回归全绿，
无功能回归。后端当前运行于 PID 15401，可正常使用。
