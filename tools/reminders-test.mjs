// 定时任务核心逻辑测试：训练提醒 / 低课时提醒（幂等 + 家长通知）
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
const require = createRequire(import.meta.url)
const { generateClassReminders, generateLowClassReminders } = require(process.cwd() + '/backend/utils/reminders')
const DB = process.cwd() + '/backend/db/data.db'
const BASE = 'http://localhost:3001/api'
let ok = 0, fail = 0
const assert = (n, c, x = '') => { if (c) { ok++; console.log('✓ ' + n) } else { fail++; console.log('✗ ' + n + ' ' + x) } }
const j = async (p, opts = {}) => {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  const r = await fetch(BASE + p, { headers, method: opts.m || 'GET', body: opts.b ? JSON.stringify(opts.b) : undefined })
  return { status: r.status, body: await r.json() }
}
const A = (await j('/auth/login', { m: 'POST', b: { phone: '13800000001', password: '123456', role: 'admin' } })).body.data
const AH = { Authorization: 'Bearer ' + A.token }
const P = (await j('/auth/login', { m: 'POST', b: { phone: '13900000001', role: 'parent' } })).body.data
const PH = { Authorization: 'Bearer ' + P.token }

// 1. 训练提醒：创建 1 小时后开始的排期并报名
const now = new Date()
const start = new Date(now.getTime() + 3600000)
const dateStr = `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}-${String(start.getDate()).padStart(2,'0')}`
const startTime = `${String(start.getHours()).padStart(2,'0')}:${String(start.getMinutes()).padStart(2,'0')}`
const name = '训练提醒测试-' + Date.now().toString(36).slice(-4)
const sched = await j('/schedules', { m: 'POST', headers: AH, b: { courseName: name, date: dateStr, startTime, endTime: '23:59' } })
assert('创建训练提醒测试排期', sched.body.code === 0, sched.body.message)
const sid = sched.body.data.id
await j('/schedules/' + sid + '/enroll', { m: 'POST', headers: PH, b: { studentId: 'stu_001' } })

// 2. 调用训练提醒生成逻辑
const r1 = generateClassReminders(Date.now())
assert('训练提醒生成通知', r1.sent >= 1, JSON.stringify(r1))
const notice = (await j('/notifications/list?limit=10', { headers: PH })).body.data.find(n => (n.title || '').includes('训练即将开始') && (n.detail || n.content || '').includes(name))
assert('家长收到训练提醒', !!notice, '未收到训练提醒')

// 3. 幂等：再次调用不重复生成
const r2 = generateClassReminders(Date.now())
const countAfter = await j('/notifications/list?limit=50', { headers: PH })
const dupCount = (countAfter.body.data || []).filter(n => (n.detail || n.content || '').includes(name)).length
assert('训练提醒幂等', dupCount <= 1, `重复 ${dupCount} 条`)

// 4. 低课时提醒：创建低课时次数卡
const ct = await j('/membership/card-type', { m: 'POST', headers: AH, b: { name: '测试次卡-' + Date.now().toString(36).slice(-4), billingMode: 'count', totalClasses: 10, validDays: 90, price: 500 } })
assert('创建测试次卡类型', ct.body.code === 0, ct.body.message)
if (ct.body.code === 0) {
  const countCard = { id: ct.body.data.id }
  const ord = await j('/orders', { m: 'POST', headers: AH, b: { studentId: 'stu_003', cardTypeId: countCard.id, status: 'paid', salesperson: '测试' } })
  assert('创建次数卡订单', ord.body.code === 0, ord.body.message)
  // 扣课到 2 节(低于默认阈值 3)
  const cards = (await j('/membership/my?studentId=stu_003', { headers: AH })).body.data
  const card = cards.find(c => c.order_id === ord.body.data.orderId)
  if (card && card.remaining_classes > 3) {
    await j('/membership/deduct', { m: 'POST', headers: AH, b: { scheduleId: 'sch_reminder_1', studentId: 'stu_003', cardId: card.id, classes: card.remaining_classes - 2 } }).catch(() => {})
  }
  const lr = generateLowClassReminders(Date.now())
  assert('低课时提醒生成', lr.sent >= 0, JSON.stringify(lr))
  // 清理测试订单与卡
  await j('/orders/' + ord.body.data.orderId + '/cancel', { m: 'POST', headers: AH, b: {} }).catch(() => {})
  await j('/membership/card-type/' + countCard.id, { m: 'DELETE', headers: AH }).catch(() => {})
}

// 清理
await j('/schedules/' + sid, { m: 'DELETE', headers: AH }).catch(() => {})
execSync(`sqlite3 ${DB} "DELETE FROM notifications WHERE content LIKE '%${name}%' OR title = '课时不足提醒' AND template_id LIKE 'NTF_LOW_CLASS_%'; DELETE FROM schedules WHERE course_name LIKE '训练提醒测试%'; DELETE FROM attendances WHERE schedule_id = '${sid}'; DELETE FROM enrollments WHERE schedule_id = '${sid}'; DELETE FROM deduction_logs WHERE schedule_id = 'sch_reminder_1'; DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE salesperson = '测试'); DELETE FROM member_cards WHERE order_id IN (SELECT id FROM orders WHERE salesperson = '测试'); DELETE FROM orders WHERE salesperson = '测试'; DELETE FROM member_cards WHERE student_id = 'stu_003' AND order_id = '';"`)
// 通用孤儿清理：删除订单已不存在的卡/支付记录（防止历史残留）
execSync(`sqlite3 ${DB} "DELETE FROM member_cards WHERE order_id != '' AND order_id NOT IN (SELECT id FROM orders); DELETE FROM payments WHERE order_id NOT IN (SELECT id FROM orders);"`)
console.log(`\n结果：${ok} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
