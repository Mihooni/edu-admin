// 全库跨表一致性审计
// 全库跨表一致性审计：孤儿数据 / 金额一致 / 退款记录 / 积分非负
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const db = require(process.cwd() + '/backend/db')
let ok = 0, fail = 0
const assert = (n, c, x = '') => { if (c) { ok++; console.log('✓ ' + n) } else { fail++; console.log('✗ ' + n + ' ' + x) } }
// 1. 孤儿支付记录(订单不存在)
const orphanPay = db.prepare("SELECT COUNT(*) c FROM payments WHERE order_id NOT IN (SELECT id FROM orders)").get().c
assert('无孤儿支付记录', orphanPay === 0, `孤儿 ${orphanPay}`)
// 2. 孤儿会员卡(订单不存在但 order_id 非空)
const orphanCard = db.prepare("SELECT COUNT(*) c FROM member_cards WHERE order_id != '' AND order_id NOT IN (SELECT id FROM orders)").get().c
assert('无孤儿会员卡', orphanCard === 0, `孤儿 ${orphanCard}`)
// 3. 孤儿报名(排期不存在)
const orphanEnroll = db.prepare("SELECT COUNT(*) c FROM enrollments WHERE schedule_id NOT IN (SELECT id FROM schedules)").get().c
assert('无孤儿报名', orphanEnroll === 0, `孤儿 ${orphanEnroll}`)
// 4. 孤儿签到(排期不存在)
const orphanAtt = db.prepare("SELECT COUNT(*) c FROM attendances WHERE schedule_id NOT IN (SELECT id FROM schedules)").get().c
assert('无孤儿签到', orphanAtt === 0, `孤儿 ${orphanAtt}`)
// 5. 孤儿扣课日志(排期不存在)
const orphanDed = db.prepare("SELECT COUNT(*) c FROM deduction_logs WHERE schedule_id NOT IN (SELECT id FROM schedules)").get().c
assert('无孤儿扣课日志', orphanDed === 0, `孤儿 ${orphanDed}`)
// 6. 孤儿请假(排期不存在)
const orphanLeave = db.prepare("SELECT COUNT(*) c FROM leave_requests WHERE schedule_id NOT IN (SELECT id FROM schedules) AND schedule_id != ''").get().c
assert('无孤儿请假', orphanLeave === 0, `孤儿 ${orphanLeave}`)
// 7. 孤儿绑定(成员不存在)
const orphanBind = db.prepare("SELECT COUNT(*) c FROM parent_bindings WHERE student_id NOT IN (SELECT id FROM students)").get().c
assert('无孤儿绑定', orphanBind === 0, `孤儿 ${orphanBind}`)
// 7.1 孤儿签到积分流水(排期引用已不存在)
const orphanPtLog = db.prepare(`
  SELECT COUNT(*) c FROM point_logs
  WHERE reference_id LIKE 'sch_%' AND reference_id NOT IN (SELECT id FROM schedules)
`).get().c
assert('无孤儿签到积分流水', orphanPtLog === 0, `孤儿 ${orphanPtLog}`)
// 7.2 孤儿训练点评(排期引用已不存在)
const orphanComment = db.prepare(`
  SELECT COUNT(*) c FROM coach_comments
  WHERE schedule_id != '' AND schedule_id NOT IN (SELECT id FROM schedules)
`).get().c
assert('无孤儿训练点评', orphanComment === 0, `孤儿 ${orphanComment}`)
// 8. 订单金额与支付记录一致(已支付订单的支付记录金额 = payable_amount)
const badPay = db.prepare(`
  SELECT COUNT(*) c FROM payments p JOIN orders o ON o.id = p.order_id
  WHERE p.status = 'success' AND p.amount != o.payable_amount
`).get().c
assert('支付金额与订单一致', badPay === 0, `不一致 ${badPay}`)
// 9. 已退款订单有退款记录
const refundedNoRef = db.prepare(`
  SELECT COUNT(*) c FROM orders o
  WHERE o.status = 'refunded' AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id AND p.status = 'refunded')
`).get().c
assert('已退款订单有退款记录', refundedNoRef === 0, `缺退款记录 ${refundedNoRef}`)
// 10. 积分账户余额非负
const negPoints = db.prepare("SELECT COUNT(*) c FROM points WHERE balance < 0").get().c
assert('积分余额非负', negPoints === 0, `负数 ${negPoints}`)
console.log(`\n结果: ${ok} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
