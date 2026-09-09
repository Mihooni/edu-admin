// 双计费模式测试：时效制/次数制 卡类型、销售激活、扣课行为
import path from 'node:path';
const __ROOT = (() => {
  const p = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  return p;
})();
const BASE = 'http://localhost:3001/api'
let token = ''
let passed = 0, failed = 0
const billingOrderIds = []
const assert = (name, cond, extra = '') => {
  if (cond) { passed++; console.log(`✓ ${name}`) } else { failed++; console.log(`✗ ${name} ${extra}`) }
}
const req = async (path, { method = 'GET', body } = {}) => {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined })
  return r.json()
}

// 管理员登录
let r = await req('/auth/login', { method: 'POST', body: { phone: '13800000001', role: 'admin', password: '123456' } })
assert('管理员登录', r.code === 0)
token = r.data.token
// 清理历史测试卡（幂等）
const _types = await req('/membership/card-types')
for (const _t of (_types.data.list || []).filter((c) => (c.name || '').startsWith('测试时效卡') || (c.name || '').startsWith('测试次卡'))) {
  await req('/membership/card-type/' + _t.id, { method: 'DELETE' }).catch(() => {})
}

// 1. 创建时效制卡
const t = Date.now().toString(36)
r = await req('/membership/card-type', { method: 'POST', body: { name: '测试时效卡' + t, billingMode: 'time', validDays: 60, totalClasses: 0, price: 888 } })
assert('创建时效制卡', r.code === 0 && r.data.billingMode === 'time', JSON.stringify(r))
const timeCardId = r.data.id

// 2. 创建次数制卡
r = await req('/membership/card-type', { method: 'POST', body: { name: '测试次卡' + t, billingMode: 'count', validDays: 90, totalClasses: 10, price: 1500 } })
assert('创建次数制卡', r.code === 0 && r.data.billingMode === 'count', JSON.stringify(r))
const countCardId = r.data.id

// 3. 校验：count 卡不带次数应拒绝
r = await req('/membership/card-type', { method: 'POST', body: { name: '坏卡', billingMode: 'count', totalClasses: 0, validDays: 30 } })
assert('次数制卡必须设置总次数', r.code !== 0)

// 4. 列表返回 billing_mode
r = await req('/membership/card-types')
const found = (r.data.list || []).filter((c) => c.id === timeCardId || c.id === countCardId)
assert('卡类型返回计费模式', found.length === 2 && found.every((c) => ['time', 'count'].includes(c.billing_mode)))

// 5. 销售激活时效卡（stu_001）
r = await req('/orders', { method: 'POST', body: { studentId: 'stu_001', cardTypeId: timeCardId, orderType: 'membership', status: 'paid', salesperson: '管理员' } })
assert('销售激活时效卡', r.code === 0, JSON.stringify(r))
if (r.data && r.data.orderId) billingOrderIds.push(r.data.orderId)

// 6. 销售激活次数卡（stu_002）
r = await req('/orders', { method: 'POST', body: { studentId: 'stu_002', cardTypeId: countCardId, orderType: 'membership', status: 'paid', salesperson: '管理员' } })
assert('销售激活次数卡', r.code === 0, JSON.stringify(r))
if (r.data && r.data.orderId) billingOrderIds.push(r.data.orderId)

// 7. 家长1查卡：应看到两张卡（time + count），含模式
const p1 = await req('/auth/login', { method: 'POST', body: { phone: '13900000001', role: 'parent' } })
const my = await (await fetch(BASE + '/membership/my', { headers: { Authorization: `Bearer ${p1.data.token}` } })).json()
const timeCards = (my.data || []).filter((c) => c.card_type_id === timeCardId)
assert('激活的时效卡生效', timeCards.length === 1 && timeCards[0].billing_mode === 'time', JSON.stringify(my.data && my.data.map((c) => [c.card_type_name, c.billing_mode])))

// 8. 扣课：时效卡 → 不扣
const sch = await req('/schedules?startDate=2030-01-01&endDate=2030-12-31')
assert('排课查询', sch.code === 0)
// 建一个排课用于扣课测试
const course = await req('/admin/courses', { method: 'POST', body: { name: '扣课测试' + t, category: '篮球', duration: 60, consume_classes: 1, max_students: 10, price_per_class: 80 } })
const courseId = course.data.id
const sch2 = await req('/schedules', { method: 'POST', body: { courseId, date: '2030-06-01', startTime: '10:00', endTime: '11:00', teacherId: 'teacher_001', maxStudents: 10 } })
const scheduleId = sch2.data.id
r = await req('/membership/deduct', { method: 'POST', body: { scheduleId, studentId: 'stu_001', cardId: timeCards[0].id, classes: 1 } })
assert('时效卡扣课自动跳过', r.code === 0 && r.data.mode === 'time' && r.data.deducted === 0, JSON.stringify(r))

// 9. 扣课：次数卡 → 扣 1 次
const p2 = await req('/auth/login', { method: 'POST', body: { phone: '13900000002', role: 'parent' } })
const my2 = await (await fetch(BASE + '/membership/my', { headers: { Authorization: `Bearer ${p2.data.token}` } })).json()
const countCards = (my2.data || []).filter((c) => c.card_type_id === countCardId)
assert('激活的次数卡生效', countCards.length === 1 && countCards[0].billing_mode === 'count' && countCards[0].remaining_classes === 10, JSON.stringify(my2.data && my2.data.map((c) => [c.card_type_name, c.billing_mode, c.remaining_classes])))
r = await req('/membership/deduct', { method: 'POST', body: { scheduleId, studentId: 'stu_002', cardId: countCards[0].id, classes: 1 } })
assert('次数卡扣课扣 1 次', r.code === 0 && r.data.mode === 'count' && r.data.remainingClasses === 9, JSON.stringify(r))

// 10. 低课时预警只含次数卡（stu_002 剩余 9 > 5 不含；再扣 5 次到 4）
for (let i = 0; i < 5; i++) {
  const s2 = await req('/schedules', { method: 'POST', body: { courseId, date: `2030-06-0${i + 2}`, startTime: '10:00', endTime: '11:00', teacherId: 'teacher_001', maxStudents: 10 } })
  await req('/membership/deduct', { method: 'POST', body: { scheduleId: s2.data.id, studentId: 'stu_002', cardId: countCards[0].id, classes: 1 } })
}
r = await req('/growth/low-classes', { method: 'GET', })
const low = (r.data.list || []).filter((c) => c.student_id === 'stu_002' || c.student_id === 'stu_001')
assert('低课时预警仅含次数卡（不含时效卡 stu_001）', low.length >= 1 && !low.some((c) => c.student_id === 'stu_001') && low.some((c) => c.student_id === 'stu_002' && c.remaining_classes === 4), JSON.stringify(low.map((c) => [c.student_name, c.billing_mode, c.remaining_classes])))

// 11. 产品列表 desc 按模式
r = await req('/membership/products')
const prod = (r.data.list || []).find((p) => p.id === countCardId)
assert('次数卡产品描述含次数', prod && prod.desc.includes('10次'), JSON.stringify(prod))

// 12. 次数卡“有效天数=0（不限）”不应立即过期（防止次数卡永远扣不了课）
const noExpiryCardId = (await req('/membership/card-type', { method: 'POST', body: { name: '测试次卡不限' + t, billingMode: 'count', validDays: 0, totalClasses: 5, price: 800 } })).data.id
const orderNoExpiry = await req('/orders', { method: 'POST', body: { studentId: 'stu_003', cardTypeId: noExpiryCardId, orderType: 'membership', status: 'paid', salesperson: '管理员' } })
assert('不限次数卡销售激活', orderNoExpiry.code === 0, JSON.stringify(orderNoExpiry))
if (orderNoExpiry.data && orderNoExpiry.data.orderId) billingOrderIds.push(orderNoExpiry.data.orderId)
const { execSync: sqliteExec } = await import('node:child_process')
const noExpiryRows = sqliteExec(`sqlite3 ${__ROOT}/backend/db/data.db "SELECT expires_at FROM member_cards WHERE card_type_id='${noExpiryCardId}'"`).toString().trim().split('\n').filter(Boolean)
assert('不限次数卡到期时间为远期哨兵', noExpiryRows.length === 1 && Number(noExpiryRows[0]) >= 4102444800000, `expires_at=${noExpiryRows[0]}`)
// 扣课应可命中该卡（不因时间过期）
const sNoExpiry = await req('/schedules', { method: 'POST', body: { courseId, date: '2030-07-01', startTime: '10:00', endTime: '11:00', teacherId: 'teacher_001', maxStudents: 10 } })
const noExpiryCardRow = sqliteExec(`sqlite3 ${__ROOT}/backend/db/data.db "SELECT id FROM member_cards WHERE card_type_id='${noExpiryCardId}' LIMIT 1"`).toString().trim()
const dNoExpiry = await req('/membership/deduct', { method: 'POST', body: { scheduleId: sNoExpiry.data.id, studentId: 'stu_003', cardId: noExpiryCardRow, classes: 1 } })
assert('不限次数卡可正常扣课', dNoExpiry.code === 0 && dNoExpiry.data.mode === 'count' && dNoExpiry.data.remainingClasses === 4, JSON.stringify(dNoExpiry))
await req('/schedules/' + sNoExpiry.data.id, { method: 'DELETE' }).catch(() => {})
await req('/membership/card-type/' + noExpiryCardId, { method: 'DELETE' })

// 清理测试数据（含订单）
const _db = await import('node:child_process')
for (const _oid of billingOrderIds) {
  _db.execSync(`sqlite3 ${__ROOT}/backend/db/data.db "DELETE FROM payments WHERE order_id='${_oid}'; DELETE FROM deduction_logs WHERE card_id IN (SELECT id FROM member_cards WHERE order_id='${_oid}'); DELETE FROM member_cards WHERE order_id='${_oid}'; DELETE FROM point_logs WHERE reference_id='order_${_oid}'; DELETE FROM orders WHERE id='${_oid}';"`)
}
await req('/schedules/' + scheduleId, { method: 'DELETE' }).catch(() => {})
await req('/admin/courses/' + courseId, { method: 'DELETE' })
await req('/membership/card-type/' + timeCardId, { method: 'DELETE' })
await req('/membership/card-type/' + countCardId, { method: 'DELETE' })
console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
process.exit(failed ? 1 : 0)
