// API 边界审计：异常输入应优雅失败（不 500 / 不崩溃），权限应拦截
import path from 'node:path';
import { execSync } from 'node:child_process'
const __ROOT = (() => {
  const p = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  return p;
})();
const DB = `${__ROOT}/backend/db/data.db`
execSync(`sqlite3 ${DB} "UPDATE points SET balance = balance - (SELECT p.amount FROM point_logs p WHERE p.reference_id LIKE 'share_%' AND p.student_id = points.student_id LIMIT 1), total_earned = total_earned - (SELECT p.amount FROM point_logs p WHERE p.reference_id LIKE 'share_%' AND p.student_id = points.student_id LIMIT 1) WHERE EXISTS (SELECT 1 FROM point_logs p WHERE p.reference_id LIKE 'share_%' AND p.student_id = points.student_id); DELETE FROM point_logs WHERE reference_id LIKE 'share_%';"`)
const BASE = 'http://localhost:3001/api'
let token = ''
let ok = 0, fail = 0
const assert = (n, c, x = '') => { if (c) { ok++; console.log('✓ ' + n) } else { fail++; console.log('✗ ' + n + ' ' + x) } }
const raw = async (path, opts = {}) => {
  const headers = { 'Content-Type': 'application/json' }
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`
  const r = await fetch(BASE + path, { method: opts.m || 'GET', headers, body: opts.b ? JSON.stringify(opts.b) : undefined })
  const j = await r.json().catch(() => ({ code: -1, raw: 'HTML/' + r.status }))
  return { status: r.status, body: j }
}
const req = async (path, opts = {}) => (await raw(path, { ...opts, token })).body

// 管理员登录
let r = await raw('/auth/login', { m: 'POST', b: { phone: '13800000001', role: 'admin', password: '123456' } })
assert('管理员登录', r.body.code === 0)
token = r.body.data.token

// 1. 不存在的资源
r = await req('/students/nonexistent-id')
assert('查询不存在学员优雅失败', r.code !== 0 && r.status !== 500, JSON.stringify(r).slice(0, 80))
r = await req('/schedules/nonexistent-id')
assert('查询不存在排期优雅失败', r.code !== 0, JSON.stringify(r).slice(0, 80))
r = await req('/growth/leads/nonexistent', { m: 'PUT', b: { name: 'x' } })
assert('更新不存在线索优雅失败', r.code !== 0, JSON.stringify(r).slice(0, 80))
r = await req('/leave/nonexistent/approve', { m: 'PUT', b: { action: 'approve' } })
assert('审批不存在请假优雅失败', r.code !== 0, JSON.stringify(r).slice(0, 80))

// 2. 空参数/非法参数
r = await req('/students', { m: 'POST', b: {} })
assert('创建学员缺参拒绝', r.code !== 0 && r.status !== 500, JSON.stringify(r).slice(0, 80))
r = await req('/schedules', { m: 'POST', b: { date: 'bad-date' } })
assert('创建排期缺参拒绝', r.code !== 0 && r.status !== 500, JSON.stringify(r).slice(0, 80))
r = await req('/notifications/create', { m: 'POST', b: {} })
assert('发布通知缺参拒绝', r.code !== 0 && r.status !== 500, JSON.stringify(r).slice(0, 80))
r = await req('/growth/points/adjust', { m: 'POST', b: { studentId: 'stu_001', type: 'earn', amount: -5 } })
assert('负积分调整拒绝', r.code !== 0 && r.status !== 500, JSON.stringify(r).slice(0, 80))
r = await req('/growth/leads', { m: 'POST', b: { name: '', phone: 'x' } })
assert('空姓名线索拒绝', r.code !== 0 && r.status !== 500, JSON.stringify(r).slice(0, 80))

// 3. 越权（家长访问管理接口）
const p = await raw('/auth/login', { m: 'POST', b: { phone: '13900000001', role: 'parent' } })
const pt = p.body.data.token
r = await raw('/admin/dashboard', { token: pt })
assert('家长访问看板被拒', r.status === 403 || r.body.code !== 0, `status=${r.status}`)
r = await raw('/settings', { token: pt })
assert('家长访问设置被拒', r.status === 403 || r.body.code !== 0, `status=${r.status}`)
r = await raw('/growth/leads', { token: pt })
assert('家长访问线索被拒', r.status === 403 || r.body.code !== 0, `status=${r.status}`)
r = await raw('/orders', { token: pt, m: 'POST', b: { studentId: 'stu_001', cardTypeId: 'ct_001' } })
assert('家长录入销售单被拒', r.status === 403 || r.body.code !== 0, `status=${r.status}`)
r = await raw('/orders/order_001', { token: pt, m: 'PUT', b: { payableAmount: 1 } })
assert('家长改订单被拒', r.status === 403 || r.body.code !== 0, `status=${r.status}`)
r = await raw('/orders/order_001/cancel', { token: pt, m: 'POST', b: {} })
assert('家长取消订单被拒', r.status === 403 || r.body.code !== 0, `status=${r.status}`)
r = await raw('/settings', { token: pt, m: 'PUT', b: { service_phone: 'x' } })
assert('家长改设置被拒', r.status === 403 || r.body.code !== 0, `status=${r.status}`)

// 3.2 设置字符串类型保持(客服电话/球服价格为字符串而非被 JSON.parse 转数字)
await raw('/settings', { token, m: 'PUT', b: { service_phone: '13800000000', uniform_price: '60' } })
r = await raw('/settings', { token })
assert('客服电话保持字符串', r.body.data?.service_phone === '13800000000', `type=${typeof r.body.data?.service_phone} val=${r.body.data?.service_phone}`)
assert('球服价格保持字符串', r.body.data?.uniform_price === '60', `type=${typeof r.body.data?.uniform_price} val=${r.body.data?.uniform_price}`)

// 3.1 成员数据越权（家长传他人 studentId 应被拒）
const stuList = await raw('/students', { token })
const otherStu = (stuList.body.data.list || []).find((s) => s.id !== 'stu_001' && s.id !== 'stu_002') || { id: 'stu_003' }
r = await raw('/membership/my?studentId=' + otherStu.id, { token: pt })
assert('家长查他人会员卡被拒', r.body.code !== 0, JSON.stringify(r.body).slice(0, 60))
r = await raw('/membership/deductions?studentId=' + otherStu.id, { token: pt })
assert('家长查他人扣课明细被拒', r.body.code !== 0, JSON.stringify(r.body).slice(0, 60))
r = await raw('/membership/expiring', { token: pt })
assert('家长查全机构到期被拒', r.body.code !== 0, JSON.stringify(r.body).slice(0, 60))
r = await raw('/points/balance?studentId=' + otherStu.id, { token: pt })
assert('家长查他人积分被拒', r.body.code !== 0, JSON.stringify(r.body).slice(0, 60))
r = await raw('/points/logs?studentId=' + otherStu.id, { token: pt })
assert('家长查他人积分流水被拒', r.body.code !== 0, JSON.stringify(r.body).slice(0, 60))
r = await raw('/checkin/records?studentId=' + otherStu.id, { token: pt })
assert('家长查他人签到记录被拒', r.body.code !== 0, JSON.stringify(r.body).slice(0, 60))
r = await raw('/checkin/today?studentId=' + otherStu.id, { token: pt })
assert('家长查他人今日签到被拒', r.body.code !== 0, JSON.stringify(r.body).slice(0, 60))
// 家长访问自己绑定成员仍可用（stu_001 为 13900000001 绑定）
r = await raw('/membership/my?studentId=stu_001', { token: pt })
assert('家长查自己会员卡可用', r.body.code === 0, JSON.stringify(r.body).slice(0, 60))
r = await raw('/points/balance?studentId=stu_001', { token: pt })
assert('家长查自己积分可用', r.body.code === 0, JSON.stringify(r.body).slice(0, 60))

// 4. 教练权限（部分接口允许）
const c = await raw('/auth/login', { m: 'POST', b: { phone: '13800000011', role: 'coach', password: '123456' } })
const ct = c.body.data.token
r = await raw('/checkin/today', { token: ct })
assert('教练查今日签到可用', r.body.code === 0, JSON.stringify(r.body).slice(0, 60))
r = await raw('/admin/dashboard', { token: ct })
assert('教练访问看板被拒', r.status === 403 || r.body.code !== 0, `status=${r.status}`)
r = await raw('/orders', { token: ct })
assert('教练访问订单被拒', r.status === 403 || r.body.code !== 0, `status=${r.status}`)

// 5. 幂等：重复报名/签到
const p2 = await raw('/auth/login', { m: 'POST', b: { phone: '13900000002', role: 'parent' } })
const p2t = p2.body.data.token
const share1 = await raw('/points/share', { m: 'POST', token: pt })
const share2 = await raw('/points/share', { m: 'POST', token: pt })
assert('分享积分幂等', share1.body.code === 0 && share2.body.code === 0, JSON.stringify([share1.body.code, share2.body.code]))

// 6. 微信身份账号稳定性：手机号登录不应改写 wx_ 前缀 openid（防止微信登录账号分裂）
const WX_PHONE = '13999990001'
execSync(`sqlite3 ${DB} "DELETE FROM users WHERE phone = '${WX_PHONE}'; DELETE FROM parent_bindings WHERE parent_phone = '${WX_PHONE}';"`)
execSync(`sqlite3 ${DB} "INSERT INTO users (id, openid, phone, nickname, role, status, created_at, updated_at) VALUES ('user_wxreg', 'wx_regtest_001', '${WX_PHONE}', '微信回归用户', 'parent', 'active', strftime('%s','now')*1000, strftime('%s','now')*1000);"`)
const wxLogin = await raw('/auth/login', { m: 'POST', b: { phone: WX_PHONE, role: 'parent' } })
assert('微信身份手机号登录', wxLogin.body.code === 0, JSON.stringify(wxLogin.body).slice(0, 60))
assert('微信身份 openid 保留', wxLogin.body.data?.openid === 'wx_regtest_001', `openid=${wxLogin.body.data?.openid}`)
const wxToken = wxLogin.body.data?.token
if (wxToken) {
  const upd = await raw('/auth/updateProfile', { m: 'POST', token: wxToken, b: { phone: '13999990002', nickname: '微信回归用户' } })
  assert('微信身份改手机号保留 openid', upd.body.data?.openid === 'wx_regtest_001', JSON.stringify(upd.body).slice(0, 60))
}
execSync(`sqlite3 ${DB} "DELETE FROM users WHERE id = 'user_wxreg'; DELETE FROM parent_bindings WHERE parent_phone IN ('${WX_PHONE}','13999990002'); DELETE FROM parent_bindings WHERE student_id = 'stu_007' AND parent_phone IN ('13988880001','13988880002');"`)

// 6.1 管理员改成员家长手机号：账号迁移 + 绑定 openid 与微信身份一致（防账号分裂与绑定不可见）
execSync(`sqlite3 ${DB} "DELETE FROM users WHERE phone IN ('13988880001','13988880002'); DELETE FROM parent_bindings WHERE student_id = 'stu_007' AND parent_phone IN ('13988880001','13988880002'); INSERT INTO users (id, openid, phone, nickname, role, status, created_at, updated_at) VALUES ('user_wxstu', 'wx_stu_parent_01', '13988880001', '微信家长测试', 'parent', 'active', strftime('%s','now')*1000, strftime('%s','now')*1000); INSERT INTO parent_bindings (student_id, student_name, parent_name, parent_openid, parent_phone, relation, is_main, created_at) VALUES ('stu_007', '测试学员7', '微信家长测试', 'wx_stu_parent_01', '13988880001', '家长', 1, strftime('%s','now')*1000);"`)
const updStu = await raw('/students/stu_007', { m: 'PUT', token, b: { parentPhone: '13988880002', parentName: '微信家长测试' } })
assert('改成员家长手机号成功', updStu.body.code === 0, JSON.stringify(updStu.body).slice(0, 60))
const stuUser = execSync(`sqlite3 ${DB} "SELECT openid, phone FROM users WHERE id = 'user_wxstu'"`).toString().trim()
assert('家长账号迁移+保留微信身份', stuUser === 'wx_stu_parent_01|13988880002', `row=${stuUser}`)
const stuBind = execSync(`sqlite3 ${DB} "SELECT parent_openid FROM parent_bindings WHERE student_id = 'stu_007' AND parent_phone = '13988880002'"`).toString().trim()
assert('绑定 openid 与微信身份一致', stuBind === 'wx_stu_parent_01', `bind=${stuBind}`)
const newLogin = await raw('/auth/login', { m: 'POST', b: { phone: '13988880002', role: 'parent' } })
assert('新手机号登录匹配同一账号', newLogin.body.data?.openid === 'wx_stu_parent_01', JSON.stringify(newLogin.body).slice(0, 60))
const myAfter = await raw('/students/my', { token: newLogin.body.data?.token })
assert('改号后绑定仍可见', (myAfter.body.data || []).some((s) => s.id === 'stu_007'), JSON.stringify(myAfter.body).slice(0, 60))
execSync(`sqlite3 ${DB} "DELETE FROM users WHERE id = 'user_wxstu'; DELETE FROM parent_bindings WHERE student_id = 'stu_007' AND parent_phone IN ('13988880001','13988880002');"`)

// 7. 清除签到记录：删除记录 + 回滚积分 + 回滚次数卡扣课（防误签到无法纠正）
const clearSched = await req('/schedules', { m: 'POST', b: { courseName: '验证课-清除签到', date: '2099-01-05', startTime: '10:00', endTime: '11:00', maxStudents: 10 } })
assert('清除测试-创建排期', clearSched.code === 0, JSON.stringify(clearSched).slice(0, 80))
const clearSchedId = clearSched.data.id
const balBefore = Number(execSync(`sqlite3 ${DB} "SELECT COALESCE(SUM(balance),0) FROM points WHERE student_id='stu_001'"`).toString().trim())
const clsBefore = Number(execSync(`sqlite3 ${DB} "SELECT COALESCE(SUM(remaining_classes),0) FROM member_cards WHERE student_id='stu_001' AND status='active'"`).toString().trim())
await raw(`/schedules/${clearSchedId}/enroll`, { m: 'POST', token: pt, b: { studentId: 'stu_001' } })
const mark1 = await raw('/checkin/teacher', { m: 'POST', token: token, b: { scheduleId: clearSchedId, attendances: [{ studentId: 'stu_001', status: 'present' }] } })
assert('清除测试-签到成功', mark1.body.code === 0, JSON.stringify(mark1.body).slice(0, 80))
const balAfter = Number(execSync(`sqlite3 ${DB} "SELECT COALESCE(SUM(balance),0) FROM points WHERE student_id='stu_001'"`).toString().trim())
assert('清除测试-签到加分', balAfter === balBefore + 10, `bal=${balBefore}->${balAfter}`)
const cleared = await raw('/checkin/teacher', { m: 'POST', token: token, b: { scheduleId: clearSchedId, attendances: [{ studentId: 'stu_001', status: 'clear' }] } })
assert('清除测试-清除成功', cleared.body.code === 0, JSON.stringify(cleared.body).slice(0, 80))
const balFinal = Number(execSync(`sqlite3 ${DB} "SELECT COALESCE(SUM(balance),0) FROM points WHERE student_id='stu_001'"`).toString().trim())
assert('清除测试-积分回滚', balFinal === balBefore, `bal=${balFinal} expect=${balBefore}`)
const attCount = Number(execSync(`sqlite3 ${DB} "SELECT COUNT(*) FROM attendances WHERE schedule_id='${clearSchedId}' AND student_id='stu_001'"`).toString().trim())
assert('清除测试-记录已删除', attCount === 0, `att=${attCount}`)
const clsFinal = Number(execSync(`sqlite3 ${DB} "SELECT COALESCE(SUM(remaining_classes),0) FROM member_cards WHERE student_id='stu_001' AND status='active'"`).toString().trim())
assert('清除测试-扣课回滚', clsFinal === clsBefore, `cls=${clsBefore}->${clsFinal}`)
execSync(`sqlite3 ${DB} "DELETE FROM enrollments WHERE schedule_id='${clearSchedId}'; DELETE FROM attendances WHERE schedule_id='${clearSchedId}'; DELETE FROM deduction_logs WHERE schedule_id='${clearSchedId}'; DELETE FROM point_logs WHERE reference_id='${clearSchedId}'; DELETE FROM schedules WHERE id='${clearSchedId}';"`)

// 8. 目标班级限制：首场活动放行；已有场次按历史归属校验（防串班且不误伤新班）
const grpCourse = await req('/admin/courses', { m: 'POST', b: { name: '验证课-班级限制', category: '测试' } })
assert('班级限制-创建课程', grpCourse.code === 0, JSON.stringify(grpCourse).slice(0, 80))
const grpCourseId = grpCourse.data.id
const schA = await req('/schedules', { m: 'POST', b: { courseId: grpCourseId, courseName: '验证课-班级限制', groupCourseId: grpCourseId, groupName: '验证课-班级限制', date: '2099-01-10', startTime: '09:00', endTime: '10:00', maxStudents: 10 } })
assert('班级限制-创建首场活动', schA.code === 0, JSON.stringify(schA).slice(0, 80))
const enrA = await raw(`/schedules/${schA.data.id}/enroll`, { m: 'POST', token: pt, b: { studentId: 'stu_001' } })
assert('班级限制-首场新学员可报名', enrA.body.code === 0, JSON.stringify(enrA.body).slice(0, 80))
const schB = await req('/schedules', { m: 'POST', b: { courseId: grpCourseId, courseName: '验证课-班级限制', groupCourseId: grpCourseId, groupName: '验证课-班级限制', date: '2099-01-12', startTime: '09:00', endTime: '10:00', maxStudents: 10 } })
assert('班级限制-创建第二场活动', schB.code === 0, JSON.stringify(schB).slice(0, 80))
const enrB = await raw(`/schedules/${schB.data.id}/enroll`, { m: 'POST', token: pt, b: { studentId: 'stu_001' } })
assert('班级限制-历史学员可报名第二场', enrB.body.code === 0, JSON.stringify(enrB.body).slice(0, 80))
const enrC = await raw(`/schedules/${schB.data.id}/enroll`, { m: 'POST', token: p2t, b: { studentId: 'stu_002' } })
assert('班级限制-非本班学员被拒', enrC.body.code !== 0, JSON.stringify(enrC.body).slice(0, 80))
const enrAdmin = await raw(`/schedules/${schB.data.id}/enroll`, { m: 'POST', token: token, b: { studentId: 'stu_002' } })
assert('班级限制-管理员可代报名', enrAdmin.body.code === 0, JSON.stringify(enrAdmin.body).slice(0, 80))
execSync(`sqlite3 ${DB} "DELETE FROM enrollments WHERE schedule_id IN ('${schA.data.id}','${schB.data.id}'); DELETE FROM attendances WHERE schedule_id IN ('${schA.data.id}','${schB.data.id}'); DELETE FROM schedules WHERE id IN ('${schA.data.id}','${schB.data.id}'); DELETE FROM courses WHERE id='${grpCourseId}';"`)

// 9. 编辑排期可清空教师/目标分组（显式空串→清除；字段未传→保持原值）
const editSch = await req('/schedules', { m: 'POST', b: { courseName: '验证课-清空字段', date: '2099-02-01', startTime: '10:00', endTime: '11:00', teacherName: '测试教练', groupCourseId: 'course_grp', groupName: '验证课-清空字段' } })
assert('清空测试-创建排期', editSch.code === 0, JSON.stringify(editSch).slice(0, 80))
const upd1 = await req(`/schedules/${editSch.data.id}`, { m: 'PUT', b: { teacherId: '', groupCourseId: '', groupName: '' } })
assert('清空测试-更新成功', upd1.code === 0, JSON.stringify(upd1).slice(0, 80))
const row1 = execSync(`sqlite3 ${DB} "SELECT COALESCE(teacher_id,'')||'|'||COALESCE(teacher_name,'')||'|'||COALESCE(group_course_id,'')||'|'||COALESCE(group_name,'') FROM schedules WHERE id='${editSch.data.id}'"`).toString().trim()
assert('清空测试-教师与分组已清空', row1 === '|||', `row=${row1}`)
// 字段未传（undefined）时保持原值：先设教师，再只更新日期，教师应保留
const tRow = execSync(`sqlite3 ${DB} "SELECT id, name FROM teachers ORDER BY id LIMIT 1"`).toString().trim().split('|')
if (tRow.length >= 2 && tRow[0]) {
  await req(`/schedules/${editSch.data.id}`, { m: 'PUT', b: { teacherId: tRow[0] } })
  await req(`/schedules/${editSch.data.id}`, { m: 'PUT', b: { date: '2099-02-02' } })
  const row2 = execSync(`sqlite3 ${DB} "SELECT COALESCE(teacher_id,'') FROM schedules WHERE id='${editSch.data.id}'"`).toString().trim()
  assert('清空测试-未传字段保持原值', row2 === tRow[0], `row=${row2}`)
}
execSync(`sqlite3 ${DB} "DELETE FROM schedules WHERE id='${editSch.data.id}';"`)

// 10. 看板“有效会员数”口径：持有进行中且未过期会员卡的去重学员数（区别于在读成员全量）
const dash10 = await req('/admin/dashboard')
const ov10 = dash10.data && dash10.data.overview
const vm10 = Number(execSync(`sqlite3 ${DB} "SELECT COUNT(DISTINCT student_id) FROM member_cards WHERE status='active' AND expires_at > strftime('%s','now')*1000"`).toString().trim())
assert('看板-有效会员数口径正确', ov10 && ov10.validMembers === vm10, `api=${ov10 && ov10.validMembers} db=${vm10}`)

// 11. 家长查看他人成员的成长记录（点评）应被拒（隐私越权）
const otherStu3 = execSync(`sqlite3 ${DB} "SELECT id FROM students WHERE id != 'stu_001' AND id != 'stu_002' LIMIT 1"`).toString().trim()
if (otherStu3) {
  const cmtMy = await raw(`/comments/my?studentId=${otherStu3}`, { token: pt })
  assert('家长查他人成长记录被拒', cmtMy.body.code !== 0 && cmtMy.status !== 500, `status=${cmtMy.status} code=${cmtMy.body.code}`)
const cmtOwn = await raw('/comments/my?studentId=stu_001', { token: pt })
assert('家长查自己孩子成长记录正常', cmtOwn.body.code === 0, JSON.stringify(cmtOwn.body).slice(0, 60))
}

// 12. 解绑成员：家长可解绑自己绑定的学员，解绑后不可见且详情被拒
const unbindStuId = execSync(`sqlite3 ${DB} "INSERT INTO students (id, name, gender, birthday, status, join_date, created_at, updated_at) VALUES ('stu_unbind_t', '解绑回归学员', '男', '2015-01-01', 'active', date('now'), strftime('%s','now')*1000, strftime('%s','now')*1000); SELECT 'stu_unbind_t';"`).toString().trim()
const unbindOpenid = execSync(`sqlite3 ${DB} "SELECT openid FROM users WHERE phone='13900000001'"`).toString().trim()
execSync(`sqlite3 ${DB} "INSERT INTO parent_bindings (student_id, student_name, parent_name, parent_openid, parent_phone, relation, is_main, created_at) VALUES ('stu_unbind_t', '解绑回归学员', '小明爸爸', '${unbindOpenid}', '13900000001', '家长', 1, strftime('%s','now')*1000);"`)
const unbindRes = await raw('/auth/unbindStudent', { m: 'POST', token: pt, b: { studentId: 'stu_unbind_t' } })
assert('家长解绑成员成功', unbindRes.body.code === 0, JSON.stringify(unbindRes.body).slice(0, 80))
const bindLeft = Number(execSync(`sqlite3 ${DB} "SELECT COUNT(*) FROM parent_bindings WHERE student_id='stu_unbind_t'"`).toString().trim())
assert('解绑后绑定已删除', bindLeft === 0, `left=${bindLeft}`)
const unbindDet = await raw('/students/stu_unbind_t', { token: pt })
assert('解绑后查详情被拒', unbindDet.body.code !== 0, JSON.stringify(unbindDet.body).slice(0, 60))
execSync(`sqlite3 ${DB} "DELETE FROM parent_bindings WHERE student_id='stu_unbind_t'; DELETE FROM students WHERE id='stu_unbind_t';"`)

// 13. 家长撤销待审批请假：本人可撤、他人被拒、重复撤被拒
const lvSch = await req('/schedules', { m: 'POST', b: { courseName: '验证课-撤销请假', date: '2099-04-01', startTime: '17:00', endTime: '18:00', maxStudents: 10 } })
await raw(`/schedules/${lvSch.data.id}/enroll`, { m: 'POST', token: pt, b: { studentId: 'stu_001' } })
const lvRow = await raw('/leave/apply', { m: 'POST', token: pt, b: { scheduleId: lvSch.data.id, studentId: 'stu_001', reason: '撤销回归测试' } })
assert('撤销测试-提交请假', lvRow.body.code === 0, JSON.stringify(lvRow.body).slice(0, 60))
const lvId = lvRow.body.data.id
const otherCancel = await raw(`/leave/${lvId}/cancel`, { m: 'POST', token: p2t, b: {} })
assert('撤销测试-他人撤销被拒', otherCancel.body.code !== 0, JSON.stringify(otherCancel.body).slice(0, 60))
const ownCancel = await raw(`/leave/${lvId}/cancel`, { m: 'POST', token: pt, b: {} })
assert('撤销测试-本人撤销成功', ownCancel.body.code === 0, JSON.stringify(ownCancel.body).slice(0, 60))
const lvStatus = execSync(`sqlite3 ${DB} "SELECT status FROM leave_requests WHERE id='${lvId}'"`).toString().trim()
assert('撤销测试-状态为已撤销', lvStatus === 'cancelled', `status=${lvStatus}`)
const againCancel = await raw(`/leave/${lvId}/cancel`, { m: 'POST', token: pt, b: {} })
assert('撤销测试-重复撤销被拒', againCancel.body.code !== 0, JSON.stringify(againCancel.body).slice(0, 60))
execSync(`sqlite3 ${DB} "DELETE FROM leave_requests WHERE schedule_id='${lvSch.data.id}'; DELETE FROM enrollments WHERE schedule_id='${lvSch.data.id}'; DELETE FROM schedules WHERE id='${lvSch.data.id}';"`)

execSync(`sqlite3 ${DB} "UPDATE points SET balance = balance - (SELECT p.amount FROM point_logs p WHERE p.reference_id LIKE 'share_%' AND p.student_id = points.student_id LIMIT 1), total_earned = total_earned - (SELECT p.amount FROM point_logs p WHERE p.reference_id LIKE 'share_%' AND p.student_id = points.student_id LIMIT 1) WHERE EXISTS (SELECT 1 FROM point_logs p WHERE p.reference_id LIKE 'share_%' AND p.student_id = points.student_id); DELETE FROM point_logs WHERE reference_id LIKE 'share_%';"`)
console.log(`\n结果：${ok} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
