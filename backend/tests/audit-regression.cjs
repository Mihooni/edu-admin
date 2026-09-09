/**
 * 审计（audit_log）回归校验脚本
 * - 使用隔离临时库 DB_PATH=/tmp/audit_test.db，避免污染真实数据
 * - 直接调用真实路由处理器（不经由 HTTP），断言 8 个审计埋点在主流程正常写入
 * - 同时校验主业务流程未被破坏（报名/审批/清除签到后数据状态正确）
 *
 * 运行：node tests/audit-regression.cjs
 */
process.env.DB_PATH = '/tmp/audit_test.db';
process.env.NODE_ENV = 'test';

const fs = require('fs');
// 清理旧库，确保迁移 007 从零执行
for (const f of ['/tmp/audit_test.db', '/tmp/audit_test.db-wal', '/tmp/audit_test.db-shm']) {
  try { fs.rmSync(f); } catch (e) { /* ignore */ }
}

const db = require('../db'); // 触发 init schema + 全部迁移（含 007_audit_log）
const { now, formatDate, generateId } = require('../utils');
const checkinRouter = require('../routes/checkin');
const schedulesRouter = require('../routes/schedules');
const classesRouter = require('../routes/classes');

// ---------- 工具：从 router.stack 提取真实处理器 ----------
function getHandler(router, method, path) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (layer.route.path !== path) continue;
    if (!layer.route.methods[method]) continue;
    const handlers = layer.route.stack;
    return handlers[handlers.length - 1].handle;
  }
  throw new Error(`未找到处理器: ${method.toUpperCase()} ${path}`);
}

function mockRes() {
  const r = { statusCode: 200, body: null };
  r.status = (code) => { r.statusCode = code; return r; };
  r.json = (payload) => { r.body = payload; r.bodyStatusCode = r.statusCode; return r; };
  return r;
}
function mockReq(o) {
  return Object.assign({ headers: {}, params: {}, query: {}, body: {}, userRole: '', openid: '' }, o);
}

// ---------- 种子数据 ----------
const t = now();
const seed = db.transaction(() => {
  const ins = (sql, ...params) => db.prepare(sql).run(...params);
  // 用户
  ins("INSERT OR IGNORE INTO users (id, openid, role, password, nickname, phone) VALUES (?,?,?,?,?,?)",
    'u_admin', 'admin_openid', 'admin', 'x', 'Admin', null);
  ins("INSERT OR IGNORE INTO users (id, openid, role, password, nickname, phone) VALUES (?,?,?,?,?,?)",
    'u_coach', 'coach_openid', 'coach', 'x', 'Coach', '13800000000');
  ins("INSERT OR IGNORE INTO users (id, openid, role, password, nickname, phone) VALUES (?,?,?,?,?,?)",
    'u_parent', 'parent_openid', 'parent', 'x', 'Parent', null);
  // 学员
  ins("INSERT OR IGNORE INTO students (id, name) VALUES (?,?)", 'stu1', '小明');
  ins("INSERT OR IGNORE INTO students (id, name) VALUES (?,?)", 'stu2', '小红');
  // 家长绑定
  ins("INSERT OR IGNORE INTO parent_bindings (student_id, student_name, parent_openid, is_main) VALUES (?,?,?,?)",
    'stu1', '小明', 'parent_openid', 1);
  ins("INSERT OR IGNORE INTO parent_bindings (student_id, student_name, parent_openid, is_main) VALUES (?,?,?,?)",
    'stu2', '小红', 'parent_openid', 0);
  // 课程
  ins("INSERT OR IGNORE INTO courses (id, name) VALUES (?,?)", 'course1', '篮球基础班');
  // 班级 + 成员
  ins("INSERT OR IGNORE INTO classes (id, name, status) VALUES (?,?,?)", 'class1', '基础班', 'active');
  ins("INSERT OR IGNORE INTO classes (id, name, status) VALUES (?,?,?)", 'class2', '进阶班', 'active');
  ins("INSERT OR IGNORE INTO class_members (id, class_id, student_id, role, joined_at) VALUES (?,?,?,?,?)",
    'cm1', 'class1', 'stu1', 'member', t);
  ins("INSERT OR IGNORE INTO class_members (id, class_id, student_id, role, joined_at) VALUES (?,?,?,?,?)",
    'cm2', 'class2', 'stu2', 'member', t);
  // 公开排期（无班级限制）。date 用当天、时间段全天，保证家长扫码签到的时间窗口
  // （开始前 2h 至结束后 2h）在任意运行时刻都覆盖"现在"，测试与真实日期无关。
  ins(`INSERT OR IGNORE INTO schedules (id, course_id, course_name, teacher_id, date, start_time, end_time, max_students, enrolled_count, status, class_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    'sched_pub', 'course1', '篮球基础班', '', formatDate(t), '00:00', '23:59', 20, 0, 'scheduled', '');
  // 班级排期1（class1 / stu1）
  ins(`INSERT OR IGNORE INTO schedules (id, course_id, course_name, teacher_id, date, start_time, end_time, max_students, enrolled_count, status, class_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    'sched_cls', 'course1', '篮球基础班', 'coach_openid', '2026-08-26', '10:00', '11:30', 20, 0, 'scheduled', 'class1');
  // 班级排期2（class2 / stu2），用于拒绝流
  ins(`INSERT OR IGNORE INTO schedules (id, course_id, course_name, teacher_id, date, start_time, end_time, max_students, enrolled_count, status, class_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    'sched_cls2', 'course1', '篮球基础班', 'coach_openid', '2026-08-26', '14:00', '15:30', 20, 0, 'scheduled', 'class2');
  // 预置一条签到（供清除流使用，points_earned=0 规避积分/扣课回滚分支）
  ins(`INSERT OR IGNORE INTO attendances (id, schedule_id, student_id, student_name, course_id, course_name, status, checkin_method, checkin_time, checkin_by, points_earned, date, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    'att_seed', 'sched_cls', 'stu2', '小红', 'course1', '篮球基础班', 'present', 'manual', t, 'teacher', 0, '2026-08-26', t, t);
});
seed();

// ---------- 执行断言 ----------
let failures = 0;
const results = [];
function expect(condition, label) {
  results.push(`${condition ? 'PASS' : 'FAIL'}  ${label}`);
  if (!condition) failures++;
}

function auditCount(action) {
  return db.prepare('SELECT COUNT(*) c FROM audit_log WHERE action = ?').get(action).c;
}

// A. 教师签到（新增 present）
{
  const h = getHandler(checkinRouter, 'post', '/teacher');
  const res = mockRes();
  h(mockReq({ userRole: 'admin', openid: 'admin_openid',
    body: { scheduleId: 'sched_cls', attendances: [{ studentId: 'stu1', status: 'present' }] } }), res);
  expect(res.body && res.body.code === 0, 'A. 教师签到 present 主流程成功');
  expect(auditCount('checkin_present') >= 1, 'A. 写入 checkin_present 审计');
  const att = db.prepare("SELECT * FROM attendances WHERE schedule_id='sched_cls' AND student_id='stu1'").get();
  expect(!!att && att.status === 'present', 'A. 考勤主数据已落库（present）');
  const pt = db.prepare("SELECT * FROM points WHERE student_id='stu1'").get();
  expect(!!pt && pt.balance === 10, 'A. 积分已发放（balance=10）');
}

// B. 教师清除签到
{
  const h = getHandler(checkinRouter, 'post', '/teacher');
  const res = mockRes();
  h(mockReq({ userRole: 'admin', openid: 'admin_openid',
    body: { scheduleId: 'sched_cls', attendances: [{ studentId: 'stu2', status: 'clear' }] } }), res);
  expect(res.body && res.body.code === 0, 'B. 教师清除签到主流程成功');
  expect(auditCount('checkin_clear') >= 1, 'B. 写入 checkin_clear 审计');
  const att = db.prepare("SELECT * FROM attendances WHERE schedule_id='sched_cls' AND student_id='stu2'").get();
  expect(!att, 'B. 被清除的考勤已删除');
}

// C. 家长扫码签到
{
  const h = getHandler(checkinRouter, 'post', '/parent');
  const res = mockRes();
  h(mockReq({ userRole: 'parent', openid: 'parent_openid',
    body: { scheduleId: 'sched_pub', studentId: 'stu1' } }), res);
  expect(res.body && res.body.code === 0, 'C. 家长扫码签到主流程成功');
  expect(auditCount('checkin_present') >= 2, 'C. 写入 checkin_present（家长）审计');
  const att = db.prepare("SELECT * FROM attendances WHERE schedule_id='sched_pub' AND student_id='stu1'").get();
  expect(!!att && att.status === 'present' && att.checkin_by === 'parent', 'C. 家长考勤已落库');
}

// D. 活动报名（管理员代报名）
{
  const h = getHandler(schedulesRouter, 'post', '/:id/enroll');
  const res = mockRes();
  h(mockReq({ userRole: 'admin', openid: 'admin_openid', params: { id: 'sched_pub' }, body: { studentId: 'stu2' } }), res);
  expect(res.body && res.body.code === 0, 'D. 活动报名主流程成功');
  expect(auditCount('enroll') >= 1, 'D. 写入 enroll 审计');
  const enr = db.prepare("SELECT * FROM enrollments WHERE schedule_id='sched_pub' AND student_id='stu2'").get();
  expect(!!enr && enr.status === 'active', 'D. 报名主数据已落库（active）');
  const sched = db.prepare("SELECT enrolled_count FROM schedules WHERE id='sched_pub'").get();
  expect(sched.enrolled_count === 1, 'D. 排期报名人数 +1');
}

// E. 取消报名（管理员）
{
  const h = getHandler(schedulesRouter, 'delete', '/:id/enroll');
  const res = mockRes();
  h(mockReq({ userRole: 'admin', openid: 'admin_openid', params: { id: 'sched_pub' }, body: { studentId: 'stu2' } }), res);
  expect(res.body && res.body.code === 0, 'E. 取消报名主流程成功');
  expect(auditCount('enroll_cancel') >= 1, 'E. 写入 enroll_cancel 审计');
  const enr = db.prepare("SELECT * FROM enrollments WHERE schedule_id='sched_pub' AND student_id='stu2'").get();
  expect(!enr, 'E. 报名记录已删除');
  const sched = db.prepare("SELECT enrolled_count FROM schedules WHERE id='sched_pub'").get();
  expect(sched.enrolled_count === 0, 'E. 排期报名人数回退为 0');
}

// F. 班级报名请求（家长）
let reqId1 = null;
{
  const h = getHandler(classesRouter, 'post', '/schedules/:scheduleId/request');
  const res = mockRes();
  h(mockReq({ userRole: 'parent', openid: 'parent_openid', params: { scheduleId: 'sched_cls' }, body: { studentId: 'stu1' } }), res);
  expect(res.body && res.body.code === 0, 'F. 班级报名请求提交成功');
  expect(auditCount('enroll_request') >= 1, 'F. 写入 enroll_request 审计');
  reqId1 = res.body && res.body.data && res.body.data.requestId;
  expect(!!reqId1, 'F. 返回 requestId');
  const enr = db.prepare("SELECT * FROM enrollments WHERE id=?").get(reqId1);
  expect(enr && enr.status === 'pending' && enr.request_status === 'pending', 'F. 报名请求 pending 落库');
}

// G. 审批通过（管理员）
{
  const h = getHandler(classesRouter, 'post', '/:id/registration-requests/:requestId/approve');
  const res = mockRes();
  h(mockReq({ userRole: 'admin', openid: 'admin_openid', params: { id: 'class1', requestId: reqId1 } }), res);
  expect(res.body && res.body.code === 0, 'G. 审批通过主流程成功');
  expect(auditCount('enroll_approve') >= 1, 'G. 写入 enroll_approve 审计');
  const enr = db.prepare("SELECT * FROM enrollments WHERE id=?").get(reqId1);
  expect(enr && enr.status === 'active' && enr.request_status === 'approved', 'G. 报名已转为 active/approved');
}

// H. 班级报名请求 + 拒绝（stu2 / class2）
let reqId2 = null;
{
  const hReq = getHandler(classesRouter, 'post', '/schedules/:scheduleId/request');
  const r1 = mockRes();
  hReq(mockReq({ userRole: 'parent', openid: 'parent_openid', params: { scheduleId: 'sched_cls2' }, body: { studentId: 'stu2' } }), r1);
  expect(r1.body && r1.body.code === 0, 'H. 第二笔报名请求提交成功');
  reqId2 = r1.body && r1.body.data && r1.body.data.requestId;
  const hRej = getHandler(classesRouter, 'post', '/:id/registration-requests/:requestId/reject');
  const r2 = mockRes();
  hRej(mockReq({ userRole: 'admin', openid: 'admin_openid', params: { id: 'class2', requestId: reqId2 } }), r2);
  expect(r2.body && r2.body.code === 0, 'H. 审批拒绝主流程成功');
  expect(auditCount('enroll_reject') >= 1, 'H. 写入 enroll_reject 审计');
  const enr = db.prepare("SELECT * FROM enrollments WHERE id=?").get(reqId2);
  expect(enr && enr.status === 'pending' && enr.request_status === 'rejected', 'H. 报名请求标记为 rejected');
}

// 汇总
console.log('\n==== 审计回归结果 ====');
results.forEach((r) => console.log(r));
const total = db.prepare('SELECT COUNT(*) c FROM audit_log').get().c;
console.log(`\naudit_log 累计写入行数: ${total}`);
console.log(failures === 0 ? '\n✅ 全部通过' : `\n❌ ${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
