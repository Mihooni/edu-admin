import path from 'node:path';
const BASE = 'http://localhost:3001/api'
let r = await (await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '13900000001', role: 'parent' }) })).json()
const token = r.data.token
const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
const call = async (path, opts = {}) => (await fetch(BASE + path, { method: opts.m || 'GET', headers: h, body: opts.b ? JSON.stringify(opts.b) : undefined })).json()
let ok = 0, fail = 0
const assert = (n, c, x = '') => { if (c) { ok++; console.log('✓ ' + n) } else { fail++; console.log('✗ ' + n + ' ' + x) } }

// 0. 准备多孩绑定（演示数据，测试后移除）
import { execSync } from 'node:child_process'
const __ROOT = (() => {
  const p = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  return p;
})();
const DB = `${__ROOT}/backend/db/data.db`
execSync(`sqlite3 ${DB} "INSERT OR IGNORE INTO parent_bindings (student_id, student_name, parent_name, parent_openid, parent_phone, relation, is_main, created_at) VALUES ('stu_002','李小红','小明爸爸','phone_13900000001','13900000001','弟弟',0, strftime('%s','now')*1000);"`)

// 1. 家长绑定孩子列表（应含 2 个）
r = await call('/students/my')
assert('多孩绑定列表', (r.data || []).length >= 2, JSON.stringify((r.data || []).map(s => s.name)))

// 2. 管理员建活动
const adm = await (await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '13800000001', role: 'admin', password: '123456' }) })).json()
const ah = { 'Content-Type': 'application/json', Authorization: `Bearer ${adm.data.token}` }
const acall = async (path, opts = {}) => (await fetch(BASE + path, { method: opts.m || 'GET', headers: ah, body: opts.b ? JSON.stringify(opts.b) : undefined })).json()
const t = Date.now().toString(36)
const sid2 = await (await fetch(BASE + '/growth/leads?page=1&pageSize=5', { headers: ah })).json() // noop
// 0. 清理历史多孩测试课程 + 确保绑定
const _h = await acall('/schedules?startDate=2020-01-01&endDate=2040-12-31')
for (const _x of ((_h.data && _h.data.list) || []).filter((c) => (c.course_name || '').includes('多孩测试'))) { await acall('/schedules/' + _x.id, { m: 'DELETE' }).catch(() => {}) }
const _c = await acall('/admin/courses?includeInactive=1')
for (const _x of ((_c.data && _c.data.list) || []).filter((c) => (c.name || '').includes('多孩测试'))) { await acall('/admin/courses/' + _x.id, { m: 'DELETE' }).catch(() => {}) }

const course = await acall('/admin/courses', { m: 'POST', b: { name: '多孩测试' + t, category: '篮球', duration: 60, consume_classes: 1, max_students: 10, price_per_class: 80 } })
const sch = await acall('/schedules', { m: 'POST', b: { courseId: course.data.id, date: '2030-07-01', startTime: '10:00', endTime: '11:00', teacherId: 'teacher_001', maxStudents: 10 } })
const sid = sch.data.id

// 3. 家长为两个孩子报名
r = await call(`/schedules/${sid}/enroll`, { m: 'POST', b: { studentId: 'stu_001' } })
assert('报张小明', r.code === 0)
r = await call(`/schedules/${sid}/enroll`, { m: 'POST', b: { studentId: 'stu_002' } })
assert('报李小红', r.code === 0)

// 4. 已报名列表（应含两人）
const enrolled = await call('/schedules/my', {})
const myRows = ((enrolled.data && enrolled.data.list) || []).filter((x) => x.id === sid)
const names = myRows.map((x) => x.student_name || '')
assert('我的活动含两个孩子报名', names.includes('张小明') && names.includes('李小红'), JSON.stringify(names))

// 5. 取消一个（张小明）
r = await call(`/schedules/${sid}/enroll`, { m: 'DELETE', b: { studentId: 'stu_001' } })
assert('取消张小明', r.code === 0)
const enrolled2 = await call('/schedules/my', {})
const rows2 = ((enrolled2.data && enrolled2.data.list) || []).filter((x) => x.id === sid)
assert('仅剩李小红报名', rows2.length === 1 && (rows2[0].student_name || '').includes('李小红'), JSON.stringify(rows2.map((x) => x.student_name)))

// 清理
await acall('/admin/courses/' + course.data.id, { m: 'DELETE' })
// 移除测试绑定，保持演示数据干净
const _db = await import('node:child_process')
execSync(`sqlite3 ${DB} "DELETE FROM parent_bindings WHERE parent_openid='phone_13900000001' AND student_id='stu_002';"`)
console.log(`\n结果：${ok} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
