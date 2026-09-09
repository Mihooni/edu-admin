// 家长扫码签到链路测试：生成二维码 → 家长签到(+10分) → 重复签到拒绝 → 首页签到状态
import path from 'node:path';
const __ROOT = (() => {
  const p = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  return p;
})();
const BASE = 'http://localhost:3001/api'
let ok = 0, fail = 0
const assert = (n, c, x = '') => { if (c) { ok++; console.log('✓ ' + n) } else { fail++; console.log('✗ ' + n + ' ' + x) } }
const j = async (p, opts = {}) => {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  const r = await fetch(BASE + p, { headers, method: opts.m || 'GET', body: opts.b ? JSON.stringify(opts.b) : undefined })
  return { status: r.status, body: await r.json() }
}
// 管理员 + 家长登录
const A = (await j('/auth/login', { m: 'POST', b: { phone: '13800000001', password: '123456', role: 'admin' } })).body.data
const AH = { Authorization: 'Bearer ' + A.token }
const P = (await j('/auth/login', { m: 'POST', b: { phone: '13900000001', role: 'parent' } })).body.data
const PH = { Authorization: 'Bearer ' + P.token }

// 1. 管理员创建排期(明天,唯一名称)
const tomorrow = new Date(Date.now() + 86400000)
const dateStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}`
const name = '家长签到测试-' + Date.now().toString(36).slice(-4)
const sched = await j('/schedules', { m: 'POST', headers: AH, b: { courseName: name, date: dateStr, startTime: '18:00', endTime: '19:00' } })
assert('创建测试排期', sched.body.code === 0, sched.body.message)
const sid = sched.body.data.id

// 2. 家长报名
const enr = await j('/schedules/' + sid + '/enroll', { m: 'POST', headers: PH, b: { studentId: 'stu_001' } })
assert('家长报名', enr.body.code === 0, JSON.stringify(enr.body).slice(0, 60))

// 3. 家长生成签到二维码
const qr = await j('/students/stu_001/qrcode', { m: 'POST', headers: PH })
assert('生成签到二维码', qr.body.code === 0 && (qr.body.data.qrCode || '').startsWith('CHECKIN:'), JSON.stringify(qr.body).slice(0, 60))

// 4. 家长扫码签到 → +10 分
const before = await j('/points/balance?studentId=stu_001', { headers: PH })
const beforeBal = before.body.data?.balance || 0
const ck = await j('/checkin/parent', { m: 'POST', headers: PH, b: { scheduleId: sid, studentId: 'stu_001' } })
assert('家长扫码签到', ck.body.code === 0 && ck.body.data.pointsEarned === 10, JSON.stringify(ck.body).slice(0, 60))
const after = await j('/points/balance?studentId=stu_001', { headers: PH })
assert('签到后积分 +10', (after.body.data?.balance || 0) === beforeBal + 10, `before=${beforeBal} after=${after.body.data?.balance}`)

// 5. 重复签到拒绝
const dup = await j('/checkin/parent', { m: 'POST', headers: PH, b: { scheduleId: sid, studentId: 'stu_001' } })
assert('重复签到被拒绝', dup.body.code !== 0, JSON.stringify(dup.body).slice(0, 60))

// 6. 首页数据反映签到状态
const home = await j('/students/home/data?studentId=stu_001', { headers: PH })
const allClasses = [...(home.body.data.todayClasses || []), ...(home.body.data.tomorrowClasses || [])]
const classItem = allClasses.find((c) => c.id === sid)
assert('首页活动卡存在', !!classItem, '未找到测试活动')
if (classItem) assert('首页活动卡已签到', classItem.checkedInCount >= 1, JSON.stringify(classItem).slice(0, 80))

// 清理
await j('/schedules/' + sid, { m: 'DELETE', headers: AH }).catch(() => {})
// 恢复积分(签到奖励回滚)
const balNow = (await j('/points/balance?studentId=stu_001', { headers: PH })).body.data?.balance || 0
if (balNow > beforeBal) {
  await j('/growth/points/adjust', { m: 'POST', headers: AH, b: { studentId: 'stu_001', type: 'consume', amount: balNow - beforeBal, reason: '测试清理' } }).catch(() => {})
}
// 清理签到记录与扣课日志
import('node:child_process').then(({ execSync }) => {
  const DB = `${__ROOT}/backend/db/data.db`
  execSync(`sqlite3 ${DB} "DELETE FROM attendances WHERE schedule_id = '${sid}'; DELETE FROM deduction_logs WHERE schedule_id = '${sid}'; DELETE FROM point_logs WHERE reason LIKE '%签到%' AND student_id = 'stu_001' AND created_at > ${Date.now() - 60000};"`)
  console.log(`\n结果：${ok} 通过 / ${fail} 失败`)
  process.exit(fail ? 1 : 0)
})
