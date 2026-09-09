/**
 * 三端协同测试（Web 管理端 × 小程序家长端 × 小程序管理端）
 * 覆盖跨端数据流：通知 → 排课 → 报名/签到 → 请假审批 → 销售 → 积分 → 家长沟通
 * 所有测试数据在结束时清理，不污染种子数据。
 */
const BASE = 'http://localhost:3001/api'
let ok = 0, fail = 0
const assert = (name, cond, extra = '') => {
  if (cond) { ok++; console.log('✓ ' + name) }
  else { fail++; console.log('✗ ' + name + ' ' + extra) }
}
const login = async (phone, role, password = '') => {
  const j = await (await fetch(BASE + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, role, password }),
  })).json()
  if (j.code !== 0) throw new Error('登录失败: ' + j.message)
  return j.data
}
const call = async (path, token, opts = {}) => {
  const r = await fetch(BASE + path, {
    method: opts.m || 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: opts.b ? JSON.stringify(opts.b) : undefined,
  })
  return r.json()
}
const { createRequire } = await import('module')
const require = createRequire(import.meta.url)
const db = require(process.cwd() + '/backend/db')

const today = new Date()
const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const d0 = fmt(today)
const d1 = fmt(new Date(today.getTime() + 86400000))
const d3 = fmt(new Date(today.getTime() + 3 * 86400000))
const t = Date.now().toString(36)

const createdScheduleIds = []
const cleanup = () => {
  if (createdScheduleIds.length) {
    const ph = createdScheduleIds.map(() => '?').join(',')
    db.prepare('DELETE FROM enrollments WHERE schedule_id IN (' + ph + ')').run(...createdScheduleIds)
    db.prepare('DELETE FROM attendances WHERE schedule_id IN (' + ph + ')').run(...createdScheduleIds)
    db.prepare('DELETE FROM schedules WHERE id IN (' + ph + ')').run(...createdScheduleIds)
  }
}

try {
  // ===== 0. 三端登录 =====
  const admin = await login('13800000001', 'admin', '123456')
  const parent = await login('13900000001', 'parent')
  const coach = await login('13800000011', 'coach', '123456')
  assert('三端登录（管理员/家长/教练）', !!(admin.token && parent.token && coach.token))
  const ah = admin.token, ph = parent.token, ch = coach.token

  // ===== 1. 通知协同：管理员发布 → 家长收到未读 → 已读后未读数下降 =====
  const ntf = await call('/notifications/create', ah, { m: 'POST', b: { title: '协同测试通知-' + t, content: '三端协同测试内容' } })
  assert('发布广播通知', ntf.code === 0 && !!ntf.data.id, JSON.stringify(ntf))
  const nt = ntf.data.id

  let pl = await call('/notifications/list?limit=20', ph)
  const pNotice = (pl.data || []).find((n) => n.id === nt)
  assert('家长端可见广播通知', !!pNotice && pNotice.isRead === false, JSON.stringify(pNotice && { isRead: pNotice.isRead }))

  const unread1 = await call('/notifications/unread-count', ph)
  const c1 = (unread1.data && unread1.data.count) || 0
  const read = await call('/notifications/read', ph, { m: 'POST', b: { id: nt } })
  assert('家长标记已读', read.code === 0)
  const unread2 = await call('/notifications/unread-count', ph)
  const c2 = (unread2.data && unread2.data.count) || 0
  assert('已读后未读数下降', c2 === c1 - 1, `before=${c1} after=${c2}`)

  // ===== 2. 排课协同：Web 创建重复排期 → 管理端/家长端可见 =====
  const course = await call('/admin/courses', ah, { m: 'POST', b: { name: '协同课程-' + t, category: '篮球', duration: 60, consume_classes: 0, max_students: 10 } })
  assert('创建课程', course.code === 0 && !!course.data.id)
  const courseId = course.data.id
  const rec = await call('/schedules/recursive', ah, {
    m: 'POST',
    b: { courseId, teacherId: 'teacher_001', repeatType: 'daily', startTime: '09:00', endTime: '10:00', startDate: d0, endDate: d3, maxStudents: 10 },
  })
  assert('Web 创建每日重复排期', rec.code === 0 && rec.data.count >= 2, JSON.stringify(rec.data && { count: rec.data.count }))
  createdScheduleIds.push(...(rec.data.scheduleIds || []))
  const schedList = await call(`/schedules?startDate=${d0}&endDate=${d3}`, ah)
  const todayScheds = (schedList.data.list || []).filter((s) => s.course_name === '协同课程-' + t)
  assert('管理端可见生成的全部排期', todayScheds.length >= 2, `count=${todayScheds.length}`)

  // ===== 3. 报名 → 签到协同：家长报名 → 教练点名 → 家长看到签到状态 =====
  const sched0 = todayScheds.find((s) => s.date === d0)
  const enroll = await call(`/schedules/${sched0.id}/enroll`, ph, { m: 'POST', b: { studentId: 'stu_001' } })
  assert('家长报名今日活动', enroll.code === 0, JSON.stringify(enroll))
  const ck = await call('/checkin/teacher', ch, {
    m: 'POST',
    b: { scheduleId: sched0.id, attendances: [{ studentId: 'stu_001', status: 'present' }] },
  })
  assert('教练端点名', ck.code === 0, JSON.stringify(ck))
  const ckToday = await call('/checkin/today', ph)
  const myRec = (ckToday.data.records || []).find((r) => r.schedule_id === sched0.id)
  assert('家长端看到已签到', !!myRec && myRec.status === 'present', JSON.stringify(myRec && { status: myRec.status }))

  // ===== 4. 请假协同：家长请假 → 管理员审批 → 家长看到已通过 =====
  const sched1 = todayScheds.find((s) => s.date === d1)
  const lv = await call('/leave/apply', ph, { m: 'POST', b: { scheduleId: sched1.id, reason: '协同测试请假' } })
  assert('家长提交请假', lv.code === 0 && lv.data.status === 'pending', JSON.stringify(lv))
  const lvId = lv.data.id
  const pendList = await call('/leave?status=pending', ah)
  assert('管理端待审批列表可见', (pendList.data.list || []).some((x) => x.id === lvId))
  const apv = await call(`/leave/${lvId}/approve`, ah, { m: 'PUT', b: { action: 'approve' } })
  assert('管理员审批通过', apv.code === 0, JSON.stringify(apv))
  const myLeave = await call('/leave/my', ph)
  const lvRow = (myLeave.data.list || []).find((x) => x.id === lvId)
  assert('家长端看到已通过', lvRow && lvRow.status === 'approved', JSON.stringify(lvRow && { status: lvRow.status }))

  // ===== 5. 销售协同：Web 录入销售 → 家长会员卡同步 → 看板收入增加 =====
  const dashBefore = await call('/admin/dashboard', ah)
  const revBefore = (dashBefore.data.revenue && dashBefore.data.revenue.today) || 0
  const ord = await call('/orders', ah, {
    m: 'POST',
    b: { studentId: 'stu_001', cardTypeId: 'ct_001', orderType: 'membership', status: 'paid', payableAmount: 699, salesperson: '管理员', remark: '协同-' + t },
  })
  assert('Web 录入销售', ord.code === 0 && ord.data.payableAmount === 699, JSON.stringify(ord))
  const oid = ord.data.orderId
  const myCards = await call('/membership/my', ph)
  assert('家长端会员卡同步', (myCards.data || []).some((c) => c.order_id === oid && c.status === 'active'))
  const dashAfter = await call('/admin/dashboard', ah)
  const revAfter = (dashAfter.data.revenue && dashAfter.data.revenue.today) || 0
  assert('看板今日收入增加', revAfter >= revBefore + 699, `before=${revBefore} after=${revAfter}`)

  // ===== 6. 积分协同：管理端调整积分 → 家长余额同步 =====
  const balBefore = await call('/points/balance?studentId=stu_001', ph)
  const pt = await call('/growth/points/adjust', ah, { m: 'POST', b: { studentId: 'stu_001', type: 'earn', amount: 20, reason: '协同测试' } })
  assert('管理端发放积分', pt.code === 0, JSON.stringify(pt))
  const balAfter = await call('/points/balance?studentId=stu_001', ph)
  const b0 = (balBefore.data && balBefore.data.balance) || 0
  const b1 = (balAfter.data && balAfter.data.balance) || 0
  assert('家长端积分余额同步 +20', b1 === b0 + 20, `before=${b0} after=${b1}`)

  // ===== 7. 家长沟通协同：Web 发送消息 → 家长端收到 =====
  const msg = await call('/messages/send', ah, { m: 'POST', b: { userId: parent.openid, title: '协同消息-' + t, content: '家长沟通测试' } })
  assert('Web 发送家长消息', msg.code === 0, JSON.stringify(msg))
  const myMsg = await call('/messages/my?limit=20', ph)
  assert('家长端收到消息', (myMsg.data.list || []).some((m) => m.id === msg.data.id), JSON.stringify(myMsg.data && { list: (myMsg.data.list || []).length }))

  // ===== 清理 =====
  db.prepare('DELETE FROM notifications WHERE id = ?').run(nt)
  db.prepare('DELETE FROM notification_reads WHERE notification_id = ?').run(nt)
  db.prepare('DELETE FROM notifications WHERE id = ?').run(msg.data.id)
  db.prepare('DELETE FROM leave_requests WHERE id = ?').run(lvId)
  db.prepare('DELETE FROM member_cards WHERE order_id = ?').run(oid)
  db.prepare('DELETE FROM payments WHERE order_id = ?').run(oid)
  db.prepare('DELETE FROM point_logs WHERE reference_id = ?').run('order_' + oid)
  db.prepare('DELETE FROM orders WHERE id = ?').run(oid)
  db.prepare("DELETE FROM point_logs WHERE reason = '协同测试' AND created_at > ?").run(Date.now() - 3600000)
  db.prepare('UPDATE points SET balance = balance - 20, total_earned = total_earned - 20 WHERE student_id = ?').run('stu_001')
  cleanup()
  db.prepare('DELETE FROM courses WHERE id = ?').run(courseId)
  assert('测试数据已清理', true)
} catch (err) {
  fail++
  console.log('✗ 协同流程异常: ' + err.message)
  cleanup()
}

console.log(`\n结果：${ok} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
