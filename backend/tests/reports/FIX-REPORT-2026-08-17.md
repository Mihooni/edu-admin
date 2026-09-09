# 逻辑审计修复报告（P1 适用项 + P2 全量）

- **日期**：2026-08-17
- **范围**：依据 `LOGIC-AUDIT-2026-08-18.md`，按优先级补齐修正
  - 已修复：**P1-2 / P1-3 / P1-4 / P1-5 / P1-6**（P1-1 微信支付回调经用户确认**不参与本次**，因"线上支付不需要做"）
  - 已修复：**P2-1 ~ P2-9**（全部 9 项）
  - 延后：**P3-1 ~ P3-11**（审计定性"非阻断，择机修复"，且 P3-10 已在 P1-3 一并修复）
- **回归结果**：
  - 全功能系统测试 `full-system.test.js`：**PASS 256 / FAIL 0 / WARN 1**（与改动前基线一致，无回归）
  - 新增针对性回归 `p2-fixes.test.js`：**PASS 14 / FAIL 0**

---

## 一、P1 适用项（上一轮已完成，本轮仅记录）

| 项 | 文件 | 根因 | 修复 |
| --- | --- | --- | --- |
| P1-2 QR 可伪造 | `students.js` | qrcode 仅 `id` 编码，默认密钥下可重放 | 引入 `nonce + 60s TTL + sha256(id:nonce:exp:JWT_SECRET)` 前 16 位；`qr_exp` 列落地 |
| P1-3 db-restore 覆盖鉴权表 | `settings.js` | restore 可覆盖 `users/settings` | 新增 `FORBIDDEN` 白名单跳过受保护表；备份失败清理临时文件（同时修 P3-10） |
| P1-4 教练点名越权 | `checkin.js` | 未校验排期归属教练 | 增加 `teacher_id === openid` 或 `phone→teacher` 归属校验，否则 403 |
| P1-5 家长误绑 | `auth.js` | 按姓名绑定可绑陌生人孩子 | 改 `memberNo` 精确绑定 + 10min 内 ≥10 次失败限流 |
| P1-6 支付/退款并发竞态 | `orders.js` | 非原子导致双赠/超额退款 | `/pay` 用 claim 式事务行锁；`/refund` 用乐观锁 `WHERE refunded_amount=:old` |

---

## 二、P2 全量修复（本轮）

### P2-1 请假↔考勤状态未对齐
- **文件**：`backend/routes/leave.js`
- **根因**：请假审批时 `if(!existing)` 跳过插入，但 `auto-absent` 已将学员标 `absent` 后审批仍执行 `applyLeaveDeduction` → 既算缺席又扣课；且 `apply` 在已有任意考勤（含 `absent`）时一律拒绝补请假。
- **修复**：
  1. `apply` 仅拦截 `present/late/leave`，`absent` 允许补请假；
  2. `approve` 对已存在 `absent` 考勤执行 `UPDATE → leave`（不再重复插入）；
  3. `applyLeaveDeduction` 增加 `leave_deduction_logs`（UNIQUE(schedule,student)）幂等守卫，且仅在 `!existing || existing.status==='absent'` 时扣课；
  4. 扣课路径写入 `leave_deduction_logs`，杜绝重复扣减。
- **验证**：`p2-fixes` — 缺席转请假、扣课仅一次(-1)、已签到不可请假 全部 PASS。

### P2-2 学员删除未级联（留孤儿数据）
- **文件**：`backend/routes/students.js`（`DELETE /:id`）
- **根因**：仅置 `status='refunded'`，未解绑 `parent_bindings`，家长端仍可见已退费成员。
- **修复**：删除改为事务内「归档 + `DELETE FROM parent_bindings WHERE student_id=?`」，与 `admin.js` 课程删除级联风格一致。

### P2-3 导入非事务 + 会员编号整体重排
- **文件**：`backend/routes/students.js`（`POST /import`）
- **根因**：每行直接插入、无事务，中途失败留脏数据；`member_no` 缺口回填从 `NO-0001` 整体重排，覆盖已有编号。
- **修复**：整批包进 `db.transaction`（任一行失败整体回滚）；缺口回填改为「从现有最大 `NO-####` 续编」，保留已有编号。

### P2-4 私信标记已读越权
- **文件**：`backend/routes/messages.js`（`PUT /:id/read`）
- **根因**：`UPDATE status='read' WHERE id=?` 不校验 `user_id`，任意登录用户可标记他人消息已读。
- **修复**：补充 `user_id` 归属校验，非接收人返回 403。

### P2-5 试听公开接口可刷
- **文件**：`backend/routes/trial.js`（`POST /apply`）
- **根因**：公开接口无独立频控，可无限提交。
- **修复**：按手机号 1 小时内最多 5 次（内存 `Map` 固定窗口），超限返回失败。

### P2-6 线索转化重复发奖（可刷分）
- **文件**：`backend/routes/growth.js`（`leads/:id/convert`）
- **根因**：未校验 `status==='converted'`，重复调用反复加积分。
- **修复**：已转化直接返回业务失败，阻断重复发奖。

### P2-7 退卡金额按卡类型原价，口径不一致
- **文件**：`backend/routes/membership.js`（`POST /refund`）
- **根因**：退款按 `membership_cards.price`（列表价），忽略订单折扣/实付；与 `orders /refund` 双入口口径不一致。
- **修复**：优先取购卡订单 `items` 中对应 `itemId` 的实付 `price`，回退订单 `payable_amount`，再回退卡类型价；按实付 × 剩余比例计退。卡级 `status='refunded'` 守卫仍防重复退。

### P2-8 财务 by-product 退款全摊首个商品 + 收入失真
- **文件**：`backend/routes/finance.js`（`GET /by-product`）
- **根因**：退款全摊首个商品；`revenue` 用 `item.price*qty`（列表价）而非 `payable_amount`，与摘要净收入对不上。
- **修复**：收入按订单 `payable_amount` 依各项标价权重分摊；退款按订单行同权重分摊；结果四舍五入，`net = revenue - refunded`。

### P2-9 教师列表明文泄露手机号/薪酬规则
- **文件**：`backend/routes/admin.js`（`GET /teachers`）
- **根因**：`SELECT *` 向教练/销售回传完整记录含 `phone`、`pay_rule`。
- **修复**：非管理员响应中 `delete phone / pay_rule`，`payRule` 仅管理员解析返回；其余字段与关联角色/权限/排课数保持不变。

---

## 三、回归与验证

| 验证项 | 命令 | 结果 |
| --- | --- | --- |
| 全功能系统测试 | `PORT=3099 NODE_ENV=test node backend/tests/full-system.test.js` | 256 PASS / 0 FAIL / 1 WARN |
| P2 针对性回归 | `PORT=3098 NODE_ENV=test node backend/tests/p2-fixes.test.js` | 14 PASS / 0 FAIL |
| 语法校验 | `node --check` 全部改动文件 | 通过 |

前端（web-admin）与小程序未改动，既有构建/编译结果保持有效，无需重跑。

---

## 四、未覆盖与后续

- **P1-1 微信支付回调**：用户明确"线上支付不需要做"，不纳入本次。
- **P3（11 项）**：审计定性非阻断、建议下一迭代；其中 P3-10（临时文件泄漏）已在 P1-3 修复。建议作为独立低优批次处理，部分涉及业务决策（如 P3-2 家长改档案、P3-3 审批人记录、P3-5 出勤率口径）。
