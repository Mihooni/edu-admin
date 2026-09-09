/**
 * 课程班级模块集成冒烟测试（隔离数据库，不启动真实 server）
 * 覆盖：迁移落地、班级 CRUD、分班(多班)、排期关联班级、班级可见性、
 *       报名请求提交/审批、排期通知发布。
 */
const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');

const DB_PATH = '/tmp/test_class_module.db';
if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

process.env.DB_PATH = DB_PATH;
process.env.JWT_SECRET = 'test-secret';

// 初始化数据库（执行 init + 迁移）
require('../db');

const classRoutes = require('../routes/classes');
const scheduleRoutes = require('../routes/schedules');
const db = require('../db');

// 种子数据
function seed() {
  const t = Date.now();
  const ins = db.prepare('INSERT OR REPLACE INTO students (id, name, status, created_at, updated_at) VALUES (?,?,?,?,?)');
  ins.run('stu_1', '学员A', 'active', t, t);
  ins.run('stu_2', '学员B', 'active', t, t);
  const u = db.prepare('INSERT OR REPLACE INTO users (id, openid, role, status, created_at, updated_at) VALUES (?,?,?,?,?,?)');
  u.run('user_admin', 'admin1', 'admin', 'active', t, t);
  u.run('user_parent1', 'parent1', 'parent', 'active', t, t);
  u.run('user_parent2', 'parent2', 'parent', 'active', t, t);
  db.prepare('INSERT OR REPLACE INTO parent_bindings (id, student_id, student_name, parent_name, parent_openid, parent_phone, relation, is_main, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(1, 'stu_1', '学员A', '家长1', 'parent1', '13800000001', '家长', 1, t);
  db.prepare('INSERT OR REPLACE INTO parent_bindings (id, student_id, student_name, parent_name, parent_openid, parent_phone, relation, is_main, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(2, 'stu_2', '学员B', '家长2', 'parent2', '13800000002', '家长', 1, t);
}
seed();

// 构建测试用 express 应用（用测试中间件模拟登录角色，避免真实 JWT）
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  const role = req.headers['x-test-role'];
  const openid = req.headers['x-test-openid'];
  if (openid) req.openid = openid;
  if (role) req.userRole = role;
  next();
});
app.use('/api/classes', classRoutes);
app.use('/api/schedules', scheduleRoutes);

const server = http.createServer(app);
server.listen(0, async () => {
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const results = [];
  const assert = (name, cond, extra) => { results.push({ name, ok: !!cond, extra }); };

  async function call(method, p, { body, role, openid, admin } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (role) headers['x-test-role'] = role;
    if (openid) headers['x-test-openid'] = openid;
    const res = await fetch(base + p, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch (e) {}
    return { status: res.status, data };
  }

  try {
    // 0. 迁移落地检查
    const cols = (tbl) => db.prepare(`PRAGMA table_info(${tbl})`).all().map(c => c.name);
    assert('classes 表存在', cols('classes').includes('id'));
    assert('class_members 表存在', cols('class_members').includes('class_id'));
    assert('schedules.class_id 列存在', cols('schedules').includes('class_id'));
    assert('enrollments.request_status 列存在', cols('enrollments').includes('request_status'));
    assert('enrollments.class_id 列存在', cols('enrollments').includes('class_id'));

    // 1. 创建班级 cls1
    const c1 = await call('POST', '/api/classes', { role: 'admin', body: { name: '春季篮球A班', scheduleDesc: '周三18:00', maxMembers: 10 } });
    assert('创建班级成功', c1.data && c1.data.code === 0 && c1.data.data.id, c1.data);
    const cls1 = c1.data.data.id;

    // 2. 分班：stu_1 加入 cls1
    const m1 = await call('POST', `/api/classes/${cls1}/members`, { role: 'admin', body: { studentIds: ['stu_1'] } });
    assert('分班添加成员', m1.data && m1.data.code === 0 && m1.data.data.added === 1, m1.data);

    // 2b. 一个会员可多班：再建 cls2，stu_1 同时加入
    const c2 = await call('POST', '/api/classes', { role: 'admin', body: { name: '体适能B班' } });
    const cls2 = c2.data.data.id;
    await call('POST', `/api/classes/${cls2}/members`, { role: 'admin', body: { studentIds: ['stu_1', 'stu_2'] } });
    const multi = db.prepare('SELECT COUNT(*) c FROM class_members WHERE student_id = ?').get('stu_1').c;
    assert('学员可加入多个班级', multi === 2, { multi });

    // 3. 按班级筛选学员
    const mem = await call('GET', `/api/classes/${cls1}/members`, { role: 'admin' });
    assert('按班级筛选学员(名册)', mem.data && mem.data.code === 0 && mem.data.data.total === 1, mem.data);
    assert('名册含正确学员', mem.data.data.list[0] && mem.data.data.list[0].student_id === 'stu_1', mem.data.data.list[0]);

    // 4. 创建排期并关联 cls1
    const today = new Date().toISOString().slice(0, 10);
    const s1 = await call('POST', '/api/schedules', { role: 'admin', body: { courseName: '篮球训练', date: today, startTime: '18:00', endTime: '19:00', maxStudents: 10, classId: cls1 } });
    assert('创建排期并关联班级', s1.data && s1.data.code === 0 && s1.data.data.id, s1.data);
    const sch1 = s1.data.data.id;
    const schRow = db.prepare('SELECT class_id FROM schedules WHERE id = ?').get(sch1);
    assert('排期 class_id 已写入', schRow.class_id === cls1, schRow);

    // 5. 班级可见性：parent1（成员）可见；parent2（非成员）不可见
    const vis1 = await call('GET', '/api/schedules', { openid: 'parent1' });
    const sees1 = vis1.data.data.list.some(s => s.id === sch1);
    assert('班级成员家长可见该排期', sees1, { count: vis1.data.data.list.length });
    const vis2 = await call('GET', '/api/schedules', { openid: 'parent2' });
    const sees2 = vis2.data.data.list.some(s => s.id === sch1);
    assert('非班级成员家长不可见该排期', !sees2, { count: vis2.data.data.list.length });

    // 6. 报名请求：parent1 为 stu_1 提交
    const req1 = await call('POST', `/api/classes/schedules/${sch1}/request`, { openid: 'parent1', body: { studentId: 'stu_1' } });
    assert('提交报名请求成功', req1.data && req1.data.code === 0 && req1.data.data.status === 'pending', req1.data);
    const reqId = req1.data.data.requestId;
    const pendingRow = db.prepare('SELECT status, request_status, class_id FROM enrollments WHERE id = ?').get(reqId);
    assert('报名请求初始为 pending', pendingRow.status === 'pending' && pendingRow.request_status === 'pending' && pendingRow.class_id === cls1, pendingRow);

    // 6b. 非班级成员报名被拒
    const reqBad = await call('POST', `/api/classes/schedules/${sch1}/request`, { openid: 'parent2', body: { studentId: 'stu_2' } });
    assert('非本班成员报名被拒绝', reqBad.data && reqBad.data.code !== 0, reqBad.data);

    // 7. 列出班级报名请求
    const listReq = await call('GET', `/api/classes/${cls1}/registration-requests`, { role: 'admin' });
    assert('班级报名请求列表含1条', listReq.data && listReq.data.data.total === 1, listReq.data);

    // 8. 审批通过
    const ap = await call('POST', `/api/classes/${cls1}/registration-requests/${reqId}/approve`, { role: 'admin' });
    assert('审批通过成功', ap.data && ap.data.code === 0, ap.data);
    const after = db.prepare('SELECT e.status, e.request_status, s.enrolled_count FROM enrollments e JOIN schedules s ON s.id=e.schedule_id WHERE e.id=?').get(reqId);
    assert('审批后状态为 active', after.status === 'active' && after.request_status === 'approved', after);
    const schEnroll = db.prepare('SELECT enrolled_count FROM schedules WHERE id = ?').get(sch1);
    assert('审批后报名人数+1', schEnroll.enrolled_count === 1, schEnroll);

    // 9. 排期详情 students 含已通过学员
    const detail = await call('GET', `/api/schedules/${sch1}`, { role: 'admin' });
    const inDetail = detail.data.data.students.some(s => s.student_id === 'stu_1');
    assert('排期详情含已通过学员', inDetail, detail.data.data.students);

    // 10. 发布排期通知：推送给班级成员家长
    const note = await call('POST', `/api/classes/${cls1}/notify`, { role: 'admin', body: { scheduleId: sch1, title: '本周训练提醒', content: '请准时参加' } });
    assert('发布通知成功', note.data && note.data.code === 0 && note.data.data.notified >= 1, note.data);
    const noteCount = db.prepare("SELECT COUNT(*) c FROM notifications WHERE title='本周训练提醒' AND category='class'").get().c;
    assert('通知已写入 notifications', noteCount >= 1, { noteCount });

    // 11. 班级详情统计
    const cd = await call('GET', `/api/classes/${cls1}`, { role: 'admin' });
    assert('班级详情含成员数与排期数', cd.data && cd.data.data.member_count === 1 && cd.data.data.schedule_count === 1, cd.data.data);

    // 12. 删除班级（清理成员与排期关联）
    const del = await call('DELETE', `/api/classes/${cls2}`, { role: 'admin' });
    assert('删除班级成功', del.data && del.data.code === 0, del.data);
    const cmAfter = db.prepare('SELECT COUNT(*) c FROM class_members WHERE class_id = ?').get(cls2).c;
    assert('删除班级后成员已清理', cmAfter === 0, { cmAfter });

  } catch (e) {
    results.push({ name: '异常', ok: false, extra: e.stack });
  } finally {
    server.close();
    const pass = results.filter(r => r.ok).length;
    const fail = results.length - pass;
    console.log('\n==== 课程班级模块冒烟测试 ====');
    for (const r of results) console.log(`${r.ok ? '✅' : '❌'} ${r.name}`, r.extra ? JSON.stringify(r.extra) : '');
    console.log(`\n通过 ${pass} / ${results.length}，失败 ${fail}`);
    process.exit(fail === 0 ? 0 : 1);
  }
});
