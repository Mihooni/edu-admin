// 多孩家庭 + 双家长共管 API 实测
import path from 'node:path';
const __ROOT = (() => {
  const p = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  return p;
})();
const base = 'http://localhost:3001/api';
const j = async (path, opts = {}) => {
  const { headers, ...rest } = opts;
  const res = await fetch(base + path, { ...rest, headers: { 'content-type': 'application/json', ...(headers || {}) } });
  return { status: res.status, body: await res.json() };
};
const results = [];
async function step(name, fn) { try { await fn(); results.push(`✓ ${name}`); } catch (e) { results.push(`✗ ${name}: ${String(e).slice(0, 180)}`); } }

// 准备：给小红妈妈加第二个孩子绑定（stu_001 张小明），测试后清理
const { createRequire } = await import('module');
const db = createRequire(`${__ROOT}/backend/package.json`)('better-sqlite3')(`${__ROOT}/backend/db/data.db`);
db.prepare("INSERT OR IGNORE INTO parent_bindings (parent_openid, student_id, parent_name, parent_phone, relation, is_main) VALUES ('phone_13900000002', 'stu_001', '小红妈妈', '13900000002', '妈妈', 0)").run();

let oid = '';
await step('家长登录（13900000002 小红妈妈）', async () => {
  const r = await j('/auth/login', { method: 'POST', body: JSON.stringify({ phone: '13900000002', role: 'parent', nickname: '小红妈妈' }) });
  if (r.body.code !== 0) throw new Error(JSON.stringify(r.body));
  oid = r.body.data.openid;
});
const H = { 'x-openid': oid };

let schedId = '';
await step('建明日排课', async () => {
  const oa = await j('/auth/login', { method: 'POST', body: JSON.stringify({ phone: '13800000001', role: 'admin', password: '123456' }) });
  const adminH = { 'x-openid': oa.body.data.openid };
  const courses = (await j('/admin/courses', { headers: adminH })).body.data.list;
  const d = new Date(Date.now() + 86400000);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const r = await j('/schedules', { method: 'POST', headers: adminH, body: JSON.stringify({ courseId: courses[0].id, teacherId: '', classroomId: '', date, startTime: '08:30', endTime: '09:30', maxStudents: 20, remark: '多孩测试' }) });
  if (r.body.code !== 0) throw new Error(JSON.stringify(r.body));
  schedId = r.body.data.id;
});

await step('给李小红（stu_002）报名', async () => {
  const r = await j(`/schedules/${schedId}/enroll`, { method: 'POST', headers: H, body: JSON.stringify({ studentId: 'stu_002' }) });
  if (r.body.code !== 0 || r.body.data.studentId !== 'stu_002') throw new Error(JSON.stringify(r.body));
});
await step('给张小明（stu_001）报名（多孩）', async () => {
  const r = await j(`/schedules/${schedId}/enroll`, { method: 'POST', headers: H, body: JSON.stringify({ studentId: 'stu_001' }) });
  if (r.body.code !== 0 || r.body.data.studentId !== 'stu_001') throw new Error(JSON.stringify(r.body));
});
await step('重复报名幂等（stu_002 已报名）', async () => {
  const r = await j(`/schedules/${schedId}/enroll`, { method: 'POST', headers: H, body: JSON.stringify({ studentId: 'stu_002' }) });
  if (r.body.code !== 1) throw new Error('应返回"已报名该活动"');
});
await step('未绑定孩子报名被拒（stu_003）', async () => {
  const r = await j(`/schedules/${schedId}/enroll`, { method: 'POST', headers: H, body: JSON.stringify({ studentId: 'stu_003' }) });
  if (r.body.code !== 1) throw new Error('应拒绝未绑定成员');
});
await step('/schedules/my 返回两个孩子报名信息', async () => {
  const r = await j('/schedules/my', { headers: H });
  const mine = (r.body.data.list || []).filter((x) => x.id === schedId);
  const names = mine.map((x) => x.student_name).sort();
  if (names.join(',') !== '张小明,李小红') throw new Error('报名孩子信息不完整: ' + JSON.stringify(names));
});
await step('按孩子取消（仅取消李小红）', async () => {
  const r = await j(`/schedules/${schedId}/enroll`, { method: 'DELETE', headers: H, body: JSON.stringify({ studentId: 'stu_002' }) });
  if (r.body.code !== 0 || r.body.data.removed !== 1) throw new Error(JSON.stringify(r.body));
  const r2 = await j('/schedules/my', { headers: H });
  const mine = (r2.body.data.list || []).filter((x) => x.id === schedId).map((x) => x.student_name);
  if (mine.join(',') !== '张小明') throw new Error('取消后残留错误: ' + JSON.stringify(mine));
});
await step('不指定孩子取消（仅取消一个，不误删）', async () => {
  const r = await j(`/schedules/${schedId}/enroll`, { method: 'DELETE', headers: H });
  if (r.body.code !== 0 || r.body.data.removed !== 1) throw new Error(JSON.stringify(r.body));
  const r2 = await j('/schedules/my', { headers: H });
  if ((r2.body.data.list || []).filter((x) => x.id === schedId).length !== 0) throw new Error('应全部取消');
});
await step('home/data 支持指定孩子', async () => {
  const r1 = await j('/students/home/data?studentId=stu_002', { headers: H });
  const r2 = await j('/students/home/data?studentId=stu_001', { headers: H });
  if (r1.body.data.student.name !== '李小红' || r2.body.data.student.name !== '张小明') throw new Error('home/data 孩子不匹配');
});

// 双家长共管：爸爸视角看到妈妈报的名（用小明爸爸账号验证）
await step('双家长共享：爸爸端看到妈妈的报名', async () => {
  const r = await j('/auth/login', { method: 'POST', body: JSON.stringify({ phone: '13900000001', role: 'parent', nickname: '小明爸爸' }) });
  const dadH = { 'x-openid': r.body.data.openid };
  // 妈妈先给张小明报名
  await j(`/schedules/${schedId}/enroll`, { method: 'POST', headers: H, body: JSON.stringify({ studentId: 'stu_001' }) });
  const mine = await j('/schedules/my', { headers: dadH });
  const hit = (mine.body.data.list || []).find((x) => x.id === schedId && x.student_id === 'stu_001');
  if (!hit) throw new Error('爸爸端未看到妈妈的报名');
  // 爸爸重复报名被拒（幂等）
  const dup = await j(`/schedules/${schedId}/enroll`, { method: 'POST', headers: dadH, body: JSON.stringify({ studentId: 'stu_001' }) });
  if (dup.body.code !== 1) throw new Error('爸爸重复报名应被拒');
  // 爸爸取消该孩子报名（共管可操作）
  const un = await j(`/schedules/${schedId}/enroll`, { method: 'DELETE', headers: dadH, body: JSON.stringify({ studentId: 'stu_001' }) });
  if (un.body.code !== 0) throw new Error('爸爸取消失败');
});

// 清理
await step('清理测试数据', async () => {
  db.prepare('DELETE FROM enrollments WHERE schedule_id = ?').run(schedId);
  db.prepare('DELETE FROM schedules WHERE id = ?').run(schedId);
  db.prepare("DELETE FROM parent_bindings WHERE parent_openid='phone_13900000002' AND student_id='stu_001'").run();
  db.close();
  console.log('  (测试数据已清理)');
});
console.log(results.join('\n'));
const failed = results.filter((r) => r.startsWith('✗')).length;
console.log(failed ? `失败 ${failed}/${results.length}` : `多孩/双家长 API 全流程 ${results.length}/${results.length} 通过`);
process.exit(failed ? 1 : 0);
