// 管理端优化验证：工作台展开数据 / 修改排课 / 今日活动已签到
import path from 'node:path';
const __ROOT = (() => {
  const p = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  return p;
})();
const BASE = 'http://localhost:3001/api'
let ok = 0, fail = 0
const assert = (n, c, x = '') => { if (c) { ok++; console.log('✓ ' + n) } else { fail++; console.log('✗ ' + n + ' ' + x) } }
const login = async (phone, role, pw) => (await (await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, role, password: pw }) })).json()).data.token
const aToken = await login('13800000001', 'admin', '123456')
const ah = { 'Content-Type': 'application/json', Authorization: `Bearer ${aToken}` }
const acall = async (path, opts = {}) => (await fetch(BASE + path, { method: opts.m || 'GET', headers: ah, body: opts.b ? JSON.stringify(opts.b) : undefined })).json()

// 1. 工作台展开数据（dashboard 全字段）
const dash = await acall('/admin/dashboard')
assert('看板含本周/本年收入', dash.code === 0 && dash.data.revenue.week !== undefined && dash.data.revenue.year !== undefined)
assert('看板含有效会员/今日签到/课程', dash.data.overview.totalStudents !== undefined && dash.data.today.checkins !== undefined && dash.data.today.schedules !== undefined)
assert('看板含签单排名', Array.isArray(dash.data.sales.monthRanking))

// 2. 修改排课（PUT /schedules/:id）
const _t = Date.now().toString(36)
const _course = await acall('/admin/courses', { m: 'POST', b: { name: '优化验证课' + _t, category: '篮球', duration: 60, consume_classes: 1, max_students: 10, price_per_class: 80 } })
const sch = await acall('/schedules', { m: 'POST', b: { courseId: _course.data.id, date: '2034-06-01', startTime: '09:00', endTime: '10:00', teacherId: 'teacher_001', maxStudents: 10 } })
const upd = await acall('/schedules/' + sch.data.id, { m: 'PUT', b: { date: '2034-06-02', startTime: '10:30', endTime: '11:30', teacherId: 'teacher_002', maxStudents: 8 } })
assert('修改排课成功', upd.code === 0, JSON.stringify(upd))
const detail = await acall('/schedules/' + sch.data.id)
assert('修改后字段生效', detail.data.date === '2034-06-02' && detail.data.start_time === '10:30' && detail.data.teacher_name === '李教练' && detail.data.max_students === 8, JSON.stringify({ d: detail.data.date, t: detail.data.start_time, tr: detail.data.teacher_name, m: detail.data.max_students }))

// 3. 今日活动已签到人数（创建今日活动 + 签到）
const d = new Date(); const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
const sch2 = await acall('/schedules', { m: 'POST', b: { courseId: _course.data.id, date: today, startTime: '14:00', endTime: '15:00', teacherId: 'teacher_001', maxStudents: 10 } })
// 报名 + 签到一个
await fetch(BASE + `/schedules/${sch2.data.id}/enroll`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-openid': 'phone_13900000001' }, body: JSON.stringify({ studentId: 'stu_001' }) })
await acall('/checkin/teacher', { m: 'POST', b: { scheduleId: sch2.data.id, attendances: [{ studentId: 'stu_001', status: 'present' }] } })
const home = await fetch(BASE + '/students/home/data', { headers: { 'x-openid': 'phone_13900000001' } }).then((r) => r.json())
const tc = (home.data.todayClasses || []).find((c) => c.id === sch2.data.id)
assert('今日活动含已签到人数', tc && tc.checkedInCount === 1, JSON.stringify(tc && tc.checkedInCount))

// 4. 机构名称（工作台头部）
const settings = await acall('/settings')
assert('设置含机构名', settings.code === 0 && settings.data.org_info !== undefined, JSON.stringify(settings.data && settings.data.org_info && settings.data.org_info.name))

// 清理
await acall('/schedules/' + sch.data.id, { m: 'DELETE' }).catch(() => {})
await acall('/schedules/' + sch2.data.id, { m: 'DELETE' }).catch(() => {})
const _db = await import('node:child_process')
_db.execSync(`sqlite3 ${__ROOT}/backend/db/data.db "DELETE FROM enrollments WHERE schedule_id='${sch.data.id}'; DELETE FROM attendances WHERE schedule_id='${sch.data.id}'; DELETE FROM schedules WHERE id='${sch.data.id}'; DELETE FROM enrollments WHERE schedule_id='${sch2.data.id}'; DELETE FROM attendances WHERE schedule_id='${sch2.data.id}'; DELETE FROM schedules WHERE id='${sch2.data.id}';"`)
await acall('/admin/courses/' + _course.data.id, { m: 'DELETE' }).catch(() => {})
console.log(`\n结果：${ok} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
