// 管理端新链路：首页活动列表 / 工作台收费 / 详情签到
const BASE = 'http://localhost:3001/api'
let ok = 0, fail = 0
const assert = (n, c, x = '') => { if (c) { ok++; console.log('✓ ' + n) } else { fail++; console.log('✗ ' + n + ' ' + x) } }
const login = async (phone, role, pw) => (await (await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, role, password: pw }) })).json()).data.token
const aToken = await login('13800000001', 'admin', '123456')
const ah = { 'Content-Type': 'application/json', Authorization: `Bearer ${aToken}` }
const acall = async (path, opts = {}) => (await fetch(BASE + path, { method: opts.m || 'GET', headers: ah, body: opts.b ? JSON.stringify(opts.b) : undefined })).json()

// 1. 管理员首页活动列表（含报名人数）
const today = new Date().toISOString().slice(0, 10)
const list = await acall('/schedules?date=' + today)
const rows = (list.data && list.data.list) || []
const first = rows[0]
assert('今日活动列表返回', rows.length >= 1, JSON.stringify(rows.length))
assert('活动含报名人数字段', first && first.enrolled_count !== undefined && first.max_students !== undefined, JSON.stringify(first && { ec: first.enrolled_count, ms: first.max_students }))
assert('活动含教练字段', first && (first.teacher_name || first.teacher_id) !== undefined)

// 2. 工作台收费数据
const dash = await acall('/admin/dashboard')
assert('工作台今日/本月收费', dash.code === 0 && dash.data.revenue && (dash.data.revenue.today !== undefined) && (dash.data.revenue.month !== undefined), JSON.stringify(dash.data && dash.data.revenue))

// 3. 签到接口（管理端点名）
// 用独立创建的活动做签到（不污染种子今日活动，避免与其他测试冲突）
const _t = Date.now().toString(36)
const _created = await acall('/admin/courses', { m: 'POST', b: { name: '管理端签到测试课' + _t, category: '篮球', duration: 60, consume_classes: 1, max_students: 10, price_per_class: 80 } })
const _course = { id: _created.data.id }
// 使用唯一未来日期（2099 年按时间戳偏移），避免与历史测试残留排期冲突
const _futureDate = `2099-01-${String(1 + (Date.now() % 28)).padStart(2, '0')}`
const _sch = await acall('/schedules', { m: 'POST', b: { courseId: _course.id, date: _futureDate, startTime: '10:00', endTime: '11:00', teacherId: 'teacher_001', maxStudents: 10 } })
const schId = _sch.data.id
const checkin = await acall('/checkin/teacher', { m: 'POST', b: { scheduleId: schId, attendances: [{ studentId: 'stu_001', status: 'present' }] } })
assert('管理员签到调用成功', checkin.code === 0, JSON.stringify(checkin).slice(0, 100))

// 4. 教练权限：教练访问工作台收费（dashboard）应被拒，签到可用
const cToken = await login('13800000011', 'coach', '123456')
const ch = { 'Content-Type': 'application/json', Authorization: `Bearer ${cToken}` }
const cdash = await fetch(BASE + '/admin/dashboard', { headers: ch })
assert('教练访问收费数据被拒', cdash.status === 403, `status=${cdash.status}`)
const ccheck = await fetch(BASE + '/checkin/teacher', { method: 'POST', headers: ch, body: JSON.stringify({ scheduleId: schId, attendances: [{ studentId: 'stu_001', status: 'late' }] }) })
const ccheckBody = await ccheck.json()
assert('教练签到可用', ccheck.status === 200 && ccheckBody.code === 0, `status=${ccheck.status}`)

await acall('/schedules/' + schId, { m: 'DELETE' }).catch(() => {})
await acall('/admin/courses/' + _course.id, { m: 'DELETE' }).catch(() => {})
console.log(`\n结果：${ok} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
