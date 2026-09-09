// 模拟小程序管理端 API 全流程：登录 → 参考数据 → 建排课 → 成员列表 → 详情 → 暂停/恢复会员卡
import path from 'node:path';
const __ROOT = (() => {
  const p = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  return p;
})();
const base = 'http://localhost:3001/api';
const { createRequire } = await import('module');
const dbClean = createRequire(`${__ROOT}/backend/package.json`)('better-sqlite3')(`${__ROOT}/backend/db/data.db`);
const clean = (sql, params = []) => { try { dbClean.prepare(sql).run(...params); } catch (e) { console.log('⚠ 清理项失败:', e.message, '|', sql.slice(0, 60)); } };
const j = async (path, opts = {}) => {
  const { headers, ...rest } = opts;
  const res = await fetch(base + path, {
    ...rest,
    headers: { 'content-type': 'application/json', ...(headers || {}) },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch (e) { body = { __html: text.slice(0, 80) }; }
  return { status: res.status, body };
};
const results = [];
async function step(name, fn) {
  try { await fn(); results.push(`✓ ${name}`); }
  catch (e) { results.push(`✗ ${name}: ${String(e).slice(0, 200)}`); }
}

let openid = '';
await step('管理员登录（手机+密码+角色）', async () => {
  const r = await j('/auth/login', { method: 'POST', body: JSON.stringify({ phone: '13800000001', role: 'admin', password: '123456', nickname: '管理员' }) });
  if (r.body.code !== 0) throw new Error(JSON.stringify(r.body));
  openid = r.body.data.openid;
});
const H = { 'x-openid': openid };

await step('管理员可访问 /api/admin/courses', async () => {
  const r = await j('/admin/courses', { headers: H });
  if (r.body.code !== 0 || !Array.isArray(r.body.data.list)) throw new Error('courses 异常');
});
await step('管理员可访问 /api/admin/teachers', async () => {
  const r = await j('/admin/teachers', { headers: H });
  if (r.body.code !== 0) throw new Error('teachers 异常');
});
await step('管理员可访问 /api/admin/classrooms', async () => {
  const r = await j('/admin/classrooms', { headers: H });
  if (r.body.code !== 0) throw new Error('classrooms 异常');
});
await step('成员列表（含搜索）', async () => {
  const r = await j('/students?keyword=' + encodeURIComponent('张') + '&page=1&pageSize=20', { headers: H });
  if (r.body.code !== 0 || !Array.isArray(r.body.data.list)) throw new Error('students 异常');
});

let newId = '';
await step('新建排课（明日）', async () => {
  const d = new Date(Date.now() + 86400000);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const courses = (await j('/admin/courses', { headers: H })).body.data.list;
  const teachers = (await j('/admin/teachers', { headers: H })).body.data.list;
  if (!courses.length) throw new Error('无课程参考数据');
  const r = await j('/schedules', {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ courseId: courses[0].id, teacherId: teachers[0]?.id || '', classroomId: '', date, startTime: '06:00', endTime: '07:00', maxStudents: 12, remark: '小程序管理端测试' }),
  });
  if (r.body.code !== 0) throw new Error(JSON.stringify(r.body));
  newId = r.body.data.id;
});
await step('查询当日排课包含新建项', async () => {
  const d = new Date(Date.now() + 86400000);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const r = await j(`/schedules?startDate=${date}&endDate=${date}&pageSize=100`, { headers: H });
  const hit = (r.body.data.list || []).find((s) => s.id === newId);
  if (!hit) throw new Error('新建排课未出现在列表中');
});
await step('取消排课（DELETE 软取消）', async () => {
  const r = await j('/schedules/' + newId, { method: 'DELETE', headers: H });
  if (r.body.code !== 0) throw new Error(JSON.stringify(r.body));
});
await step('恢复排课（PUT status）', async () => {
  const r = await j('/schedules/' + newId, { method: 'PUT', headers: H, body: JSON.stringify({ status: 'scheduled' }) });
  if (r.body.code !== 0) throw new Error(JSON.stringify(r.body));
});

// 会员卡暂停/恢复（使用专用临时卡，不动演示数据）
let cardId = '';
await step('创建临时会员卡', async () => {
  const now = Date.now();
  clean("INSERT INTO member_cards (id, card_type_id, card_type_name, student_id, student_name, total_classes, remaining_classes, status, expires_at, created_at, updated_at) VALUES ('mc_test_pause', 'ct_002', '测试卡', 'stu_001', '张小明', 10, 10, 'active', ?, ?, ?)", [now + 30 * 86400000, now, now]);
  cardId = 'mc_test_pause';
});
await step('暂停会员卡', async () => {
  const r = await j('/membership/pause', { method: 'POST', headers: H, body: JSON.stringify({ cardId, reason: '测试暂停' }) });
  if (r.body.code !== 0) throw new Error(JSON.stringify(r.body));
});
await step('恢复会员卡（按暂停天数顺延）', async () => {
  const r = await j('/membership/resume', { method: 'POST', headers: H, body: JSON.stringify({ cardId }) });
  if (r.body.code !== 0) throw new Error(JSON.stringify(r.body));
  const ext = (r.body.data.pausedDays || 0) + '天顺延';
  if (r.body.data.status !== 'active') throw new Error('恢复后状态异常');
  const check = await j('/membership/my?studentId=stu_001', { method: 'GET', headers: H });
  const resumed = (check.body.data || []).find((c) => c.id === cardId);
  if (resumed && resumed.pause_reason) throw new Error('恢复后暂停原因未清空: ' + resumed.pause_reason);
  console.log('  (临时卡恢复，' + ext + ')');
});
await step('清理临时会员卡', async () => {
  clean('DELETE FROM member_cards WHERE id = ?', [cardId]);
});

// 清理测试排课
await step('清理测试排课', async () => {
  await j('/schedules/' + newId, { method: 'DELETE', headers: H });
});

// ===== 请假审批流 =====
let leaveId = '', fbId = '', leaveSchedId = '';
await step('家长提交请假申请（新建排课）', async () => {
  const pj = await j('/auth/login', { method: 'POST', body: JSON.stringify({ phone: '13900000001', role: 'parent', nickname: '小明爸爸' }) });
  if (pj.body.code !== 0) throw new Error(JSON.stringify(pj.body));
  const parentOid = pj.body.data.openid;
  const d = new Date(Date.now() + 86400000);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  // 先新建一条独立排课（避开种子数据中已有的请假记录）
  const courses = (await j('/admin/courses', { headers: H })).body.data.list;
  const teachers = (await j('/admin/teachers', { headers: H })).body.data.list;
  const schedCreate = await j('/schedules', {
    method: 'POST', headers: H,
    body: JSON.stringify({ courseId: courses[0].id, teacherId: teachers[0]?.id || '', classroomId: '', date, startTime: '05:30', endTime: '06:30', maxStudents: 10, remark: '请假流程测试' }),
  });
  if (schedCreate.body.code !== 0) throw new Error(JSON.stringify(schedCreate.body));
  leaveSchedId = schedCreate.body.data.id;
  const r = await j('/leave/apply', { method: 'POST', headers: { 'x-openid': parentOid }, body: JSON.stringify({ scheduleId: leaveSchedId, reason: '小程序管理端测试请假' }) });
  if (r.body.code !== 0) throw new Error(JSON.stringify(r.body));
  leaveId = r.body.data.id;
});
await step('管理员查看待审批列表', async () => {
  const r = await j('/leave?status=pending', { headers: H });
  if (r.body.code !== 0 || !(r.body.data.list || []).some((x) => x.id === leaveId)) throw new Error('待审批列表未包含新申请');
});
await step('管理员批准请假', async () => {
  const r = await j('/leave/' + leaveId + '/approve', { method: 'PUT', headers: H, body: JSON.stringify({ action: 'approve', note: '同意' }) });
  if (r.body.code !== 0) throw new Error(JSON.stringify(r.body));
});
await step('请假状态已更新为 approved', async () => {
  const r = await j('/leave?status=approved', { headers: H });
  const hit = (r.body.data.list || []).find((x) => x.id === leaveId);
  if (!hit || hit.status !== 'approved') throw new Error('状态未更新');
});

// ===== 反馈处理流 =====
await step('家长提交意见反馈', async () => {
  const pj = await j('/auth/login', { method: 'POST', body: JSON.stringify({ phone: '13900000001', role: 'parent' }) });
  const parentOid = pj.body.data.openid;
  const r = await j('/feedback/apply', { method: 'POST', headers: { 'x-openid': parentOid }, body: JSON.stringify({ content: '小程序管理端测试反馈', contact: '13900000001' }) });
  if (r.body.code !== 0) throw new Error(JSON.stringify(r.body));
  fbId = r.body.data.id;
});
await step('管理员列表包含待处理反馈', async () => {
  const r = await j('/feedback?status=pending', { headers: H });
  if (!(r.body.data.list || []).some((x) => x.id === fbId)) throw new Error('待处理列表未包含新反馈');
});
await step('管理员标记反馈已处理', async () => {
  const r = await j('/feedback/' + fbId + '/status', { method: 'PUT', headers: H, body: JSON.stringify({ status: 'done' }) });
  if (r.body.code !== 0) throw new Error(JSON.stringify(r.body));
});
await step('反馈状态已更新为 done', async () => {
  const r = await j('/feedback?status=done', { headers: H });
  const hit = (r.body.data.list || []).find((x) => x.id === fbId);
  if (!hit || hit.status !== 'done') throw new Error('状态未更新');
});

// 清理测试数据（直接删库，避免污染演示数据）
// 清理必须按外键顺序：先删子表（考勤/请假），再删排课，最后删反馈；每条独立执行互不阻塞

clean("DELETE FROM attendances WHERE schedule_id IN (SELECT id FROM schedules WHERE id IN (?, ?) OR remark IN ('小程序管理端测试','请假流程测试'))", [newId, leaveSchedId]);
clean("DELETE FROM leave_requests WHERE id = ?", [leaveId]);
clean("DELETE FROM leave_requests WHERE reason LIKE '%测试请假%'");
clean("DELETE FROM schedules WHERE id IN (?, ?)", [newId, leaveSchedId]);
clean("DELETE FROM schedules WHERE remark IN ('小程序管理端测试','请假流程测试')");
clean("DELETE FROM feedback WHERE id = ?", [fbId]);
clean("DELETE FROM feedback WHERE content LIKE '%小程序管理端测试%'");
clean("DELETE FROM attendances WHERE schedule_id IN (SELECT id FROM schedules WHERE remark IN ('签到流程测试'))");
clean("DELETE FROM enrollments WHERE schedule_id IN (SELECT id FROM schedules WHERE remark IN ('签到流程测试'))");
clean("DELETE FROM point_logs WHERE reference_id IN (SELECT id FROM schedules WHERE remark IN ('签到流程测试')) AND type = 'checkin'");
clean("DELETE FROM schedules WHERE remark IN ('签到流程测试')");
console.log('✓ 测试数据已清理');

// ===== 数据概览 =====
await step('数据概览（dashboard 结构完整）', async () => {
  const r = await j('/admin/dashboard', { headers: H });
  if (r.body.code !== 0) throw new Error(JSON.stringify(r.body));
  const d = r.body.data;
  if (!d.overview || !d.revenue || !d.today || !d.alerts || !d.sales) throw new Error('dashboard 结构缺失');
  if (typeof d.revenue.today !== 'number' || typeof d.overview.totalStudents !== 'number') throw new Error('dashboard 字段类型异常');
});

// ===== 家长通讯录 =====
await step('家长通讯录（分组+学员）', async () => {
  const r = await j('/admin/parents', { headers: H });
  if (r.body.code !== 0) throw new Error(JSON.stringify(r.body));
  const list = r.body.data.list || [];
  const hit = list.find((p) => p.parent_phone === '13900000001');
  if (!hit) throw new Error('未找到测试家长');
  if (!Array.isArray(hit.students) || hit.students.length === 0) throw new Error('家长未绑定学员');
});

// ===== 订单查询 =====
await step('销售订单列表（已支付）', async () => {
  const r = await j('/orders?status=paid&page=1&pageSize=50', { headers: H });
  if (r.body.code !== 0) throw new Error(JSON.stringify(r.body));
  const list = r.body.data.list || [];
  const hit = list.find((o) => o.student_name === '张小明' && o.payable_amount === 1299);
  if (!hit) throw new Error('未找到演示订单');
});

// ===== 签到点名流 =====
let attSchedId = '', attStudentId = '', attPointsBefore = 0;
await step('签到点名（建课→报名→点名→考勤记录）', async () => {
  const d = new Date(Date.now() + 86400000);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const courses = (await j('/admin/courses', { headers: H })).body.data.list;
  const teachers = (await j('/admin/teachers', { headers: H })).body.data.list;
  const sc = await j('/schedules', { method: 'POST', headers: H, body: JSON.stringify({ courseId: courses[0].id, teacherId: teachers[0]?.id || '', classroomId: '', date, startTime: '05:00', endTime: '06:00', maxStudents: 10, remark: '签到流程测试' }) });
  if (sc.body.code !== 0) throw new Error(JSON.stringify(sc.body));
  attSchedId = sc.body.data.id;
  // 家长报名
  const pj = await j('/auth/login', { method: 'POST', body: JSON.stringify({ phone: '13900000001', role: 'parent' }) });
  const parentOid = pj.body.data.openid;
  const enroll = await j('/schedules/' + attSchedId + '/enroll', { method: 'POST', headers: { 'x-openid': parentOid }, body: JSON.stringify({}) });
  if (enroll.body.code !== 0) throw new Error('报名失败: ' + JSON.stringify(enroll.body));
  // 取报名学生
  const det = await j('/schedules/' + attSchedId, { headers: H });
  const stu = det.body.data.students[0];
  if (!stu) throw new Error('未获取到报名学生');
  attStudentId = stu.student_id;
  attPointsBefore = (await (await j('/points/balance?studentId=' + attStudentId, { headers: H }))).body.data.balance || 0;
  // 点名两次（验证积分幂等）
  const att = { scheduleId: attSchedId, attendances: [{ studentId: attStudentId, status: 'present', checkinMethod: 'manual' }] };
  await j('/checkin/teacher', { method: 'POST', headers: H, body: JSON.stringify(att) });
  await j('/checkin/teacher', { method: 'POST', headers: H, body: JSON.stringify(att) });
  // 校验考勤记录（查排课详情中的签到状态）
  const det2 = await j('/schedules/' + attSchedId, { headers: H });
  const stu2 = (det2.body.data.students || []).find((x) => x.student_id === attStudentId);
  if (!stu2 || stu2.checkin_status !== 'present') throw new Error('考勤记录未写入: ' + JSON.stringify(stu2));
  const attPointsAfter = (await (await j('/points/balance?studentId=' + attStudentId, { headers: H }))).body.data.balance;
  if (attPointsAfter - attPointsBefore !== 10) throw new Error(`积分幂等异常: ${attPointsBefore} -> ${attPointsAfter}`);
});
await step('清理签到测试数据', async () => {
  clean('DELETE FROM attendances WHERE schedule_id = ?', [attSchedId]);
  clean('DELETE FROM point_logs WHERE reference_id = ? AND type = ?', [attSchedId, 'checkin']);
  clean("UPDATE points SET total_earned = total_earned - 10, balance = balance - 10 WHERE student_id = ?", [attStudentId]);
  clean('DELETE FROM enrollments WHERE schedule_id = ?', [attSchedId]);
  clean('DELETE FROM schedules WHERE id = ?', [attSchedId]);
});
// ===== 班级/项目管理 =====
let courseId = '';
await step('班级管理（含停用项+新建+启停）', async () => {
  const r1 = await j('/admin/courses?includeInactive=1', { headers: H });
  if (r1.body.code !== 0) throw new Error(JSON.stringify(r1.body));
  const hasInactive = (r1.body.data.list || []).some((c) => c.is_active === 0);
  const rc = await j('/admin/courses', { method: 'POST', headers: H, body: JSON.stringify({ name: '小程序测试项目', category: '测试', duration: 60, consumeClasses: 1, maxStudents: 8, pricePerClass: 50 }) });
  if (rc.body.code !== 0) throw new Error(JSON.stringify(rc.body));
  courseId = rc.body.data.id;
  const r2 = await j('/admin/courses?includeInactive=1', { headers: H });
  const hit = (r2.body.data.list || []).find((c) => c.id === courseId);
  if (!hit || hit.is_active !== 1) throw new Error('新建项目未出现或状态异常');
  await j('/admin/courses/' + courseId, { method: 'PUT', headers: H, body: JSON.stringify({ isActive: 0 }) });
  const r3 = await j('/admin/courses?includeInactive=1', { headers: H });
  const hit2 = (r3.body.data.list || []).find((c) => c.id === courseId);
  if (!hit2 || hit2.is_active !== 0) throw new Error('停用未生效');
});

// ===== 员工管理 =====
let teacherId = '', teacherPhone = '13899998888';
await step('员工管理（含停用项+新增+启停）', async () => {
  const r1 = await j('/admin/teachers?includeInactive=1', { headers: H });
  if (r1.body.code !== 0) throw new Error(JSON.stringify(r1.body));
  const rc = await j('/admin/teachers', { method: 'POST', headers: H, body: JSON.stringify({ name: '测试教练', phone: teacherPhone, specialty: '测试', gender: '男' }) });
  if (rc.body.code !== 0) throw new Error(JSON.stringify(rc.body));
  teacherId = rc.body.data.id;
  // 教练账号同步
  const login = await j('/auth/login', { method: 'POST', body: JSON.stringify({ phone: teacherPhone, role: 'coach', password: '123456' }) });
  if (login.body.code !== 0) throw new Error('教练登录账号未同步: ' + JSON.stringify(login.body));
  // 无 phone 的重置密码/改名/提权操作不应误停用账号或丢失权限
  const rp = await j('/admin/teachers/' + teacherId, { method: 'PUT', headers: H, body: JSON.stringify({ resetPassword: true }) });
  if (rp.body.code !== 0) throw new Error('重置密码失败: ' + JSON.stringify(rp.body));
  const loginA = await j('/auth/login', { method: 'POST', body: JSON.stringify({ phone: teacherPhone, role: 'coach', password: '123456' }) });
  if (loginA.body.code !== 0) throw new Error('重置密码后账号被误停用: ' + JSON.stringify(loginA.body));
  const promote = await j('/admin/teachers/' + teacherId, { method: 'PUT', headers: H, body: JSON.stringify({ role: 'admin' }) });
  if (promote.body.code !== 0) throw new Error('提权失败: ' + JSON.stringify(promote.body));
  const demote = await j('/admin/teachers/' + teacherId, { method: 'PUT', headers: H, body: JSON.stringify({ role: 'coach' }) });
  if (demote.body.code !== 0) throw new Error('降权失败: ' + JSON.stringify(demote.body));
  const loginB = await j('/auth/login', { method: 'POST', body: JSON.stringify({ phone: teacherPhone, role: 'coach', password: '123456' }) });
  if (loginB.body.code !== 0) throw new Error('提降权后账号异常: ' + JSON.stringify(loginB.body));
  await j('/admin/teachers/' + teacherId, { method: 'PUT', headers: H, body: JSON.stringify({ status: 'inactive' }) });
  const login2 = await j('/auth/login', { method: 'POST', body: JSON.stringify({ phone: teacherPhone, role: 'coach', password: '123456' }) });
  if (login2.body.code === 0) throw new Error('停用后教练仍可登录');
});

// ===== 系统设置 =====
let origOrg = null, origService = null, origUniform = null;
await step('系统设置（读取+保存+还原）', async () => {
  const r1 = await j('/settings', { headers: H });
  if (r1.body.code !== 0) throw new Error(JSON.stringify(r1.body));
  origOrg = r1.body.data.org_info || {};
  origService = r1.body.data.service_phone;
  origUniform = r1.body.data.uniform_price;
  const save = await j('/settings', { method: 'PUT', headers: H, body: JSON.stringify({ org_info: { ...origOrg, name: '星课篮球训练营(测试)' }, service_phone: '13900000000', uniform_price: 60 }) });
  if (save.body.code !== 0) throw new Error(JSON.stringify(save.body));
  const r2 = await j('/settings', { headers: H });
  if (r2.body.data.org_info.name !== '星课篮球训练营(测试)') throw new Error('设置保存未生效');
  // 还原并校验
  const restore = await j('/settings', { method: 'PUT', headers: H, body: JSON.stringify({ org_info: origOrg, service_phone: origService, uniform_price: origUniform }) });
  if (restore.body.code !== 0) throw new Error('还原失败: ' + JSON.stringify(restore.body));
  const r3 = await j('/settings', { headers: H });
  if (r3.body.data.org_info.name !== origOrg.name) throw new Error('还原未生效: ' + r3.body.data.org_info.name);
});

// 清理三模块测试数据
try {
  if (courseId) {
    clean('DELETE FROM schedules WHERE course_id = ?', [courseId]);
    clean('DELETE FROM courses WHERE id = ?', [courseId]);
  }
  if (teacherId) {
    clean('DELETE FROM teachers WHERE id = ?', [teacherId]);
    clean('DELETE FROM users WHERE phone = ?', [teacherPhone]);
  }
  console.log('✓ 班级/员工测试数据已清理');
} catch (e) {
  console.log('⚠ 清理失败:', e.message);
}

console.log(results.join('\n'));
const failed = results.filter((r) => r.startsWith('✗')).length;
console.log(failed ? `失败 ${failed}/${results.length}` : `管理端 API 全流程 ${results.length}/${results.length} 通过`);
process.exit(failed ? 1 : 0);
dbClean.close();
