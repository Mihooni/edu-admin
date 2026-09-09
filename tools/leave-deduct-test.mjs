// 请假扣减规则聚焦测试：扣课时/扣天数/双卡选择/暂停卡不破坏顺延
const BASE = 'http://localhost:3001/api'
const db = (await import('../backend/db/index.js')).default
const fail = []
const pass = []
const ok = (n, c, e = '') => { (c ? pass : fail).push(n); if (!c) console.log('  ✗', n, e) }

function uid(p) { return p + '_' + Math.random().toString(36).slice(2, 10).toUpperCase() }
function todayStr() {
  const d = new Date(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

// admin token
const login = await (await fetch(BASE + '/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone: '13800000001', role: 'admin', password: '123456' })
})).json()
const token = login.data.token
const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }

const now = Date.now()
const STUDENT_ID = uid('stu_lvtest')
const PARENT_OPENID = uid('openid_lvtest')

// setup student + binding
db.prepare(`INSERT INTO students (id,name,gender,birthday,status,join_date,created_at,updated_at,member_no)
  VALUES (?,?,?,?, 'active', ?, ?, ?, ?)`).run(STUDENT_ID, '请假测试学员', '男', '2015-01-01', now, now, now, 'LV-TEST')
db.prepare(`INSERT INTO parent_bindings (student_id,student_name,parent_name,parent_openid,parent_phone,relation,is_main,created_at)
  VALUES (?,?,?,?,?, '父亲', 1, ?)`).run(STUDENT_ID, '请假测试学员', '家长', PARENT_OPENID, '13900009999', now)

// create a schedule today
const courseId = uid('crs_lv')
db.prepare(`INSERT INTO courses (id,name,category,duration,is_active,created_at,archived) VALUES (?,?,?,60,1,?,0)`).run(courseId, '测试课程', '测试', now)
const schedId = uid('sch_lv')
db.prepare(`INSERT INTO schedules (id,course_id,course_name,teacher_name,date,start_time,end_time,max_students,enrolled_count,status,is_recursive,created_at,updated_at)
  VALUES (?,?,?,?,?,?,?,?,0,'scheduled',0,?,?)`).run(schedId, courseId, '测试训练', '何教练', todayStr(), '19:00', '20:00', 30, now, now)

function makeCard(mode, opts = {}) {
  const id = uid('card_lv')
  const total = opts.total ?? (mode === 'count' ? 10 : 0)
  const expires = opts.expires ?? (now + 30 * 86400000)
  db.prepare(`INSERT INTO member_cards (id,card_type_id,card_type_name,billing_mode,student_id,student_name,
    total_classes,remaining_classes,used_classes,activated_at,expires_at,status,order_id,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,0,?,?, 'active', ?, ?, ?)`).run(
    id, uid('ct'), mode === 'count' ? '次卡' : '月卡', mode, STUDENT_ID, '请假测试学员',
    total, total, now, expires, uid('ord'), now, now)
  return id
}

async function setLeaveRules(rules) {
  const r = await fetch(BASE + '/settings', { method: 'PUT', headers: H, body: JSON.stringify({ leave_rules: rules }) })
  return r.json()
}
async function approveLeave(mode) {
  // insert leave request directly
  const lid = uid('lv_')
  db.prepare(`INSERT INTO leave_requests (id,student_id,student_name,schedule_id,course_name,date,start_time,reason,status,parent_openid,parent_phone,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,'pending',?, '', ?, ?)`).run(
    lid, STUDENT_ID, '请假测试学员', schedId, '测试训练', todayStr(), '19:00', '测试请假', PARENT_OPENID, now, now)
  const r = await fetch(BASE + '/leave/' + lid + '/approve', { method: 'PUT', headers: H, body: JSON.stringify({ action: 'approve', note: 'ok' }) })
  return { id: lid, ...(await r.json()) }
}

const DAY = 86400000
const BASE_RULES = { monthlyLimit: 0, deductClass: false, deductMode: 'none', deductAmount: 0 }
const _origSettings = await (await fetch(BASE + '/settings', { headers: H })).json()
const ORIG_RULES = (_origSettings.data && _origSettings.data.leave_rules) || BASE_RULES
try {
  // --- scenario 1: days mode, time card present ---
  const timeCard = makeCard('time')
  const beforeTime = db.prepare('SELECT expires_at FROM member_cards WHERE id=?').get(timeCard).expires_at
  await setLeaveRules({ ...BASE_RULES, deductMode: 'days', deductAmount: 2 })
  const r1 = await approveLeave('days')
  const afterTime = db.prepare('SELECT expires_at,status FROM member_cards WHERE id=?').get(timeCard)
  ok('扣天数-审批通过', r1.code === 0, JSON.stringify(r1))
  ok('扣天数-到期日提前2天', afterTime.expires_at === beforeTime - 2 * DAY, `before=${beforeTime} after=${afterTime.expires_at} diff=${beforeTime - afterTime.expires_at}`)
  ok('扣天数-卡仍有效', afterTime.status === 'active')

  // --- scenario 2: class mode, count card present (time card also exists) ---
  const countCard = makeCard('count', { total: 5 })
  const timeCard2 = makeCard('time')
  const beforeCount = db.prepare('SELECT remaining_classes FROM member_cards WHERE id=?').get(countCard).remaining_classes
  const beforeTime2 = db.prepare('SELECT expires_at FROM member_cards WHERE id=?').get(timeCard2).expires_at
  await setLeaveRules({ ...BASE_RULES, deductMode: 'class', deductAmount: 1 })
  const r2 = await approveLeave('class')
  const afterCount = db.prepare('SELECT remaining_classes FROM member_cards WHERE id=?').get(countCard).remaining_classes
  const afterTime2 = db.prepare('SELECT expires_at FROM member_cards WHERE id=?').get(timeCard2).expires_at
  ok('扣课时-审批通过', r2.code === 0, JSON.stringify(r2))
  ok('扣课时-次数卡减1', afterCount === beforeCount - 1, `${beforeCount}->${afterCount}`)
  ok('扣课时-时效卡不受影响', afterTime2 === beforeTime2, `${beforeTime2}->${afterTime2}`)

  // --- scenario 3: class mode but only time card -> no deduction, no crash ---
  const timeOnly = makeCard('time')
  const beforeT = db.prepare('SELECT expires_at FROM member_cards WHERE id=?').get(timeOnly).expires_at
  await setLeaveRules({ ...BASE_RULES, deductMode: 'class', deductAmount: 1 })
  const r3 = await approveLeave('mismatch')
  const afterT = db.prepare('SELECT expires_at FROM member_cards WHERE id=?').get(timeOnly).expires_at
  ok('模式不匹配-不报错', r3.code === 0, JSON.stringify(r3))
  ok('模式不匹配-不扣时效卡', afterT === beforeT)

  // --- scenario 4: days mode on paused card: deduction applied, pause state untouched and future resume still extends ---
  const pausedCard = makeCard('time')
  // pause it
  const pauseAt = now - 5 * DAY
  db.prepare('UPDATE member_cards SET status=?, paused_at=?, pause_total_ms=? WHERE id=?').run('paused', pauseAt, 0, pausedCard)
  const beforePaused = db.prepare('SELECT expires_at FROM member_cards WHERE id=?').get(pausedCard).expires_at
  // create a fresh active time card so days deduction picks the active one (we only deduct active cards)
  const activeForPaused = makeCard('time', { expires: now + 100 * DAY })
  const beforeActive = db.prepare('SELECT expires_at FROM member_cards WHERE id=?').get(activeForPaused).expires_at
  await setLeaveRules({ ...BASE_RULES, deductMode: 'days', deductAmount: 1 })
  const r4 = await approveLeave('paused')
  const afterPaused = db.prepare('SELECT * FROM member_cards WHERE id=?').get(pausedCard)
  const afterActive = db.prepare('SELECT expires_at FROM member_cards WHERE id=?').get(activeForPaused).expires_at
  ok('有暂停卡-审批通过', r4.code === 0, JSON.stringify(r4))
  ok('有暂停卡-暂停卡不被扣减且状态不变', afterPaused.expires_at === beforePaused && afterPaused.status === 'paused')
  ok('有暂停卡-活动卡扣1天', afterActive === beforeActive - 1 * DAY)
} finally {
  // cleanup：删除所有引用表再删学员，单表失败不阻断其余清理
  for (const t of ['leave_requests', 'attendances', 'point_logs', 'points', 'member_cards', 'enrollments', 'parent_bindings']) {
    try { db.prepare('DELETE FROM ' + t + ' WHERE student_id=?').run(STUDENT_ID) } catch (e) { /* ignore */ }
  }
  try { db.prepare('DELETE FROM schedules WHERE id=?').run(schedId) } catch (e) {}
  try { db.prepare('DELETE FROM courses WHERE id=?').run(courseId) } catch (e) {}
  try { db.prepare('DELETE FROM students WHERE id=?').run(STUDENT_ID) } catch (e) {}
  await setLeaveRules(ORIG_RULES)
}

console.log(`\n请假扣减测试：${pass.length} 通过，${fail.length} 失败`)
if (fail.length) { console.log('失败项：', fail); process.exit(1) }
