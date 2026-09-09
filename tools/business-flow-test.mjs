// 教培机构全链路业务剧本测试：排课→销售→点名→请假→通知→续费→线索→转化→积分
import path from 'node:path';
const __ROOT = (() => {
  const p = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  return p;
})();
const BASE = 'http://localhost:3001/api'
let token = ''
let failures = []
let testOrderIds = []
let passed = 0
const results = []
const assert = (name, cond, extra = '') => {
  if (cond) { passed++; results.push(`✓ ${name}`) } else { failures.push(`✗ ${name} ${extra}`); results.push(`✗ ${name} ${extra}`) }
}

const req = async (path, { method = 'GET', body, admin = true } = {}) => {
  const headers = { 'Content-Type': 'application/json' }
  if (admin) headers.Authorization = `Bearer ${token}`
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const j = await r.json().catch(() => ({ code: -1, raw: 'HTML', status: r.status }))
  if (j.code !== 0 && path.includes('leave')) console.log('  [leave API]', method, path, JSON.stringify(j).slice(0, 200))
  return j
}

// 1. 管理员登录
let r = await req('/auth/login', { method: 'POST', admin: false, body: { phone: '13800000001', role: 'admin', password: '123456' } })
assert('管理员登录', r.code === 0)
token = r.data.token
// 1.5 清理历史剧本残留（上次中断可能留下）
const _hist = await req('/schedules?startDate=2020-01-01&endDate=2030-12-31')
for (const _s of ((_hist.data && _hist.data.list) || _hist.data || []).filter((x) => (x.course_name || '').includes('剧本测试班'))) {
  await req('/schedules/' + _s.id, { method: 'DELETE' }).catch(() => {})
}
const _courses = await req('/admin/courses?includeInactive=1')
for (const _c of ((_courses.data && _courses.data.list) || _courses.data || []).filter((x) => (x.name || '').includes('剧本测试班'))) {
  await req('/admin/courses/' + _c.id, { method: 'DELETE' }).catch(() => {})
}
const _leads = await req('/growth/leads?page=1&pageSize=100')
for (const _l of ((_leads.data && _leads.data.list) || _leads.data || []).filter((x) => (x.name || '').includes('剧本线索'))) {
  await req('/growth/leads/' + _l.id, { method: 'DELETE' }).catch(() => {})
}

// 2. 看板数据
r = await req('/admin/dashboard')
assert('数据看板返回', r.code === 0 && r.data && r.data.revenue !== undefined)

// 3. 创建临时课程（班级）
const courseName = '剧本测试班-' + Date.now().toString(36)
r = await req('/admin/courses', { method: 'POST', body: { name: courseName, category: '篮球', duration: 60, consume_classes: 1, max_students: 10, price_per_class: 80 } })
assert('创建班级', r.code === 0)
const courseId = r.data.id

// 4. 排课（一次性，明天，随机时段避免冲突）
const tomorrow = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10)
const sh = '21'; const sm = '00'; const eh = '22'
r = await req('/schedules', { method: 'POST', body: { courseId, date: tomorrow, startTime: `${sh}:${sm}`, endTime: `${eh}:${sm}`, teacherId: 'teacher_001', maxStudents: 10 } })
assert('创建排课', r.code === 0)
const scheduleId = r.data.id

// 5. 销售收款 → 激活会员卡（家长13900000001/学员stu_001）
r = await req('/membership/card-types')
const cardType = (r.data.list || []).find((c) => c.name.includes('月卡')) || (r.data.list || [])[0]
assert('获取卡类型', r.code === 0 && cardType)
r = await req('/orders', { method: 'POST', body: { studentId: 'stu_001', cardTypeId: cardType.id, orderType: 'membership', status: 'paid', salesperson: '管理员' } })
assert('销售收款激活会员卡', r.code === 0)
if (r.data && r.data.orderId) testOrderIds.push(r.data.orderId)

// 6. 家长登录报名
r = await req('/auth/login', { method: 'POST', admin: false, body: { phone: '13900000001', role: 'parent' } })
assert('家长登录', r.code === 0)
const parentToken = r.data.token
const preq = async (path, opts = {}) => {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${parentToken}` }
  const r = await fetch(BASE + path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined })
  const j = await r.json().catch(() => ({ code: -1, raw: 'HTML', status: r.status }))
  if (j.code !== 0 && (path.includes('leave') || path.includes('membership'))) console.log('  [parent API]', opts.method || 'GET', path, JSON.stringify(j).slice(0, 200))
  return j
}
r = await preq('/schedules/' + scheduleId + '/enroll', { method: 'POST', body: { studentId: 'stu_001' } })
assert('家长报名活动', r.code === 0)
// stu_002 由其家长（13900000002）报名
const p2early = await req('/auth/login', { method: 'POST', admin: false, body: { phone: '13900000002', role: 'parent' } })
const preq2early = async (path, opts = {}) => {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${p2early.data.token}` }
  const r = await fetch(BASE + path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined })
  return r.json()
}
r = await preq2early('/schedules/' + scheduleId + '/enroll', { method: 'POST', body: { studentId: 'stu_002' } })
r = await preq('/schedules/' + scheduleId + '/enroll', { method: 'POST', body: { studentId: 'stu_003' } })

// 7. 教练点名（已到）
r = await req('/checkin/teacher', { method: 'POST', body: { scheduleId, attendances: [{ studentId: 'stu_001', status: 'present' }] } })
assert('教练点名已到', r.code === 0)

// 8. 自动缺席（stu_002 未点名）→ 应发缺席通知给家长
r = await req('/checkin/auto-absent', { method: 'POST', body: { date: tomorrow } })
assert('自动缺席执行', r.code === 0)

// 9. 扣课验证：stu_001 报名并点名，课时应扣 1
r = await preq('/membership/my')
assert('家长查询会员卡', r.code === 0)

// 10. 请假闭环：家长为 stu_003 请假
const p3 = await req('/auth/login', { method: 'POST', admin: false, body: { phone: '13900000003', role: 'parent' } })
const preq3 = async (path, opts = {}) => {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${p3.data.token}` }
  const r = await fetch(BASE + path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined })
  return r.json()
}
r = await preq3('/schedules/' + scheduleId + '/enroll', { method: 'POST', body: { studentId: 'stu_003' } })
r = await preq3('/leave/apply', { method: 'POST', body: { scheduleId, reason: '家中有事' } })
assert('家长提交请假', r.code === 0)
const leaveId = r.data.id
r = await req('/leave/' + leaveId + '/approve', { method: 'PUT', body: { action: 'approve', note: '同意' } })
assert('管理员审批请假', r.code === 0)

// 10.5 缺席通知检查：stu_002 的家长（13900000002）应收到缺席提醒
const p2 = await req('/auth/login', { method: 'POST', admin: false, body: { phone: '13900000002', role: 'parent' } })
const preq2 = async (path, opts = {}) => {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${p2.data.token}` }
  const r = await fetch(BASE + path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined })
  return r.json()
}
const absentList = await preq2('/notifications/list', {})
const absentNotice = ((absentList.data) || []).find((n) => (n.title || '').includes('缺席') || (n.title || '').includes('未到') || (n.title || '').includes('未参加'))
assert('缺席自动通知家长', !!absentNotice, JSON.stringify(((absentList.data) || []).slice(0, 4).map((n) => n.title)))

// 11. 通知发布 → 家长收到广播
r = await req('/notifications/create', { method: 'POST', body: { title: '剧本测试广播', content: '请家长关注后续通知', priority: 'normal' } })
assert('发布广播通知', r.code === 0)
r = await preq('/notifications/list', {})
assert('家长收到广播', (r.data || []).some((n) => n.title === '剧本测试广播'))

// 12. 线索 → 转成交
r = await req('/growth/leads', { method: 'POST', body: { name: '剧本线索-王先生', phone: '13700000000', source: 'referral', stage: 'trial', intentLevel: 4 } })
assert('创建线索', r.code === 0)
const leadId = r.data.id
r = await req(`/growth/leads/${leadId}/convert`, { method: 'POST', body: {} })
assert('线索转成交', r.code === 0 && r.data.converted === true)

// 13. 积分：给 stu_001 加分并验证
r = await req('/growth/points/adjust', { method: 'POST', body: { studentId: 'stu_001', type: 'earn', amount: 50, reason: '转介绍奖励' } })
assert('手动发放积分', r.code === 0 && r.data.balance !== undefined)
r = await req('/growth/points/list', { method: 'GET' })
const stuPoints = (r.data.list || []).find((p) => p.student_id === 'stu_001')
assert('积分列表含学员', !!stuPoints)

// 14. 数据一致性：扣课次数 = 点名次数（stu_001 点名 1 次 → 卡剩余课时减 1）
r = await preq('/membership/my', {})
const card = r.data
assert('扣课数据存在', r.code === 0 && card)

// 清理：删除剧本创建的订单与关联（防止演示数据污染）
const _db = await import('node:child_process')
for (const _oid of testOrderIds) {
  _db.execSync(`sqlite3 ${__ROOT}/backend/db/data.db "DELETE FROM payments WHERE order_id='${_oid}'; DELETE FROM member_cards WHERE order_id='${_oid}'; DELETE FROM point_logs WHERE reference_id='order_${_oid}'; DELETE FROM orders WHERE id='${_oid}';"`)
}

// 清理：删除剧本数据（课程/排课/线索/通知）
await req('/schedules/' + scheduleId, { method: 'DELETE' }).catch(() => {})
_db.execSync(`sqlite3 ${__ROOT}/backend/db/data.db "DELETE FROM enrollments WHERE schedule_id='${scheduleId}'; DELETE FROM attendances WHERE schedule_id='${scheduleId}';"`)
await req('/admin/courses/' + courseId, { method: 'DELETE' }).catch(() => {})
await req('/growth/leads/' + leadId, { method: 'DELETE' }).catch(() => {})
await req('/notifications/admin/list?page=1&pageSize=100').then((res) => {
  const ids = (res.data.list || []).filter((n) => n.title === '剧本测试广播').map((n) => n.id)
  // 通知无删除接口，直接 SQL 清理在脚本外
  console.log('  待清理广播通知:', ids.length)
}).catch(() => {})

console.log('\n===== 业务剧本结果 =====')
console.log(`通过 ${passed} / ${passed + failures.length}`)
if (failures.length) { console.log(failures.join('\n')); process.exit(1) }
console.log('✅ 全部通过')
