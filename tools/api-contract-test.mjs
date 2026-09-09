// 小程序前端依赖的接口字段契约校验（真实后端响应 vs 前端读取字段）
// 防止前后端字段不匹配导致运行时崩溃（如首页 _mapClassCardStatus 缺失）
const BASE = 'http://localhost:3001/api'
let ok = 0, fail = 0
const assert = (n, c, x = '') => { if (c) { ok++; console.log('✓ ' + n) } else { fail++; console.log('✗ ' + n + ' ' + x) } }
const login = async (phone, role, pw) => (await (await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, role, password: pw }) })).json()).data
const admin = await login('13800000001', 'admin', '123456')
const parent = await login('13900000001', 'parent')
const H = { Authorization: `Bearer ${admin.token}` }
const PH = { Authorization: `Bearer ${parent.token}` }
const get = async (path, h) => (await (await fetch(BASE + path, { headers: h })).json())

// 1. home/data（首页）
const home = await get('/students/home/data?studentId=stu_001', PH)
assert('home/data 返回 student', home.code === 0 && home.data && typeof home.data.student === 'object', JSON.stringify(home).slice(0, 80))
if (home.data && home.data.todayClasses) {
  const c = home.data.todayClasses[0]
  if (c) {
    for (const f of ['id', 'title', 'date', 'startTime', 'endTime', 'status', 'isEnrolled', 'enrolledNames', 'enrolledCount', 'checkedInCount', 'maxStudents', 'group_name', 'group_course_id']) {
      assert(`home/data 活动含 ${f}`, f in c, `缺 ${f}`)
    }
  }
}
// 2. 课表列表（活动页）
const sched = await get('/schedules?startDate=2026-08-01&endDate=2026-09-01', PH)
assert('schedules 返回 list', sched.code === 0 && Array.isArray(sched.data.list), JSON.stringify(sched).slice(0, 60))
if (sched.data.list[0]) {
  for (const f of ['id', 'course_name', 'date', 'start_time', 'end_time', 'teacher_name', 'classroom_name', 'status', 'max_students', 'enrolled_count']) {
    assert(`schedules 条目含 ${f}`, f in sched.data.list[0], `缺 ${f}`)
  }
}
// 3. 活动详情
const sid = sched.data.list[0].id
const det = await get('/schedules/' + sid, PH)
assert('详情含 is_registered/my_enrollments/students', det.code === 0 && ('is_registered' in det.data) && Array.isArray(det.data.my_enrollments) && Array.isArray(det.data.students), JSON.stringify(det).slice(0, 80))
// 4. 我的课表（请假选择器）
const my = await get('/schedules/my', PH)
assert('schedules/my 返回 {list}', my.code === 0 && Array.isArray(my.data.list), JSON.stringify(my).slice(0, 60))
// 5. 积分
const pts = await get('/points/balance?studentId=stu_001', PH)
assert('积分含 balance/total_earned/total_consumed', pts.code === 0 && 'balance' in pts.data && 'total_earned' in pts.data && 'total_consumed' in pts.data, JSON.stringify(pts).slice(0, 80))
// 6. 会员卡
const cards = await get('/membership/my?studentId=stu_001', PH)
assert('会员卡为数组', Array.isArray(cards.data), JSON.stringify(cards).slice(0, 60))
if (cards.data[0]) {
  for (const f of ['card_type_name', 'billing_mode', 'total_classes', 'remaining_classes', 'expires_at', 'status']) {
    assert(`会员卡含 ${f}`, f in cards.data[0], `缺 ${f}`)
  }
}
// 7. 通知列表
const nt = await get('/notifications/list?limit=10', PH)
assert('通知列表为数组且含 isRead', Array.isArray(nt.data) && ('isRead' in (nt.data[0] || {})), JSON.stringify(nt).slice(0, 60))
// 8. 家长端管理端看板
const dash = await get('/admin/dashboard', H)
assert('看板含 revenue/overview/sales', dash.code === 0 && dash.data.revenue && dash.data.overview && dash.data.sales, JSON.stringify(dash).slice(0, 60))
console.log(`\n结果：${ok} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
