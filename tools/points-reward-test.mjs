import path from 'node:path';
import { execSync } from 'node:child_process'
const __ROOT = (() => {
  const p = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  return p;
})();
const DB = `${__ROOT}/backend/db/data.db`
// 清理历史分享/购买送分测试残留（保证幂等，不污染演示数据）
function cleanRewards() {
  execSync(`sqlite3 ${DB} "UPDATE points SET balance = balance - (SELECT p.amount FROM point_logs p WHERE p.reference_id LIKE 'share_%' AND p.student_id = points.student_id LIMIT 1), total_earned = total_earned - (SELECT p.amount FROM point_logs p WHERE p.reference_id LIKE 'share_%' AND p.student_id = points.student_id LIMIT 1) WHERE EXISTS (SELECT 1 FROM point_logs p WHERE p.reference_id LIKE 'share_%' AND p.student_id = points.student_id); DELETE FROM point_logs WHERE reference_id LIKE 'share_%';"`)
}
cleanRewards()

const BASE = 'http://localhost:3001/api'
let r = await (await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '13800000001', role: 'admin', password: '123456' }) })).json()
const token = r.data.token
const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
const call = async (path, opts = {}) => (await fetch(BASE + path, { method: opts.m || 'GET', headers: h, body: opts.b ? JSON.stringify(opts.b) : undefined })).json()
let ok = 0, fail = 0
const assert = (n, c, x = '') => { if (c) { ok++; console.log('✓ ' + n) } else { fail++; console.log('✗ ' + n + ' ' + x) } }

// 0. 清理历史测试卡类型残留
const _all = await call('/membership/card-types')
for (const _c of ((_all.data && _all.data.list) || []).filter((x) => (x.name || '').startsWith('测试时效卡') || (x.name || '').startsWith('测试次卡'))) {
  await call('/membership/card-type/' + _c.id, { m: 'DELETE' }).catch(() => {})
}

// 1. 卡类型 points_reward 回填
r = await call('/membership/card-types')
const cards = (r.data && r.data.list) || []
const map = {}
cards.forEach((c) => { map[c.name] = c.points_reward })
console.log('  卡类型积分:', JSON.stringify(map))
assert('月卡20', map['时效月卡'] === 20 || map['月卡'] === 20, JSON.stringify(map))
assert('季卡50', map['时效季卡'] === 50 || map['季卡'] === 50)
assert('年卡120', map['时效年卡'] === 120 || map['年卡'] === 120)
const exp = cards.find((c) => (c.name || '').includes('体验'))
assert('体验卡10', !exp || exp.points_reward === 10, JSON.stringify(exp && exp.points_reward))

// 2. 销售收款自动送积分（stu_003 王刚买时效季卡 → +50）
const before = await call('/growth/points/list', {})
const stu3Before = ((before.data && before.data.list) || []).find((x) => x.student_id === 'stu_003')
const beforeBal = stu3Before ? stu3Before.balance : 0
const ct = cards.find((c) => c.name === '时效季卡') || cards.find((c) => c.name === '季卡')
r = await call('/orders', { m: 'POST', b: { studentId: 'stu_003', cardTypeId: ct.id, orderType: 'membership', status: 'paid', salesperson: '管理员' } })
assert('销售收款', r.code === 0, JSON.stringify(r))
const after = await call('/growth/points/list', {})
const stu3After = ((after.data && after.data.list) || []).find((x) => x.student_id === 'stu_003')
const afterBal = stu3After ? stu3After.balance : 0
assert('季卡购买自动送50分', afterBal - beforeBal === 50, `before=${beforeBal} after=${afterBal}`)

// 3. 分享积分（家长 13900000001，每周1次幂等）
const p1 = await (await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '13900000001', role: 'parent' }) })).json()
const ph = { 'Content-Type': 'application/json', Authorization: `Bearer ${p1.data.token}` }
const pcall = async (path, opts = {}) => (await fetch(BASE + path, { method: opts.m || 'GET', headers: ph, body: opts.b ? JSON.stringify(opts.b) : undefined })).json()
const bal1 = await pcall('/points/balance')
const b1 = bal1.data ? bal1.data.balance : 0
r = await pcall('/points/share', { m: 'POST' })
const firstAdded = r.code === 0 && r.data.added === 20
const firstDup = r.code === 0 && r.data.duplicated === true
assert('分享接口正常（首次+20 或 本周已领取）', r.code === 0 && (firstAdded || firstDup), JSON.stringify(r))
r = await pcall('/points/share', { m: 'POST' })
assert('分享幂等（重复调用不重复加分）', r.code === 0 && (r.data.duplicated === true || (firstAdded && r.data.added === undefined)), JSON.stringify(r))
const bal2 = await pcall('/points/balance')
if (firstAdded) {
  assert('首次分享余额 +20', (bal2.data.balance - b1) === 20, `b1=${b1} b2=${bal2.data.balance}`)
} else {
  assert('已领取过则余额不变', (bal2.data.balance - b1) === 0, `b1=${b1} b2=${bal2.data.balance}`)
}

// 清理：删除测试订单与发放的积分（保留演示数据干净）
const _orders = await call('/orders')
for (const _o of ((_orders.data && _orders.data.list) || []).filter((x) => x.student_id === 'stu_003' && (x.salesperson || '') === '管理员' && (x.id || '').startsWith('ORD'))) {
  execSync(`sqlite3 ${DB} "DELETE FROM payments WHERE order_id='${_o.id}'; DELETE FROM member_cards WHERE order_id='${_o.id}'; DELETE FROM point_logs WHERE reference_id='order_${_o.id}'; DELETE FROM orders WHERE id='${_o.id}';"`)
}
const _db = await import('node:child_process')
_db.execSync(`sqlite3 ${DB} "DELETE FROM point_logs WHERE reference_id LIKE 'order_%' AND reason LIKE '%季卡%';"`)
cleanRewards()
console.log(`\n结果：${ok} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
