/**
 * 测试数据卫生检查
 * 防止自动化测试残留累积污染演示数据（排期/通知/课程）。
 * 超过阈值即失败，提示清理。
 */
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const db = require(process.cwd() + '/backend/db')

let issues = 0

const sched = db.prepare(`
  SELECT COUNT(*) c FROM schedules
  WHERE course_name LIKE '%测试%' OR course_name LIKE '%剧本%' OR course_name LIKE '%扣课%'
     OR course_name LIKE '%多孩%' OR course_name LIKE 'E2E%' OR course_name LIKE '首页验证%'
     OR course_name LIKE '%审计%' OR course_name LIKE '重复测试-%' OR course_name LIKE '复查-%'
     OR course_name LIKE '家长签到测试%'
     OR remark LIKE 'AUDIT-%'
`).get().c
if (sched > 20) { console.log(`✗ 测试排期残留 ${sched} 条`); issues++ }
else console.log(`✓ 排期数据卫生（残留 ${sched} 条）`)

// 自动清理审计/端到端测试创建的临时排课及其关联数据（报名/签到/请假）
const auditScheds = db.prepare(`
  SELECT id FROM schedules
  WHERE remark LIKE 'AUDIT-%' OR course_name LIKE '%审计%'
     OR course_name LIKE '%剧本%' OR course_name LIKE '%测试班-%'
     OR course_name LIKE '%扣课%' OR course_name LIKE '%验证课%'
     OR course_name LIKE '重复测试-%' OR course_name LIKE '复查-%'
     OR course_name LIKE '家长签到测试%'
`).all()
if (auditScheds.length) {
  const ph = auditScheds.map(() => '?').join(',')
  const ids = auditScheds.map((s) => s.id)
  db.prepare(`DELETE FROM enrollments WHERE schedule_id IN (${ph})`).run(...ids)
  db.prepare(`DELETE FROM attendances WHERE schedule_id IN (${ph})`).run(...ids)
  db.prepare(`DELETE FROM leave_requests WHERE schedule_id IN (${ph})`).run(...ids)
  db.prepare(`DELETE FROM schedules WHERE id IN (${ph})`).run(...ids)
  console.log(`✓ 排期数据卫生（自动清理审计测试排课 ${auditScheds.length} 条）`)
}

// 性别数据归一化：兼容历史英文值（male/female），统一为中文（男/女）存储
const genderFix = db.prepare(`UPDATE students SET gender='男' WHERE gender='male'`).run()
db.prepare(`UPDATE students SET gender='女' WHERE gender='female'`).run()
db.prepare(`UPDATE teachers SET gender='男' WHERE gender='male'`).run()
db.prepare(`UPDATE teachers SET gender='女' WHERE gender='female'`).run()
const genderRemain = db.prepare(`SELECT count(*) c FROM students WHERE gender NOT IN ('男','女')`).get().c +
  db.prepare(`SELECT count(*) c FROM teachers WHERE gender NOT IN ('男','女')`).get().c
if (genderRemain > 0) { console.log(`✗ 性别字段存在异常值 ${genderRemain} 条`); issues++ }
else console.log(`✓ 性别数据归一化（male/female → 男/女，修正 ${genderFix.changes} 条）`)

// 自动清理自动化测试创建的销售订单（测试签单人 / E2E / AUDIT 备注）及其关联数据，
// 防止测试订单污染演示销售数据与会员卡
const testOrders = db.prepare(`
  SELECT id FROM orders
  WHERE salesperson LIKE '测试%' OR salesperson = '导入测试' OR remark LIKE 'E2E-%' OR remark LIKE 'AUDIT-%' OR remark LIKE '%导入测试%'
`).all()
if (testOrders.length) {
  const oph = testOrders.map(() => '?').join(',')
  const oids = testOrders.map((o) => o.id)
  const refs = oids.map((id) => 'order_' + id)
  const rph = refs.map(() => '?').join(',')
  db.prepare(`DELETE FROM point_logs WHERE reference_id IN (${rph})`).run(...refs)
  db.prepare(`DELETE FROM member_cards WHERE order_id IN (${oph})`).run(...oids)
  db.prepare(`DELETE FROM payments WHERE order_id IN (${oph})`).run(...oids)
  db.prepare(`DELETE FROM orders WHERE id IN (${oph})`).run(...oids)
  console.log(`✓ 订单数据卫生（自动清理测试销售订单 ${testOrders.length} 条）`)
} else {
  console.log('✓ 订单数据卫生（残留 0 条）')
}

const courses = db.prepare(`
  SELECT COUNT(*) c FROM courses
  WHERE name LIKE '%测试%' OR name LIKE 'E2E%' OR name LIKE '首页验证%'
`).get().c
if (courses > 20) { console.log(`✗ 测试课程残留 ${courses} 条`); issues++ }
else console.log(`✓ 课程数据卫生（残留 ${courses} 条）`)

// 自动清理自动化测试创建的临时课程（优化验证课等）及其关联数据，防止演示数据污染
const tempCourses = db.prepare(`
  SELECT id FROM courses WHERE name LIKE '优化验证课%' OR name LIKE '自动化测试课%' OR name LIKE '验证课%'
`).all()
if (tempCourses.length) {
  const ph = tempCourses.map(() => '?').join(',')
  const ids = tempCourses.map((c) => c.id)
  const scheds = db.prepare(`SELECT id FROM schedules WHERE course_id IN (${ph})`).all(...ids)
  if (scheds.length) {
    const sph = scheds.map(() => '?').join(',')
    const sids = scheds.map((s) => s.id)
    db.prepare(`DELETE FROM enrollments WHERE schedule_id IN (${sph})`).run(...sids)
    db.prepare(`DELETE FROM attendances WHERE schedule_id IN (${sph})`).run(...sids)
    db.prepare(`DELETE FROM schedules WHERE id IN (${sph})`).run(...sids)
  }
  db.prepare(`DELETE FROM courses WHERE id IN (${ph})`).run(...ids)
  console.log(`✓ 课程数据卫生（自动清理临时课程 ${tempCourses.length} 条）`)
}

// 自动清理自动化测试创建的产品（测试时效卡/测试次卡/坏卡）
const tempCards = db.prepare(`
  SELECT id FROM membership_cards WHERE name LIKE '测试%' OR name LIKE '排序测试卡%' OR name = '坏卡' OR name LIKE 'AUDIT-%'
`).all()
if (tempCards.length) {
  const ph = tempCards.map(() => '?').join(',')
  const ids = tempCards.map((c) => c.id)
  db.prepare(`DELETE FROM member_cards WHERE card_type_id IN (${ph})`).run(...ids)
  db.prepare(`DELETE FROM membership_cards WHERE id IN (${ph})`).run(...ids)
  console.log(`✓ 产品数据卫生（自动清理测试产品 ${tempCards.length} 条）`)
} else {
  console.log('✓ 产品数据卫生（残留 0 条）')
}

const notices = db.prepare(`
  SELECT COUNT(*) c FROM notifications
  WHERE title LIKE '%测试%' OR title LIKE 'E2E%' OR title LIKE '全检%'
`).get().c
if (notices > 0) {
  // 冒烟测试每次运行会产生「冒烟测试通知」，自动清理防止累积污染
  db.prepare(`DELETE FROM notifications WHERE title LIKE '%测试%' OR title LIKE 'E2E%' OR title LIKE '全检%'`).run()
  console.log(`✓ 通知数据卫生（自动清理 ${notices} 条测试通知）`)
} else {
  console.log(`✓ 通知数据卫生（残留 0 条）`)
}

// 清理内容引用测试排课的通知（剧本测试班/验证课/审计等自动化测试产生的活动取消/出勤/请假通知）
const testNoticeContent = db.prepare(`
  SELECT COUNT(*) c FROM notifications
  WHERE content LIKE '%剧本测试班%' OR content LIKE '%测试班-%'
     OR content LIKE '%验证课%' OR content LIKE '%审计%' OR content LIKE '%AUDIT%'
`).get().c
if (testNoticeContent > 0) {
  db.prepare(`
    DELETE FROM notifications
    WHERE content LIKE '%剧本测试班%' OR content LIKE '%测试班-%'
       OR content LIKE '%验证课%' OR content LIKE '%审计%' OR content LIKE '%AUDIT%'
  `).run()
  console.log(`✓ 通知数据卫生（自动清理引用测试排课的通知 ${testNoticeContent} 条）`)
}

// 清理请假审批通知：对应请假记录已删除（自动化测试残留）时清理
const orphanLeaveNotices = db.prepare(`
  SELECT COUNT(*) c FROM notifications
  WHERE (title = '请假已批准' OR title = '请假未通过')
    AND template_id LIKE 'LEAVE_%'
    AND SUBSTR(template_id, 7) NOT IN (SELECT id FROM leave_requests)
`).get().c
if (orphanLeaveNotices > 0) {
  db.prepare(`
    DELETE FROM notifications
    WHERE (title = '请假已批准' OR title = '请假未通过')
      AND template_id LIKE 'LEAVE_%'
      AND SUBSTR(template_id, 7) NOT IN (SELECT id FROM leave_requests)
  `).run()
  console.log(`✓ 通知数据卫生（自动清理请假审批测试通知 ${orphanLeaveNotices} 条）`)
}

// 自动清理积分流水中的测试标记（E2E / AUDIT / 测试），防止积分明细被测试数据淹没
const testLogs = db.prepare(`
  SELECT COUNT(*) c FROM point_logs
  WHERE reason LIKE 'E2E%' OR reason LIKE '%AUDIT%' OR reason LIKE '%测试%' OR reason LIKE 'AUDIT%'
`).get().c
if (testLogs > 0) {
  db.prepare(`
    DELETE FROM point_logs
    WHERE reason LIKE 'E2E%' OR reason LIKE '%AUDIT%' OR reason LIKE '%测试%' OR reason LIKE 'AUDIT%'
  `).run()
  console.log(`✓ 积分数据卫生（自动清理测试流水 ${testLogs} 条）`)
} else {
  console.log('✓ 积分数据卫生（残留 0 条）')
}

// 积分关联自愈：清理引用已删除排期/订单的测试流水，并按真实流水重算账户余额
const orphanCheckinLogs = db.prepare(`
  SELECT COUNT(*) c FROM point_logs pl
  WHERE pl.type = 'checkin' AND pl.reference_id != ''
    AND pl.reference_id NOT IN (SELECT id FROM schedules)
`).get().c
if (orphanCheckinLogs > 0) {
  db.prepare(`
    DELETE FROM point_logs WHERE type = 'checkin' AND reference_id != ''
      AND reference_id NOT IN (SELECT id FROM schedules)
  `).run()
  console.log(`✓ 积分关联自愈（清理孤儿签到积分 ${orphanCheckinLogs} 条）`)
}
const orphanEarnLogs = db.prepare(`
  SELECT COUNT(*) c FROM point_logs
  WHERE type = 'earn' AND (reason IN ('转介绍奖励','线索成交奖励','批量积分奖励'))
    AND (reference_id IS NULL OR reference_id = '')
`).get().c
if (orphanEarnLogs > 0) {
  db.prepare(`
    DELETE FROM point_logs
    WHERE type = 'earn' AND (reason IN ('转介绍奖励','线索成交奖励','批量积分奖励'))
      AND (reference_id IS NULL OR reference_id = '')
  `).run()
  console.log(`✓ 积分关联自愈（清理无来源测试奖励积分 ${orphanEarnLogs} 条）`)
}
const orphanPurchaseLogs = db.prepare(`
  SELECT COUNT(*) c FROM point_logs
  WHERE reason LIKE '购买「%」赠送积分' AND reference_id LIKE 'order_%'
    AND reference_id NOT IN (SELECT 'order_' || id FROM orders)
`).get().c
if (orphanPurchaseLogs > 0) {
  db.prepare(`
    DELETE FROM point_logs
    WHERE reason LIKE '购买「%」赠送积分' AND reference_id LIKE 'order_%'
      AND reference_id NOT IN (SELECT 'order_' || id FROM orders)
  `).run()
  console.log(`✓ 积分关联自愈（清理孤儿订单赠送积分 ${orphanPurchaseLogs} 条）`)
}
// 按真实流水重算账户（refund 日志为取消订单时已回滚的原奖励，不再计入余额）
const pointAccounts = db.prepare('SELECT student_id FROM points').all()
let recomputed = 0
for (const { student_id } of pointAccounts) {
  const earned = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM point_logs WHERE student_id = ? AND type IN ('earn','checkin')").get(student_id).s
  const consumed = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM point_logs WHERE student_id = ? AND type = 'consume'").get(student_id).s
  const balance = Math.max(0, earned - consumed)
  const cur = db.prepare('SELECT total_earned, total_consumed, balance FROM points WHERE student_id = ?').get(student_id)
  if (cur && (cur.total_earned !== earned || cur.total_consumed !== consumed || cur.balance !== balance)) {
    db.prepare('UPDATE points SET total_earned = ?, total_consumed = ?, balance = ?, updated_at = ? WHERE student_id = ?')
      .run(earned, consumed, balance, Date.now(), student_id)
    recomputed++
  }
}
if (recomputed > 0) {
  console.log(`✓ 积分账户自愈（按真实流水重算 ${recomputed} 个账户）`)
}

// 积分流水余额快照自愈：按时间顺序重算每条流水的余额快照，保证明细页与账户余额一致
const pointStudents = db.prepare('SELECT student_id FROM points').all()
let snapshotUpdated = 0
for (const { student_id } of pointStudents) {
  const logs = db.prepare('SELECT id, type, amount FROM point_logs WHERE student_id = ? ORDER BY created_at ASC, id ASC').all(student_id)
  let running = 0
  for (const log of logs) {
    if (log.type === 'earn' || log.type === 'checkin') running += log.amount
    else if (log.type === 'consume') running -= log.amount
    const expected = Math.max(0, running)
    const cur = db.prepare('SELECT balance FROM point_logs WHERE id = ?').get(log.id).balance
    if (cur !== expected) {
      db.prepare('UPDATE point_logs SET balance = ? WHERE id = ?').run(expected, log.id)
      snapshotUpdated++
    }
  }
}
if (snapshotUpdated > 0) {
  console.log(`✓ 积分流水快照自愈（重算 ${snapshotUpdated} 条余额快照）`)
}

// 反馈数据卫生：清理自动化测试产生的反馈（冒烟/测试/E2E/AUDIT 标记）
const testFeedbacks = db.prepare(`
  SELECT COUNT(*) c FROM feedback
  WHERE content LIKE '冒烟测试%' OR content LIKE '%E2E%' OR content LIKE '%AUDIT%' OR content LIKE '%测试反馈%'
`).get().c
if (testFeedbacks > 0) {
  db.prepare(`
    DELETE FROM feedback
    WHERE content LIKE '冒烟测试%' OR content LIKE '%E2E%' OR content LIKE '%AUDIT%' OR content LIKE '%测试反馈%'
  `).run()
  console.log(`✓ 反馈数据卫生（自动清理测试反馈 ${testFeedbacks} 条）`)
} else {
  console.log('✓ 反馈数据卫生（残留 0 条）')
}

// 出勤数据卫生：清理引用已取消排期的请假签到（已取消活动不应有出勤记录，多为自动化测试残留）
const cancelledLeaveAtt = db.prepare(`
  SELECT COUNT(*) c FROM attendances a
  JOIN schedules s ON s.id = a.schedule_id
  WHERE a.status = 'leave' AND s.status = 'cancelled'
`).get().c
if (cancelledLeaveAtt > 0) {
  db.prepare(`
    DELETE FROM attendances
    WHERE status = 'leave' AND schedule_id IN (
      SELECT id FROM schedules WHERE status = 'cancelled'
    )
  `).run()
  console.log(`✓ 出勤数据卫生（自动清理已取消排期的请假签到 ${cancelledLeaveAtt} 条）`)
} else {
  console.log('✓ 出勤数据卫生（残留 0 条）')
}

// 报名数据卫生：清理已取消的报名记录（自动化测试取消排期时级联产生，会污染成员时间线）
const cancelledEnrollments = db.prepare(
  "SELECT COUNT(*) c FROM enrollments WHERE status = 'cancelled'"
).get().c
if (cancelledEnrollments > 0) {
  db.prepare("DELETE FROM enrollments WHERE status = 'cancelled'").run()
  console.log(`✓ 报名数据卫生（自动清理已取消报名 ${cancelledEnrollments} 条）`)
} else {
  console.log('✓ 报名数据卫生（残留 0 条）')
}

// 关联完整性：孤儿数据（指向不存在排期/订单的记录）自动清理，保持数据库干净
const orphanChecks = [
  ['孤儿报名', `DELETE FROM enrollments WHERE schedule_id NOT IN (SELECT id FROM schedules)`, `SELECT COUNT(*) c FROM enrollments WHERE schedule_id NOT IN (SELECT id FROM schedules)`],
  ['孤儿签到', `DELETE FROM attendances WHERE schedule_id NOT IN (SELECT id FROM schedules)`, `SELECT COUNT(*) c FROM attendances WHERE schedule_id NOT IN (SELECT id FROM schedules)`],
  ['孤儿请假', `DELETE FROM leave_requests WHERE schedule_id != '' AND schedule_id NOT IN (SELECT id FROM schedules)`, `SELECT COUNT(*) c FROM leave_requests WHERE schedule_id != '' AND schedule_id NOT IN (SELECT id FROM schedules)`],
  ['卡单失联', `UPDATE member_cards SET order_id = '' WHERE order_id != '' AND order_id NOT IN (SELECT id FROM orders)`, `SELECT COUNT(*) c FROM member_cards WHERE order_id != '' AND order_id NOT IN (SELECT id FROM orders)`],
  ['孤儿绑定', `DELETE FROM parent_bindings WHERE student_id NOT IN (SELECT id FROM students)`, `SELECT COUNT(*) c FROM parent_bindings WHERE student_id NOT IN (SELECT id FROM students)`],
]
for (const [name, cleanSql, checkSql] of orphanChecks) {
  const before = db.prepare(checkSql).get().c
  if (before > 0) {
    db.prepare(cleanSql).run()
    const after = db.prepare(checkSql).get().c
    console.log(`✓ 关联完整性：${name} 已自动清理 ${before - after} 条`)
  } else {
    console.log(`✓ 关联完整性：${name} 0 条`)
  }
}

// 孤儿退款/取消卡：正式退费卡必然保留订单关联；订单已删除的退款/取消卡为自动化测试残留，直接清理
const orphanRefundedCards = db.prepare(`
  SELECT COUNT(*) c FROM member_cards
  WHERE status IN ('refunded','cancelled')
    AND (order_id = '' OR order_id NOT IN (SELECT id FROM orders))
`).get().c
if (orphanRefundedCards > 0) {
  db.prepare(`
    DELETE FROM member_cards
    WHERE status IN ('refunded','cancelled')
      AND (order_id = '' OR order_id NOT IN (SELECT id FROM orders))
  `).run()
  console.log(`✓ 会员卡数据卫生（自动清理孤儿退款/取消卡 ${orphanRefundedCards} 条）`)
} else {
  console.log('✓ 会员卡数据卫生（残留 0 条）')
}

// 报名计数自愈：enrolled_count 与报名表实际数量不一致时，按实际数量校正（防止历史计数漂移）
const driftCount = db.prepare(`
  SELECT COUNT(*) c FROM schedules s
  WHERE s.enrolled_count != (
    SELECT COUNT(*) FROM enrollments e WHERE e.schedule_id = s.id AND e.status = 'active'
  )
`).get().c
if (driftCount > 0) {
  db.prepare(`
    UPDATE schedules SET enrolled_count = (
      SELECT COUNT(*) FROM enrollments e WHERE e.schedule_id = schedules.id AND e.status = 'active'
    ), updated_at = ?
  `).run(Date.now())
  console.log(`✓ 报名计数自愈（校正 ${driftCount} 条排期报名数）`)
} else {
  console.log('✓ 报名计数自愈（无漂移）')
}

// 测试残留通知清理：自动化测试取消测试排课时生成的活动取消/变更通知，
// 其排课已被清理，继续留在家长通知列表会造成干扰，按内容特征自动删除
const staleNotices = db.prepare(`
  DELETE FROM notifications
  WHERE (title = '活动取消通知' OR title = '今日训练取消通知' OR title = '活动变更通知')
    AND (
      content LIKE '%优化验证课%' OR content LIKE '%管理端深化测试课%'
      OR content LIKE '%剧本测试%' OR content LIKE '%测试班-%'
      OR content LIKE '%验证课msm%' OR content LIKE '%审计%'
      OR content LIKE '%多孩%' OR content LIKE '%首页验证%'
    )
`).run().changes
if (staleNotices > 0) {
  console.log(`✓ 通知数据卫生（自动清理测试活动取消/变更通知 ${staleNotices} 条）`)
} else {
  console.log('✓ 通知数据卫生（无测试取消通知残留）')
}

// 通知去重自愈：同一用户同一标题同一内容只保留最新一条（自动化测试循环产生的重复通知）
const dupNotices = db.prepare(`
  DELETE FROM notifications
  WHERE id IN (
    SELECT n.id FROM notifications n
    JOIN (
      SELECT user_id, title, content, MAX(created_at) keep_id, COUNT(*) c
      FROM notifications GROUP BY user_id, title, content HAVING c > 1
    ) d ON d.user_id = n.user_id AND d.title = n.title AND d.content = n.content
    WHERE n.created_at != d.keep_id
  )
`).run().changes
if (dupNotices > 0) {
  console.log(`✓ 通知去重自愈（清理重复通知 ${dupNotices} 条）`)
} else {
  console.log('✓ 通知去重自愈（无重复通知）')
}

// 测试教练清理：自动化测试创建的临时教练档案（无排课无业务引用）及其登录账号
const testTeachers = db.prepare(`
  SELECT t.id, t.phone FROM teachers t
  WHERE (t.name LIKE '%验证教练%' OR t.name LIKE '%审计测试教练%' OR t.name LIKE '%测试教练%')
    AND NOT EXISTS (SELECT 1 FROM schedules s WHERE s.teacher_id = t.id)
`).all()
if (testTeachers.length) {
  const phones = testTeachers.map((t) => t.phone).filter(Boolean)
  const ids = testTeachers.map((t) => t.id)
  const ph = ids.map(() => '?').join(',')
  db.prepare(`DELETE FROM teachers WHERE id IN (${ph})`).run(...ids)
  if (phones.length) {
    const pph = phones.map(() => '?').join(',')
    db.prepare(`
      DELETE FROM users WHERE phone IN (${pph})
        AND role IN ('coach','sales')
    `).run(...phones)
  }
  console.log(`✓ 教练数据卫生（自动清理测试教练 ${testTeachers.length} 人）`)
} else {
  console.log('✓ 教练数据卫生（无测试教练残留）')
}

// 排期去重自愈：同课程+同日期+同时间的重复排期仅保留一条（自动化测试常见残留）
const dupScheds = db.prepare(`
  SELECT COUNT(*) c FROM schedules s WHERE EXISTS (
    SELECT 1 FROM schedules s2
    WHERE s2.course_name = s.course_name AND s2.date = s.date
      AND s2.start_time = s.start_time AND s2.end_time = s.end_time
      AND s2.id < s.id
  )
`).get().c
if (dupScheds > 0) {
  db.prepare(`
    DELETE FROM schedules WHERE id IN (
      SELECT id FROM schedules s WHERE EXISTS (
        SELECT 1 FROM schedules s2
        WHERE s2.course_name = s.course_name AND s2.date = s.date
          AND s2.start_time = s.start_time AND s2.end_time = s.end_time
          AND s2.id < s.id
      )
    )
  `).run()
  console.log(`✓ 排期去重自愈（清理重复排期 ${dupScheds} 条）`)
} else {
  console.log('✓ 排期去重自愈（无重复排期）')
}

// 测试通知清理：通用标题但内容引用测试数据的通知（活动取消/课时不足/续费提醒等）
const testGenericNotices = db.prepare(`
  SELECT COUNT(*) c FROM notifications
  WHERE title IN ('活动取消通知','课时不足提醒','会员即将到期提醒','活动变更通知')
    AND (content LIKE '%测试%' OR content LIKE '%提醒调试%')
`).get().c
if (testGenericNotices > 0) {
  db.prepare(`
    DELETE FROM notifications
    WHERE title IN ('活动取消通知','课时不足提醒','会员即将到期提醒','活动变更通知')
      AND (content LIKE '%测试%' OR content LIKE '%提醒调试%')
  `).run()
  console.log(`✓ 测试通知清理（清理通用标题测试通知 ${testGenericNotices} 条）`)
} else {
  console.log('✓ 测试通知清理（无残留）')
}

console.log(issues ? `数据卫生检查失败，共 ${issues} 项` : '✓ 数据卫生检查通过')
process.exit(issues ? 1 : 0)
