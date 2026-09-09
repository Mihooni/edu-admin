// 退款边界测试：时效卡按剩余天数、次数卡按剩余次数、金额有效、状态更新（幂等自清理）
import path from 'node:path';
import { execSync } from 'node:child_process'
const __ROOT = (() => {
  const p = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  return p;
})();
const DB = `${__ROOT}/backend/db/data.db`
const BASE = 'http://localhost:3001/api'
let token = ''
let ok = 0, fail = 0
const assert = (n, c, x = '') => { if (c) { ok++; console.log('✓ ' + n) } else { fail++; console.log('✗ ' + n + ' ' + x) } }
const call = async (path, opts = {}) => {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  const r = await fetch(BASE + path, { method: opts.m || 'GET', headers, body: opts.b ? JSON.stringify(opts.b) : undefined })
  return r.json()
}
const r = await call('/auth/login', { m: 'POST', b: { phone: '13800000001', role: 'admin', password: '123456' } })
token = r.data.token

// 清理历史残留
execSync(`sqlite3 ${DB} "DELETE FROM member_cards WHERE card_type_id IN (SELECT id FROM membership_cards WHERE name LIKE '%测试%' OR name LIKE '%月卡%' OR name LIKE '%次卡%') AND student_id='stu_006' AND order_id LIKE 'RFND%'; DELETE FROM orders WHERE id LIKE 'RFND%'; DELETE FROM payments WHERE order_id LIKE 'RFND%';"`)

const ctypes = await call('/membership/card-types')
const timeCard = (ctypes.data.list || []).find((c) => (c.name || '').includes('月'))
const countCard = (ctypes.data.list || []).find((c) => (c.name || '').includes('次卡'))

// 1. 时效卡退款
const ord = await call('/orders', { m: 'POST', b: { studentId: 'stu_006', cardTypeId: timeCard.id, orderType: 'membership', status: 'paid', salesperson: '测试' } })
const my = await call('/membership/my?studentId=stu_006')
const tc = (my.data || []).find((c) => c.card_type_id === timeCard.id && c.status === 'active')
assert('时效卡激活', !!tc)
const rf = await call('/membership/refund', { m: 'POST', b: { cardId: tc.id, studentId: 'stu_006', reason: '测试退费' } })
assert('时效卡退款金额有效（>0 且有限）', rf.code === 0 && Number.isFinite(rf.data.refundAmount) && rf.data.refundAmount > 0, JSON.stringify(rf.data))
const my2 = await call('/membership/my?studentId=stu_006')
assert('退款后卡状态 refunded', (my2.data || []).find((c) => c.id === tc.id)?.status === 'refunded')
const rf2 = await call('/membership/refund', { m: 'POST', b: { cardId: tc.id, studentId: 'stu_006', reason: '重复退' } })
assert('重复退款被拒绝', rf2.code !== 0, JSON.stringify(rf2))

// 2. 次数卡退款（剩余次数比例）
if (countCard) {
  const ord2 = await call('/orders', { m: 'POST', b: { studentId: 'stu_006', cardTypeId: countCard.id, orderType: 'membership', status: 'paid', salesperson: '测试' } })
  const my3 = await call('/membership/my?studentId=stu_006')
  const cc = (my3.data || []).find((c) => c.card_type_id === countCard.id && c.status === 'active')
  assert('次数卡激活', !!cc)
  const rf3 = await call('/membership/refund', { m: 'POST', b: { cardId: cc.id, studentId: 'stu_006', reason: '测试退费' } })
  assert('次数卡退款成功且金额有效', rf3.code === 0 && Number.isFinite(rf3.data.refundAmount), JSON.stringify(rf3.data))
}

// 清理
execSync(`sqlite3 ${DB} "DELETE FROM member_cards WHERE card_type_id IN (SELECT id FROM membership_cards WHERE name LIKE '%月卡%' OR name LIKE '%次卡%') AND student_id='stu_006' AND order_id LIKE 'RFND%'; DELETE FROM orders WHERE id LIKE 'RFND%'; DELETE FROM payments WHERE order_id LIKE 'RFND%'; DELETE FROM orders WHERE salesperson='测试';"`)

// 3. 订单全额退款：回收购买赠送积分（与订单状态一致）
const ord3 = await call('/orders', { m: 'POST', b: { studentId: 'stu_006', cardTypeId: timeCard.id, orderType: 'membership', status: 'paid', salesperson: '测试' } })
assert('订单退款-创建已收款订单', ord3.code === 0, JSON.stringify(ord3))
const refPrefix = 'order_' + ord3.data.orderId
const balBefore = await call('/points/balance?studentId=stu_006')
const before = balBefore.data?.balance || 0
const rf3 = await call('/orders/' + ord3.data.orderId + '/refund', { m: 'POST', b: { reason: '测试全额退款' } })
assert('订单退款-全额退款成功', rf3.code === 0 && rf3.data.full === true, JSON.stringify(rf3))
const balAfter = await call('/points/balance?studentId=stu_006')
const log = await call('/points/logs?studentId=stu_006&pageSize=50')
const rewardLog = (log.data.list || []).find((l) => (l.reference_id || '').startsWith(refPrefix) && l.type === 'refund')
assert('订单退款-赠送积分已回收', before >= 20 && (balAfter.data?.balance || 0) === before - 20 && rewardLog, `before=${before} after=${balAfter.data?.balance} log=${JSON.stringify(rewardLog || '')}`)

// 清理
execSync(`sqlite3 ${DB} "DELETE FROM member_cards WHERE card_type_id IN (SELECT id FROM membership_cards WHERE name LIKE '%月卡%' OR name LIKE '%次卡%') AND student_id='stu_006' AND order_id LIKE 'ORD%'; DELETE FROM orders WHERE salesperson='测试'; DELETE FROM payments WHERE order_id LIKE 'ORD%'; DELETE FROM point_logs WHERE reference_id LIKE 'order_ORD%' AND student_id='stu_006';"`)
console.log(`\n结果：${ok} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
