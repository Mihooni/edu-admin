/**
 * 星课教务系统 — 后端全功能系统测试
 *
 * 运行方式（隔离测试库，每次运行前自动从真实库快照复制，绝不污染真实数据）：
 *   PORT=3099 NODE_ENV=test node tests/full-system.test.js
 *
 * 覆盖：
 *   A. 401 鉴权闸门扫描（所有受保护路由无 token 必须 401；公开路径必须非 401）
 *   B. 角色越权 403 矩阵（admin / coach / sales / parent 四类身份交叉校验）
 *   C. 各集合 happy-path 列表/详情读取
 *   D. 核心实体完整 CRUD（学员 / 课程 / 会员卡类型）
 *   E. 关键业务流（排课→报名→冲突校验、签到→上课记录、课时汇总数学、会员扣课、订单创建→支付→退款预览→取消、请假申请→审批→撤销）
 *   F. 边界用例（缺参 / 404 / 非法输入 / 家长越权）
 *
 * 退出码：发现真实后端缺陷（fail）则非 0，便于 CI 阻断。
 */
'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ---- 隔离环境（必须在 require('./server') 之前设置）----
process.env.PORT = process.env.PORT || '3099';
process.env.NODE_ENV = 'test'; // 避免生产密钥拒绝启动（开发默认密钥仍会告警）
const SRC_DB = path.join(__dirname, '..', 'db', 'data.db');
const TEST_DB_DIR = '/tmp/edu-test';
process.env.DB_PATH = path.join(TEST_DB_DIR, 'data.db');

// 每次运行前从真实库快照复制一份干净的测试库（含 WAL 文件），保证确定性
fs.mkdirSync(TEST_DB_DIR, { recursive: true });
for (const f of ['data.db', 'data.db-shm', 'data.db-wal']) {
  const src = path.join(__dirname, '..', 'db', f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(TEST_DB_DIR, f));
}

const BASE = `http://localhost:${process.env.PORT}`;
const { generateToken } = require('../utils');

// ---- 真实种子身份（来自真实库快照）----
const IDS = {
  admin: 'phone_13800000001',
  coach: 'phone_13800000011',
  sales: 'phone_13700000001',
};

// ---- 测试结果收集 ----
const results = [];
let passed = 0, failed = 0, warned = 0;
function rec(group, name, ok, detail) {
  if (ok) passed++; else failed++;
  results.push({ group, name, status: ok ? 'PASS' : 'FAIL', detail: ok ? '' : detail });
  const tag = ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`  [${tag}] ${group} › ${name}${ok ? '' : '  -> ' + detail}`);
}
function recWarn(group, name, detail) {
  warned++;
  results.push({ group, name, status: 'WARN', detail });
  console.log(`  [\x1b[33mWARN\x1b[0m] ${group} › ${name}  -> ${detail}`);
}
const inner = (r) => (r.data && r.data.data) || null;

// ---- HTTP 助手 ----
async function call(method, p, { token, body, query } = {}) {
  let url = BASE + p;
  if (query) {
    const qs = Object.entries(query).filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;
  }
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* 可能非 JSON */ }
  return { status: res.status, data };
}

async function waitHealth(retries = 50) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await call('GET', '/api/health');
      if (r.status === 200) return true;
    } catch (e) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

// ============================================================
// 路由清单（来自 routes/*.js grep 快照 + server.js 顶层）
// ============================================================
const ROUTES = [
  ['POST', '/api/auth/upload/avatar'], ['GET', '/api/auth/getProfile'],
  ['POST', '/api/auth/bindStudent'], ['POST', '/api/auth/unbindStudent'],
  ['POST', '/api/auth/updateProfile'], ['POST', '/api/auth/changePassword'],
  ['POST', '/api/students'], ['POST', '/api/students/import'], ['GET', '/api/students'],
  ['GET', '/api/students/my'], ['GET', '/api/students/home/data'],
  ['GET', '/api/students/ID1'], ['GET', '/api/students/ID1/timeline'],
  ['PUT', '/api/students/ID1'], ['DELETE', '/api/students/ID1'],
  ['GET', '/api/students/ID1/stats'], ['GET', '/api/students/ID1/activities'],
  ['POST', '/api/students/ID1/qrcode'],
  ['POST', '/api/schedules'], ['POST', '/api/schedules/recursive'], ['GET', '/api/schedules'],
  ['GET', '/api/schedules/my'], ['GET', '/api/schedules/today'], ['GET', '/api/schedules/coach'],
  ['GET', '/api/schedules/coach/classes'], ['GET', '/api/schedules/admin/coach-classes'],
  ['GET', '/api/schedules/coach/stats'], ['GET', '/api/schedules/admin/coach-stats'],
  ['POST', '/api/schedules/ID1/enroll'], ['DELETE', '/api/schedules/ID1/enroll'],
  ['GET', '/api/schedules/ID1'], ['PUT', '/api/schedules/ID1'], ['DELETE', '/api/schedules/ID1'],
  ['POST', '/api/schedules/conflict-check'],
  ['POST', '/api/checkin/teacher'], ['POST', '/api/checkin/parent'], ['GET', '/api/checkin/records'],
  ['GET', '/api/checkin/today'], ['POST', '/api/checkin/auto-absent'],
  ['GET', '/api/attendances'], ['GET', '/api/attendances/student/STU1'], ['GET', '/api/attendances/summary'],
  ['POST', '/api/membership/pause'], ['POST', '/api/membership/resume'], ['POST', '/api/membership/card-type'],
  ['PUT', '/api/membership/card-type/ID1'], ['DELETE', '/api/membership/card-type/ID1'],
  ['POST', '/api/membership/activate'], ['GET', '/api/membership/my'], ['POST', '/api/membership/deduct'],
  ['POST', '/api/membership/refund'], ['GET', '/api/membership/deductions'], ['GET', '/api/membership/expiring'],
  ['POST', '/api/points/add'], ['POST', '/api/points/consume'], ['GET', '/api/points/balance'],
  ['GET', '/api/points/logs'], ['GET', '/api/points/ranking'], ['POST', '/api/points/share'], ['GET', '/api/points/rules'],
  ['POST', '/api/orders'], ['POST', '/api/orders/import'], ['GET', '/api/orders/my'],
  ['POST', '/api/orders/ID1/pay'], ['GET', '/api/orders/ID1/refund-preview'], ['POST', '/api/orders/ID1/refund'],
  ['PUT', '/api/orders/ID1'], ['POST', '/api/orders/ID1/cancel'], ['GET', '/api/orders/stats'], ['GET', '/api/orders'],
  ['GET', '/api/messages/list'], ['GET', '/api/messages/detail'], ['GET', '/api/messages/unread-count'],
  ['POST', '/api/messages/create'], ['POST', '/api/messages/generate-renewal'], ['POST', '/api/messages/read'],
  ['POST', '/api/messages/read-all'], ['GET', '/api/messages/group-notice'], ['POST', '/api/messages/send'],
  ['GET', '/api/messages/my'], ['PUT', '/api/messages/ID1/read'], ['PUT', '/api/messages/read-all'],
  ['GET', '/api/messages/admin/list'], ['DELETE', '/api/messages/ID1'],
  ['GET', '/api/admin/dashboard'], ['GET', '/api/admin/charts'], ['GET', '/api/admin/export'],
  ['GET', '/api/admin/suppressions'], ['POST', '/api/admin/suppressions'], ['DELETE', '/api/admin/suppressions/ID1'],
  ['GET', '/api/admin/teachers'], ['GET', '/api/admin/parents'], ['GET', '/api/admin/staff-options'],
  ['POST', '/api/admin/teachers'], ['PUT', '/api/admin/teachers/ID1'], ['DELETE', '/api/admin/teachers/ID1'],
  ['GET', '/api/admin/classrooms'], ['GET', '/api/admin/courses'], ['POST', '/api/admin/courses'],
  ['PUT', '/api/admin/courses/ID1'], ['DELETE', '/api/admin/courses/ID1'],
  ['GET', '/api/admin/courses/ID1/members'], ['POST', '/api/admin/courses/ID1/members'],
  ['DELETE', '/api/admin/courses/ID1/members/STU1'], ['GET', '/api/admin/backup'],
  ['PUT', '/api/settings'], ['GET', '/api/settings/data-modules'], ['GET', '/api/settings/export'],
  ['POST', '/api/settings/import'], ['POST', '/api/settings/db-restore'], ['GET', '/api/settings/backups'],
  ['POST', '/api/settings/backups/create'], ['DELETE', '/api/settings/backups/ID1'],
  ['POST', '/api/leave/apply'], ['GET', '/api/leave/my'], ['GET', '/api/leave'], ['PUT', '/api/leave/ID1/approve'],
  ['POST', '/api/leave/ID1/cancel'],
  ['POST', '/api/feedback/apply'], ['GET', '/api/feedback/my'], ['GET', '/api/feedback'], ['PUT', '/api/feedback/ID1/status'],
  ['GET', '/api/growth/funnel'], ['GET', '/api/growth/leads'], ['POST', '/api/growth/leads'],
  ['PUT', '/api/growth/leads/ID1'], ['DELETE', '/api/growth/leads/ID1'], ['POST', '/api/growth/leads/ID1/convert'],
  ['POST', '/api/growth/leads/ID1/stage'], ['GET', '/api/growth/churn'], ['GET', '/api/growth/renewal'],
  ['GET', '/api/growth/low-classes'], ['GET', '/api/growth/referrals'], ['GET', '/api/growth/points/summary'],
  ['GET', '/api/growth/points/list'], ['GET', '/api/growth/points/logs'], ['POST', '/api/growth/points/adjust'],
  ['GET', '/api/growth/points/ranking'],
  ['POST', '/api/followups/generate'], ['GET', '/api/followups'], ['GET', '/api/followups/today'],
  ['POST', '/api/followups'], ['POST', '/api/followups/ID1/complete'], ['POST', '/api/followups/ID1/cancel'],
  ['GET', '/api/payroll/coaches'], ['GET', '/api/payroll/coach/ID1'], ['PUT', '/api/payroll/coach/ID1/rule'], ['GET', '/api/payroll/me'],
  ['POST', '/api/comments'], ['GET', '/api/comments'], ['GET', '/api/comments/my'],
  ['GET', '/api/makeup/eligible'], ['POST', '/api/makeup/assign'], ['POST', '/api/makeup/cancel'],
  ['GET', '/api/makeup/records'], ['POST', '/api/makeup/reschedule'],
  ['GET', '/api/finance/summary'], ['GET', '/api/finance/monthly'], ['GET', '/api/finance/by-product'], ['GET', '/api/finance/by-sales'],
  ['GET', '/api/trial/list'], ['PUT', '/api/trial/ID1'],
  ['GET', '/api/wxpay/status'], ['POST', '/api/wxpay/create'],
];
const PUBLIC = [
  ['POST', '/api/auth/login'], ['POST', '/api/auth/wx-login'], ['POST', '/api/auth/phone-login'],
  ['GET', '/api/health'], ['POST', '/api/trial/apply'], ['POST', '/api/wxpay/notify'],
  ['GET', '/api/terms'], ['GET', '/api/settings'],
];

const ts = () => Date.now();
const pad = (n) => String(n).padStart(2, '0');
const futureDay = (days) => { const d = new Date(Date.now() + days * 86400000); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

// ============================================================
async function main() {
  console.log('\n\x1b[1m=== 星课教务系统 全功能后端测试 ===\x1b[0m');
  await require('../server');
  const up = await waitHealth();
  if (!up) { console.error('服务器启动失败'); process.exit(2); }
  console.log('服务器已就绪 @', BASE, '（测试库:', process.env.DB_PATH, '）\n');

  const tokens = {
    admin: generateToken({ openid: IDS.admin, role: 'admin' }),
    coach: generateToken({ openid: IDS.coach, role: 'coach' }),
    sales: generateToken({ openid: IDS.sales, role: 'sales' }),
  };

  const Database = require('better-sqlite3');
  const tdb = new Database(process.env.DB_PATH, { readonly: true });
  const bound = tdb.prepare(`
    SELECT pb.parent_openid, pb.student_id, s.name AS stu_name
    FROM parent_bindings pb
    JOIN users u ON u.openid = pb.parent_openid AND u.role = 'parent'
    JOIN students s ON s.id = pb.student_id
    LIMIT 1
  `).get();
  tdb.close();
  let parentToken = null, parentStudentId = null;
  if (bound) {
    parentToken = generateToken({ openid: bound.parent_openid, role: 'parent' });
    parentStudentId = bound.student_id;
    console.log(`家长身份: ${bound.parent_openid} 绑定学员 ${bound.student_id}(${bound.stu_name})\n`);
  } else {
    recWarn('setup', '未找到已绑定学员的家长账号', 'canViewStudentData / 请假 正向用例将跳过');
  }

  // ---------------- A. 401 扫描 ----------------
  console.log('\x1b[1m[A] 401 鉴权闸门扫描\x1b[0m');
  for (const [m, p] of ROUTES) {
    const r = await call(m, p);
    rec('A-auth-gate', `${m} ${p}`, r.status === 401, `status=${r.status}`);
  }
  for (const [m, p] of PUBLIC) {
    const r = await call(m, p);
    rec('A-public', `${m} ${p}`, r.status !== 401, `status=${r.status}（期望非 401）`);
  }

  // ---------------- B. 角色越权 403 矩阵 ----------------
  console.log('\n\x1b[1m[B] 角色越权矩阵\x1b[0m');
  const adminOnly = [
    ['POST', '/api/students'], ['PUT', '/api/settings'], ['GET', '/api/admin/export'],
    ['POST', '/api/admin/teachers'], ['DELETE', '/api/admin/teachers/ID1'],
    ['POST', '/api/admin/courses'], ['DELETE', '/api/admin/courses/ID1'],
    ['GET', '/api/admin/parents'], ['POST', '/api/settings/backups/create'],
  ];
  for (const role of ['coach', 'sales', 'parent']) {
    if (role === 'parent' && !parentToken) continue;
    for (const [m, p] of adminOnly) {
      const tk = role === 'parent' ? parentToken : tokens[role];
      const r = await call(m, p, { token: tk });
      rec(`B-403-adminOnly-vs-${role}`, `${m} ${p}`, r.status === 403, `status=${r.status}`);
    }
  }
  const coachOnly = [['POST', '/api/checkin/teacher'], ['PUT', '/api/leave/ID1/approve']];
  for (const role of ['sales', 'parent']) {
    if (role === 'parent' && !parentToken) continue;
    const tk = role === 'parent' ? parentToken : tokens[role];
    for (const [m, p] of coachOnly) {
      const r = await call(m, p, { token: tk });
      rec(`B-403-coachOnly-vs-${role}`, `${m} ${p}`, r.status === 403, `status=${r.status}`);
    }
  }
  if (parentToken) {
    const r = await call('GET', '/api/attendances', { token: parentToken });
    rec('B-403-staffOnly-vs-parent', 'GET /api/attendances', r.status === 403, `status=${r.status}`);
  }
  // 排课创建权限：教练可创建（isCoachReq），销售不可（仍 403）
  {
    const day = futureDay(5);
    const coachCreate = await call('POST', '/api/schedules', { token: tokens.coach, body: {
      courseName: '教练自建_' + ts(), date: day, startTime: '16:00', endTime: '17:00', teacherId: IDS.coach,
    }});
    const okCoach = coachCreate.status === 200 && coachCreate.data && coachCreate.data.code === 0 && inner(coachCreate) && inner(coachCreate).id;
    rec('B-schedule-coach-create', 'POST /api/schedules (教练可创建)', okCoach, okCoach ? '' : `status=${coachCreate.status} body=${JSON.stringify(coachCreate.data)}`);
    if (okCoach) await call('DELETE', `/api/schedules/${inner(coachCreate).id}`, { token: tokens.admin });
    const salesCreate = await call('POST', '/api/schedules', { token: tokens.sales, body: {
      courseName: '销售自建', date: day, startTime: '16:00', endTime: '17:00', teacherId: IDS.coach,
    }});
    rec('B-schedule-sales-blocked', 'POST /api/schedules (销售被拒)', salesCreate.status === 403, `status=${salesCreate.status}`);
  }

  // ---------------- C. happy-path 列表读取 ----------------
  console.log('\n\x1b[1m[C] 集合列表/详情 happy-path\x1b[0m');
  // [method, path, token, query]
  const lists = [
    ['GET', '/api/students', tokens.admin], ['GET', '/api/schedules', tokens.admin],
    ['GET', '/api/attendances', tokens.admin], ['GET', '/api/attendances/summary', tokens.admin],
    ['GET', '/api/admin/courses', tokens.admin], ['GET', '/api/admin/teachers', tokens.admin],
    ['GET', '/api/orders', tokens.admin], ['GET', '/api/orders/stats', tokens.admin],
    ['GET', '/api/finance/summary', tokens.admin], ['GET', '/api/growth/leads', tokens.admin],
    ['GET', '/api/leave', tokens.admin], ['GET', '/api/feedback', tokens.admin],
    ['GET', '/api/messages/admin/list', tokens.admin], ['GET', '/api/payroll/coaches', tokens.admin, { month: '2026-08' }],
    ['GET', '/api/payroll/me', tokens.coach],
    ['GET', '/api/membership/card-types', tokens.admin], ['GET', '/api/membership/products', tokens.admin],
    ['GET', '/api/points/ranking', tokens.admin], ['GET', '/api/followups', tokens.admin],
    ['GET', '/api/makeup/records', tokens.admin], ['GET', '/api/admin/dashboard', tokens.admin],
    ['GET', '/api/admin/charts', tokens.admin],
  ];
  for (const [m, p, tk, q] of lists) {
    const r = await call(m, p, { token: tk, query: q });
    // happy-path：返回 200 + code 0 + 有效 data 负载（不绑定各端点具体字段形状）
    const ok = r.status === 200 && r.data && r.data.code === 0 && inner(r) !== null;
    rec('C-list', `${m}${q ? '?' + Object.entries(q).map(([k, v]) => k + '=' + v).join('&') : ''}`, ok, ok ? '' : `status=${r.status} code=${r.data && r.data.code}`);
  }

  // ---------------- D. 核心实体 CRUD ----------------
  console.log('\n\x1b[1m[D] 核心实体完整 CRUD\x1b[0m');
  {
    const create = await call('POST', '/api/students', { token: tokens.admin, body: {
      name: '测试学员_' + ts(), gender: '男', phone: '139' + String(Math.floor(Math.random() * 90000000) + 10000000),
    }});
    const okCreate = create.status === 200 && create.data && create.data.code === 0 && inner(create) && inner(create).id;
    rec('D-students-create', 'POST /api/students', okCreate, okCreate ? '' : `status=${create.status} body=${JSON.stringify(create.data)}`);
    const newId = okCreate ? inner(create).id : 'ID1';
    const upd = await call('PUT', `/api/students/${newId}`, { token: tokens.admin, body: { name: '改名_测试', level: 'L1' } });
    rec('D-students-update', 'PUT /api/students/:id', upd.status === 200 && upd.data && upd.data.code === 0, `status=${upd.status}`);
    const del = await call('DELETE', `/api/students/${newId}`, { token: tokens.admin });
    rec('D-students-delete', 'DELETE /api/students/:id', del.status === 200 && del.data && del.data.code === 0, `status=${del.status}`);
  }
  {
    const create = await call('POST', '/api/admin/courses', { token: tokens.admin, body: {
      name: '测试课程_' + ts(), description: '自动化测试创建', color: '#3B82F6',
    }});
    const okCreate = create.status === 200 && create.data && create.data.code === 0 && inner(create) && inner(create).id;
    rec('D-courses-create', 'POST /api/admin/courses', okCreate, okCreate ? '' : `status=${create.status} body=${JSON.stringify(create.data)}`);
    const newId = okCreate ? inner(create).id : 'ID1';
    const upd = await call('PUT', `/api/admin/courses/${newId}`, { token: tokens.admin, body: { name: '改名课程' } });
    rec('D-courses-update', 'PUT /api/admin/courses/:id', upd.status === 200 && upd.data && upd.data.code === 0, `status=${upd.status}`);
    const del = await call('DELETE', `/api/admin/courses/${newId}`, { token: tokens.admin });
    rec('D-courses-delete', 'DELETE /api/admin/courses/:id', del.status === 200 && del.data && del.data.code === 0, `status=${del.status}`);
  }
  {
    const create = await call('POST', '/api/membership/card-type', { token: tokens.admin, body: {
      name: '测试卡种_' + ts(), billingMode: 'count', totalClasses: 10, price: 1000,
    }});
    const okCreate = create.status === 200 && create.data && create.data.code === 0 && inner(create) && inner(create).id;
    rec('D-cardtype-create', 'POST /api/membership/card-type', okCreate, okCreate ? '' : `status=${create.status} body=${JSON.stringify(create.data)}`);
    const newId = okCreate ? inner(create).id : 'ID1';
    const upd = await call('PUT', `/api/membership/card-type/${newId}`, { token: tokens.admin, body: { name: '改名卡种', price: 1200 } });
    rec('D-cardtype-update', 'PUT /api/membership/card-type/:id', upd.status === 200 && upd.data && upd.data.code === 0, `status=${upd.status}`);
    const del = await call('DELETE', `/api/membership/card-type/${newId}`, { token: tokens.admin });
    rec('D-cardtype-delete', 'DELETE /api/membership/card-type/:id', del.status === 200 && del.data && del.data.code === 0, `status=${del.status}`);
  }

  // ---------------- E. 关键业务流 ----------------
  console.log('\n\x1b[1m[E] 关键业务流\x1b[0m');
  // E1 排课 → 报名 → 冲突校验
  let schedIdE1 = 'ID1';
  {
    const day = futureDay(3);
    const sched = await call('POST', '/api/schedules', { token: tokens.admin, body: {
      courseName: '测试排课_' + ts(), date: day, startTime: '10:00', endTime: '11:00',
      teacherId: IDS.coach, maxStudents: 5,
    }});
    const okSched = sched.status === 200 && sched.data && sched.data.code === 0 && inner(sched) && inner(sched).id;
    rec('E-schedule-create', 'POST /api/schedules', okSched, okSched ? '' : `status=${sched.status} body=${JSON.stringify(sched.data)}`);
    schedIdE1 = okSched ? inner(sched).id : 'ID1';
    const enroll = await call('POST', `/api/schedules/${schedIdE1}/enroll`, { token: tokens.admin, body: { studentId: 'stu_001' } });
    rec('E-schedule-enroll', 'POST /api/schedules/:id/enroll', enroll.status === 200 && enroll.data && enroll.data.code === 0, `status=${enroll.status} body=${JSON.stringify(enroll.data)}`);
    const conflict = await call('POST', '/api/schedules/conflict-check', { token: tokens.admin, body: {
      teacherId: IDS.coach, date: day, startTime: '10:30', endTime: '11:30',
    }});
    rec('E-schedule-conflict-check', 'POST /api/schedules/conflict-check', conflict.status === 200 && conflict.data && conflict.data.code === 0, `status=${conflict.status}`);
    await call('DELETE', `/api/schedules/${schedIdE1}`, { token: tokens.admin });
  }
  // E2 签到 → 上课记录生成
  {
    const day = futureDay(1);
    const sched = await call('POST', '/api/schedules', { token: tokens.admin, body: {
      courseName: '签到测试_' + ts(), date: day, startTime: '09:00', endTime: '10:00',
      teacherId: IDS.coach, maxStudents: 5,
    }});
    const schedId = sched.data && inner(sched) ? inner(sched).id : 'ID1';
    await call('POST', `/api/schedules/${schedId}/enroll`, { token: tokens.admin, body: { studentId: 'stu_002' } });
    const ck = await call('POST', '/api/checkin/teacher', { token: tokens.coach, body: {
      scheduleId: schedId, attendances: [{ studentId: 'stu_002', status: 'present' }],
    }});
    const okCk = ck.status === 200 && ck.data && ck.data.code === 0;
    rec('E-checkin-teacher', 'POST /api/checkin/teacher', okCk, okCk ? '' : `status=${ck.status} body=${JSON.stringify(ck.data)}`);
    const att = await call('GET', '/api/attendances/student/stu_002', { token: tokens.admin, query: { pageSize: 500 } });
    const list = inner(att) && inner(att).list ? inner(att).list : [];
    const found = att.status === 200 && list.some((x) => x.scheduleId === schedId);
    rec('E-attendance-recorded', 'GET /api/attendances/student/stu_002 含签到', found, found ? '' : `status=${att.status} listLen=${list.length}`);
    const sum = await call('GET', '/api/attendances/summary', { token: tokens.admin, query: { pageSize: 500 } });
    const s = inner(sum) && inner(sum).summary;
    const okMath = sum.status === 200 && s && typeof s.totalSessions === 'number' && typeof s.attendanceRate === 'number';
    rec('E-summary-math', 'GET /api/attendances/summary 数值字段', okMath, okMath ? `totalSessions=${s.totalSessions} rate=${s.attendanceRate}` : `status=${sum.status}`);
    await call('DELETE', `/api/schedules/${schedId}`, { token: tokens.admin });
  }
  // E3 会员扣课（按卡计费模式判定是否符合预期）
  {
    const mdb = new Database(process.env.DB_PATH, { readonly: true });
    const card = mdb.prepare("SELECT id, student_id, remaining_classes, billing_mode FROM member_cards WHERE status='active' LIMIT 1").get();
    mdb.close();
    if (card) {
      const before = card.remaining_classes;
      const deduct = await call('POST', '/api/membership/deduct', { token: tokens.admin, body: {
        scheduleId: 'sch_deduct_' + ts(), studentId: card.student_id, classes: 1, reason: '测试扣课',
      }});
      const okCk = deduct.status === 200 && deduct.data && deduct.data.code === 0;
      rec('E-membership-deduct', 'POST /api/membership/deduct', okCk, okCk ? '' : `status=${deduct.status} body=${JSON.stringify(deduct.data)}`);
      const adb = new Database(process.env.DB_PATH, { readonly: true });
      const after = adb.prepare('SELECT remaining_classes FROM member_cards WHERE id=?').get(card.id);
      adb.close();
      if (card.billing_mode === 'count') {
        rec('E-membership-deduct-math', 'count 模式 remaining -1', after.remaining_classes === before - 1, `${before} -> ${after.remaining_classes}`);
      } else {
        recWarn('E-membership-deduct-math', `卡为 ${card.billing_mode} 模式`, `不扣课时，before=${before} after=${after.remaining_classes}`);
      }
    } else {
      recWarn('E-membership', '无 active 会员卡', '扣课用例跳过');
    }
  }
  // E4 订单：创建 → 支付 → 退款预览 → 取消
  {
    const create = await call('POST', '/api/orders', { token: tokens.admin, body: {
      studentId: 'stu_003', items: [{ itemName: '测试商品', unitPrice: 100, quantity: 1 }],
      discountAmount: 0, orderType: 'retail', status: 'pending',
    }});
    const okCreate = create.status === 200 && create.data && create.data.code === 0 && inner(create) && inner(create).orderId;
    rec('E-order-create', 'POST /api/orders', okCreate, okCreate ? '' : `status=${create.status} body=${JSON.stringify(create.data)}`);
    const oid = okCreate ? inner(create).orderId : 'ID1';
    const pay = await call('POST', `/api/orders/${oid}/pay`, { token: tokens.admin, body: { payMethod: 'cash' } });
    rec('E-order-pay', 'POST /api/orders/:id/pay', pay.status === 200 && pay.data && pay.data.code === 0, `status=${pay.status} body=${JSON.stringify(pay.data)}`);
    const preview = await call('GET', `/api/orders/${oid}/refund-preview`, { token: tokens.admin });
    rec('E-order-refund-preview', 'GET /api/orders/:id/refund-preview', preview.status === 200 && preview.data && preview.data.code === 0, `status=${preview.status}`);
    const cancel = await call('POST', `/api/orders/${oid}/cancel`, { token: tokens.admin, body: {} });
    rec('E-order-cancel', 'POST /api/orders/:id/cancel', cancel.status === 200 && cancel.data && cancel.data.code === 0, `status=${cancel.status}`);
  }
  // E5 请假：家长申请 → 教练审批；另测家长撤销待审批
  if (parentToken) {
    // 流程一：家长申请 → 教练审批（独立排期 A）
    const dayA = futureDay(2);
    const schedA = await call('POST', '/api/schedules', { token: tokens.admin, body: {
      courseName: '请假测试A_' + ts(), date: dayA, startTime: '14:00', endTime: '15:00', teacherId: IDS.coach, maxStudents: 5,
    }});
    const schedIdA = schedA.data && inner(schedA) ? inner(schedA).id : 'ID1';
    await call('POST', `/api/schedules/${schedIdA}/enroll`, { token: tokens.admin, body: { studentId: parentStudentId } });
    const apply = await call('POST', '/api/leave/apply', { token: parentToken, body: {
      scheduleId: schedIdA, studentId: parentStudentId, reason: '测试请假',
    }});
    const okApply = apply.status === 200 && apply.data && apply.data.code === 0 && inner(apply) && inner(apply).id;
    rec('E-leave-apply', 'POST /api/leave/apply (家长)', okApply, okApply ? '' : `status=${apply.status} body=${JSON.stringify(apply.data)}`);
    const lid = okApply ? inner(apply).id : 'ID1';
    const approve = await call('PUT', `/api/leave/${lid}/approve`, { token: tokens.coach, body: { action: 'approve', note: '测试通过' } });
    rec('E-leave-approve', 'PUT /api/leave/:id/approve (教练)', approve.status === 200 && approve.data && approve.data.code === 0, `status=${approve.status} body=${JSON.stringify(approve.data)}`);
    await call('DELETE', `/api/schedules/${schedIdA}`, { token: tokens.admin });
    // 流程二：家长申请后立即撤销（独立排期 B，避免同排期重复请假被拒）
    const dayB = futureDay(4);
    const schedB = await call('POST', '/api/schedules', { token: tokens.admin, body: {
      courseName: '请假测试B_' + ts(), date: dayB, startTime: '14:00', endTime: '15:00', teacherId: IDS.coach, maxStudents: 5,
    }});
    const schedIdB = schedB.data && inner(schedB) ? inner(schedB).id : 'ID1';
    await call('POST', `/api/schedules/${schedIdB}/enroll`, { token: tokens.admin, body: { studentId: parentStudentId } });
    const apply2 = await call('POST', '/api/leave/apply', { token: parentToken, body: {
      scheduleId: schedIdB, studentId: parentStudentId, reason: '测试撤销',
    }});
    const lid2 = apply2.data && inner(apply2) ? inner(apply2).id : 'ID1';
    const cancel = await call('POST', `/api/leave/${lid2}/cancel`, { token: parentToken, body: {} });
    rec('E-leave-cancel', 'POST /api/leave/:id/cancel (家长撤销)', cancel.status === 200 && cancel.data && cancel.data.code === 0, `status=${cancel.status} body=${JSON.stringify(cancel.data)}`);
    await call('DELETE', `/api/schedules/${schedIdB}`, { token: tokens.admin });
  } else {
    recWarn('E-leave', '无家长身份', '请假流程用例跳过');
  }

  // ---------------- F. 边界用例 ----------------
  console.log('\n\x1b[1m[F] 边界用例\x1b[0m');
  {
    const r = await call('POST', '/api/students', { token: tokens.admin, body: { gender: '男' } });
    rec('F-students-missing-name', 'POST /api/students 无姓名 → 业务失败码', r.status === 200 && r.data && r.data.code !== 0, `status=${r.status} code=${r.data && r.data.code}`);
  }
  {
    const r = await call('GET', '/api/students/NO_SUCH_ID', { token: tokens.admin });
    rec('F-students-404', 'GET /api/students/不存在', r.status === 404 || (r.data && r.data.code !== 0), `status=${r.status} code=${r.data && r.data.code}`);
  }
  {
    const r = await call('GET', '/api/attendances/student/NO_SUCH_STU', { token: tokens.admin });
    rec('F-attendance-404', 'GET /api/attendances/student/不存在', r.status === 404, `status=${r.status}`);
  }
  {
    const res = await fetch(BASE + '/api/students', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tokens.admin }, body: '{bad json' });
    rec('F-invalid-json', '非法 JSON body 不崩溃', res.status === 400 || res.status === 500 || res.status === 200, `status=${res.status}`);
  }
  if (parentToken && bound) {
    const qdb = new Database(process.env.DB_PATH, { readonly: true });
    const other = qdb.prepare('SELECT student_id FROM parent_bindings WHERE parent_openid <> ? LIMIT 1').get(bound.parent_openid);
    qdb.close();
    if (other) {
      const r = await call('GET', `/api/attendances/student/${other.student_id}`, { token: parentToken });
      rec('F-parent-cross-view', '家长查看他人学员 → 403', r.status === 403, `status=${r.status}`);
    } else {
      recWarn('F-parent-cross-view', '无其他绑定学员可测', '跳过');
    }
  }

  // ---------------- 汇总 ----------------
  console.log('\n\x1b[1m=== 测试结果汇总 ===\x1b[0m');
  console.log(`\x1b[32mPASS ${passed}\x1b[0m  \x1b[31mFAIL ${failed}\x1b[0m  \x1b[33mWARN ${warned}\x1b[0m  (共 ${results.length})`);
  const outDir = path.join(__dirname, 'reports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const reportPath = path.join(outDir, `report-${ts()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ passed, failed, warned, total: results.length, results, at: new Date().toISOString() }, null, 2));
  console.log('明细已写入:', reportPath);

  const fails = results.filter((r) => r.status === 'FAIL');
  if (fails.length) {
    console.log('\n\x1b[31m失败项明细:\x1b[0m');
    for (const f of fails) console.log(`  - ${f.group} › ${f.name}: ${f.detail}`);
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('测试运行异常:', e); process.exit(3); });
