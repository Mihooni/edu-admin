// 管理端深化：添加活动 / 首页字段 / 取消训练级联
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

// 1-2. 创建当天活动（管理员）→ 首页字段验证
const _d = new Date(); const today = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, '0')}-${String(_d.getDate()).padStart(2, '0')}`
const _t = Date.now().toString(36)
const _created = await acall('/admin/courses', { m: 'POST', b: { name: '管理端深化测试课' + _t, category: '篮球', duration: 60, consume_classes: 1, max_students: 10, price_per_class: 80 } })
const course = { id: _created.data.id }
const date = today
const created = await acall('/schedules', { m: 'POST', b: { courseId: course.id, date, startTime: '10:00', endTime: '11:00', teacherId: 'teacher_001', maxStudents: 10 } })
assert('添加活动成功', created.code === 0, JSON.stringify(created))
const home = await fetch(BASE + '/students/home/data', { headers: { 'x-openid': 'phone_13900000001' } }).then((r) => r.json())
const tc = (home.data.todayClasses || []).find((c) => c.id === created.data.id)
assert('首页活动含 maxStudents/教练/报名人数', tc && tc.maxStudents !== undefined && tc.coach !== undefined && tc.enrolledCount !== undefined, JSON.stringify(tc && { ms: tc.maxStudents, coach: tc.coach, ec: tc.enrolledCount }))
assert('添加活动成功', created.code === 0, JSON.stringify(created))
const schId = created.data.id

// 3. 详情页数据字段（紧凑卡所需）
const detail = await acall('/schedules/' + schId)
assert('详情含完整字段', detail.code === 0 && detail.data.course_name && detail.data.teacher_name && detail.data.date && detail.data.start_time, JSON.stringify(detail.data && Object.keys(detail.data).length))

// 4. 取消训练 → 级联报名取消 + 名额归零
const before = await acall('/schedules/my')
// 先给该活动报名一个学生
await fetch(BASE + `/schedules/${schId}/enroll`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-openid': 'phone_13900000001' }, body: JSON.stringify({ studentId: 'stu_001' }) })
const cancel = await acall('/schedules/' + schId, { m: 'DELETE' })
assert('取消训练成功', cancel.code === 0, JSON.stringify(cancel))
const after = await acall('/schedules/' + schId)
assert('取消后状态 cancelled', after.code === 0 && after.data.status === 'cancelled', JSON.stringify(after.data && after.data.status))
const afterHome = await fetch(BASE + '/students/home/data', { headers: { 'x-openid': 'phone_13900000001' } }).then((r) => r.json())
assert('取消的活动不再出现在首页', !(afterHome.data.todayClasses || []).some((c) => c.id === schId))

// 4.1 PUT 取消活动同样级联取消报名并清零人数(与 DELETE 行为一致)
const sch2 = await acall('/schedules', { m: 'POST', b: { courseId: course.id, date: '2026-08-20', startTime: '10:00', endTime: '11:00', teacherId: 'teacher_001', maxStudents: 10 } })
const sch2Id = sch2.data.id
await fetch(BASE + `/schedules/${sch2Id}/enroll`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-openid': 'phone_13900000001' }, body: JSON.stringify({ studentId: 'stu_001' }) })
const putCancel = await acall('/schedules/' + sch2Id, { m: 'PUT', b: { status: 'cancelled' } })
assert('PUT 取消活动成功', putCancel.code === 0, JSON.stringify(putCancel))
const _db2 = await import('node:child_process')
const _enr = _db2.execSync(`sqlite3 ${__ROOT}/backend/db/data.db "SELECT status FROM enrollments WHERE schedule_id='${sch2Id}' AND student_id='stu_001';"`).toString().trim()
assert('PUT 取消级联报名取消', _enr === 'cancelled', `status=${_enr}`)
const _cnt = _db2.execSync(`sqlite3 ${__ROOT}/backend/db/data.db "SELECT enrolled_count FROM schedules WHERE id='${sch2Id}';"`).toString().trim()
assert('PUT 取消人数清零', _cnt === '0', `count=${_cnt}`)
_db2.execSync(`sqlite3 ${__ROOT}/backend/db/data.db "DELETE FROM enrollments WHERE schedule_id='${sch2Id}'; DELETE FROM schedules WHERE id='${sch2Id}';"`)

// 5. 教练权限：教练不能添加活动
const cToken = await login('13800000011', 'coach', '123456')
const cadd = await fetch(BASE + '/schedules', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cToken}` }, body: JSON.stringify({ courseId: course.id, date: '2032-05-11', startTime: '10:00', endTime: '11:00' }) })
assert('教练添加活动被拒', cadd.status === 403, `status=${cadd.status}`)

// 清理
const _db = await import('node:child_process')
_db.execSync(`sqlite3 ${__ROOT}/backend/db/data.db "DELETE FROM enrollments WHERE schedule_id='${schId}'; DELETE FROM attendances WHERE schedule_id='${schId}'; DELETE FROM schedules WHERE id='${schId}';"`)
await acall('/admin/courses/' + course.id, { m: 'DELETE' }).catch(() => {})
console.log(`\n结果：${ok} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
