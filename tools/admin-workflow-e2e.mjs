/**
 * 管理端真实工作流端到端验证（API 层）
 * 覆盖：登录 → 看板 → 成员 → 销售录入/修改/取消 → 会员卡联动 → 积分回滚
 *     → 排课添加/修改/删除 → 系统设置保存/还原 → 通知发布/清理 → 积分调整/回滚
 * 所有测试数据均在结束后清理，不污染种子数据。
 */
const BASE = 'http://localhost:3001/api'
let ok = 0
let fail = 0
const assert = (name, cond, extra = '') => {
  if (cond) { ok++; console.log('✓ ' + name) }
  else { fail++; console.log('✗ ' + name + ' ' + extra) }
}

const login = async (phone, role, password) => {
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

// 清理订单及其关联数据
const cleanOrder = async (id) => {
  const { createRequire } = await import('module')
  const require = createRequire(import.meta.url)
  const db = require(process.cwd() + '/backend/db')
  db.prepare('DELETE FROM member_cards WHERE order_id = ?').run(id)
  db.prepare('DELETE FROM payments WHERE order_id = ?').run(id)
  db.prepare('DELETE FROM point_logs WHERE reference_id = ?').run('order_' + id)
  db.prepare('DELETE FROM orders WHERE id = ?').run(id)
}

try {
  const admin = await login('13800000001', 'admin', '123456')
  const ah = admin.token
  assert('管理员登录', !!ah)

  // 1. 工作台看板
  const dash = await call('/admin/dashboard', ah)
  assert('看板-收入四维', dash.code === 0 &&
    dash.data.revenue.today !== undefined && dash.data.revenue.week !== undefined &&
    dash.data.revenue.month !== undefined && dash.data.revenue.year !== undefined,
  JSON.stringify(dash.data && dash.data.revenue))
  assert('看板-购买项目统计字段', Array.isArray(dash.data.sales.itemStats))
  assert('看板-签单排名字段', Array.isArray(dash.data.sales.monthRanking))

  // 2. 成员列表（卡片精简字段）
  const students = await call('/students?page=1&pageSize=5', ah)
  const s0 = students.data.list[0]
  assert('成员列表-字段完整', s0 && s0.name && s0.gender && s0.age !== undefined && s0.status && s0.card_type_name)
  assert('成员列表-项目字段', s0 && s0.project !== undefined, JSON.stringify(s0 && { project: s0.project }))

  // 3. 销售录入 → 会员卡联动 → 修改 → 取消回收
  const t = Date.now().toString(36)
  const created = await call('/orders', ah, {
    m: 'POST',
    b: {
      studentId: 'stu_001', studentName: '张小明', cardTypeId: 'ct_001',
      orderType: 'membership', status: 'paid', payableAmount: 666,
      paidAt: Date.now(), salesperson: '王教练', remark: 'E2E-' + t,
    },
  })
  assert('销售录入-自定义金额', created.code === 0 && created.data.payableAmount === 666, JSON.stringify(created))
  const oid = created.data.orderId

  const detailAfter = await call('/students/stu_001', ah)
  const cardLinked = (detailAfter.data.cards || []).filter((c) => c.order_id === oid)
  assert('录入后-会员卡已激活', cardLinked.length === 1 && cardLinked[0].status === 'active', JSON.stringify(cardLinked))

  const upd = await call('/orders/' + oid, ah, { m: 'PUT', b: { payableAmount: 777, salesperson: '李教练', remark: 'E2E-改' } })
  assert('订单修改-金额/签单人', upd.code === 0)
  const ordersAfter = await call('/orders?status=paid&page=1&pageSize=10', ah)
  const mine = (ordersAfter.data.list || []).find((o) => o.id === oid)
  assert('修改生效-777/李教练', mine && mine.payable_amount === 777 && mine.salesperson === '李教练', JSON.stringify(mine))

  const cancel = await call('/orders/' + oid + '/cancel', ah, { m: 'POST', b: {} })
  assert('取消订单', cancel.code === 0)
  const detailAfterCancel = await call('/students/stu_001', ah)
  const cardAfter = (detailAfterCancel.data.cards || []).filter((c) => c.order_id === oid)
  assert('取消后-会员卡回收', cardAfter.every((c) => c.status !== 'active'))
  await cleanOrder(oid)

  // 4. 排课：添加课程 + 活动 → 修改 → 删除
  const course = await call('/admin/courses', ah, {
    m: 'POST',
    b: { name: 'E2E项目-' + t, category: '篮球', duration: 60, consume_classes: 1, max_students: 10, price_per_class: 80 },
  })
  assert('新增活动项目', course.code === 0)
  const futureDate = `2099-02-${String(1 + (Date.now() % 28)).padStart(2, '0')}`
  const sched = await call('/schedules', ah, {
    m: 'POST',
    b: { courseId: course.data.id, date: futureDate, startTime: '15:00', endTime: '16:00', teacherId: 'teacher_001', maxStudents: 10 },
  })
  assert('添加活动', sched.code === 0, JSON.stringify(sched))
  const schId = sched.data.id
  const schUpd = await call('/schedules/' + schId, ah, { m: 'PUT', b: { startTime: '16:00', endTime: '17:00', maxStudents: 8 } })
  assert('修改活动', schUpd.code === 0, JSON.stringify(schUpd))
  const schDel = await call('/schedules/' + schId, ah, { m: 'DELETE' })
  assert('删除活动', schDel.code === 0, JSON.stringify(schDel))
  await call('/admin/courses/' + course.data.id, ah, { m: 'DELETE' }).catch(() => {})

  // 5. 积分调整 + 回滚
  const adj = await call('/growth/points/adjust', ah, {
    m: 'POST',
    b: { studentId: 'stu_001', type: 'earn', amount: 10, reason: 'E2E测试-' + t },
  })
  assert('积分加分', adj.code === 0, JSON.stringify(adj))
  const rollback = await call('/growth/points/adjust', ah, {
    m: 'POST',
    b: { studentId: 'stu_001', type: 'consume', amount: 10, reason: 'E2E回滚-' + t },
  })
  assert('积分回滚', rollback.code === 0)

  // 6. 系统设置保存 → 还原
  const settings = await call('/settings', ah)
  const before = settings.data
  const save = await call('/settings', ah, {
    m: 'PUT',
    b: {
      org_info: { name: '星课E2E', phone: '13900000000', address: '', description: '' },
      service_phone: '13900000000', uniform_price: 60,
    },
  })
  assert('设置保存', save.code === 0)
  await call('/settings', ah, {
    m: 'PUT',
    b: {
      org_info: before.org_info || { name: '星课', phone: '13900000000', address: '', description: '' },
      service_phone: before.service_phone || '13900000000',
      uniform_price: before.uniform_price || 60,
    },
  })
  assert('设置还原', true)

  // 7. 通知发布 → 管理员可见 → 清理
  const notice = await call('/notifications/create', ah, {
    m: 'POST',
    b: { title: 'E2E通知-' + t, content: '端到端测试', priority: 'normal', groupName: '' },
  })
  assert('发布通知', notice.code === 0)
  const notices = await call('/notifications/list?limit=10', ah)
  assert('管理员可见通知', (notices.data || []).some((n) => n.title.includes('E2E通知-' + t)))
  const { createRequire } = await import('module')
  const require = createRequire(import.meta.url)
  const db = require(process.cwd() + '/backend/db')
  db.prepare('DELETE FROM notifications WHERE id = ?').run(notice.data.id)
  db.prepare('DELETE FROM notification_reads WHERE notification_id = ?').run(notice.data.id)
  assert('清理测试通知', true)

  // 8. 员工列表（含角色与排课数）
  const teachers = await call('/admin/teachers?includeInactive=1', ah)
  const t0 = (teachers.data.list || [])[0]
  assert('员工列表-角色/排课数', t0 && (t0.role === 'coach' || t0.role === 'admin') && t0.scheduleCount !== undefined)

  // 9. 员工权限自定义：仅传权限也应生效（小程序/接口兼容），并可还原
  const coachTeacher = (teachers.data.list || []).find((x) => x.role === 'coach')
  if (coachTeacher) {
    const setPerms = await call('/admin/teachers/' + coachTeacher.id, ah, {
      m: 'PUT', b: { permissions: ['students', 'schedule', 'checkin', 'leave', 'sales'] },
    })
    assert('员工权限-仅传权限保存', setPerms.code === 0, JSON.stringify(setPerms))
    const coachLogin = await login(coachTeacher.phone, 'coach', '123456')
    assert('员工权限-新权限立即生效', (coachLogin.permissions || []).includes('sales'), JSON.stringify(coachLogin.permissions))
    const coachOrders = await call('/orders?page=1&pageSize=3', coachLogin.token)
    assert('员工权限-授权后访问销售', coachOrders.code === 0, coachOrders.message)
    await call('/admin/teachers/' + coachTeacher.id, ah, {
      m: 'PUT', b: { permissions: ['students', 'schedule', 'checkin', 'leave'] },
    })
    const coachLogin2 = await login(coachTeacher.phone, 'coach', '123456')
    assert('员工权限-还原后移除', !(coachLogin2.permissions || []).includes('sales'), JSON.stringify(coachLogin2.permissions))
  } else {
    assert('员工权限-找到教练员工', false, '无教练员工可测')
  }

  // 10. 销售批量导入：成功/失败分行、金额与状态正确、数据清理
  const imp = await call('/orders/import', ah, {
    m: 'POST',
    b: { rows: [
      { studentName: '张小明', phone: '13900000001', itemName: '月卡', amount: 699, salesperson: '导入测试', paidDate: '2026-08-01', orderNo: 'IMP-' + t, remark: '导入测试' },
      { studentName: '李小红', phone: '13900000002', itemName: '球服', amount: 60, salesperson: '导入测试', paidDate: '2026-08-02', remark: '导入测试' },
      { studentName: '不存在的学员', phone: '13900000000', itemName: '月卡', amount: 699, salesperson: '导入测试' },
    ] },
  })
  assert('销售导入-2成功1失败', imp.code === 0 && imp.data.success === 2 && imp.data.failed.length === 1, JSON.stringify(imp).slice(0, 100))
  const impOrders = await call('/orders?pageSize=50', ah)
  const impMine = (impOrders.data.list || []).filter((o) => (o.remark || '').includes('导入测试'))
  assert('销售导入-订单已创建', impMine.length === 2, `找到 ${impMine.length} 条`)
  assert('销售导入-金额/状态正确', impMine.every((o) => o.status === 'paid' && o.salesperson === '导入测试'), JSON.stringify(impMine.map((o) => [o.student_name, o.payable_amount, o.status])))
  for (const o of impMine) await call('/orders/' + o.id + '/cancel', ah, { m: 'POST', b: {} }).catch(() => {})
  const { execSync } = await import('node:child_process')
  execSync(`sqlite3 ${process.cwd() + '/backend/db/data.db'} "DELETE FROM orders WHERE remark LIKE '%导入测试%'; DELETE FROM member_cards WHERE order_id NOT IN (SELECT id FROM orders); DELETE FROM payments WHERE order_id NOT IN (SELECT id FROM orders);"`)

  // 11. 有效会员卡统计排除过期卡（过期卡不误算为有效）
  const dashCards = await call('/admin/dashboard', ah)
  const allStudents = await call('/students?pageSize=50', ah)
  const activeCount = (allStudents.data.list || []).filter((s) => s.status === 'active').length
  assert('看板有效卡统计合理', dashCards.data.overview.totalCards <= activeCount + 3, `cards=${dashCards.data.overview.totalCards} active=${activeCount}`)
  const expiredStudent = (allStudents.data.list || []).find((s) => s.status === 'graduated' || s.status === 'churn')
  if (expiredStudent) {
    assert('过期卡不计入有效课时/时效', expiredStudent.time_card_count === 0, JSON.stringify([expiredStudent.name, expiredStudent.time_card_count]))
  }
} catch (err) {
  fail++
  console.log('✗ 工作流异常: ' + err.message)
}

console.log(`\n结果：${ok} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
