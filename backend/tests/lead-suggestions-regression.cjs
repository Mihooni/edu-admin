/**
 * 跟进建议引擎隔离回归测试
 * 使用独立临时库（DB_PATH），不污染业务数据。
 * 覆盖：新线索久未联系 / 错过约定跟进 / 体验未报名 / 体验已报名仍停留 / 体验未关联成员 /
 *       已联系未推进 / 低意向久未跟进 / 成交·流失(非活跃) / 优先级排序 / onlyActionable 过滤。
 */
process.env.DB_PATH = `/tmp/ls_test_${Date.now()}.db`;
const fs = require('fs');
const path = require('path');
const dbPath = process.env.DB_PATH;
try { fs.unlinkSync(dbPath); } catch (e) { /* 不存在则忽略 */ }

require('../db');                 // 初始化基础表 + 跑迁移
require('../routes/growth');      // 副作用：创建 leads 表（含 stage_changed_at）
const db = require('../db');
db.pragma('foreign_keys = OFF'); // 最小种子，放宽外键便于构造场景
const { getLeadSuggestions, getLeadSuggestion } = require('../utils/lead-suggestions');

const DAY = 86400000;
const NOW = Date.now();

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.error('  ✗ FAIL: ' + msg); } };

function seedStudent(id, name) {
  db.prepare('INSERT OR IGNORE INTO students (id, name, created_at, updated_at, status) VALUES (?, ?, ?, ?, ?)')
    .run(id, name, NOW, NOW, 'active');
}
function seedLead(o) {
  db.prepare(`INSERT INTO leads (id, name, phone, source, stage, intent_level, next_follow_at, note, salesperson, student_id, converted_at, status, created_at, updated_at, stage_changed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(o.id, o.name, '13800000000', 'natural', o.stage, o.intentLevel == null ? 3 : o.intentLevel,
      o.nextFollowAt == null ? null : o.nextFollowAt, '', '销售A', o.studentId || '', null,
      o.status || 'active', o.createdAt, o.createdAt, o.stageChangedAt == null ? o.createdAt : o.stageChangedAt);
}
function seedMember(studentId, status) {
  db.prepare(`INSERT INTO member_cards (id, card_type_id, card_type_name, billing_mode, student_id, student_name, total_classes, remaining_classes, used_classes, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('MC_' + studentId, 'CT1', '标准卡', 'count', studentId, '成员' + studentId, 10, 8, 2, status, NOW, NOW);
}
function seedAttendance(studentId) {
  db.prepare(`INSERT INTO attendances (id, schedule_id, student_id, student_name, status, date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('ATT_' + studentId + '_' + Math.random().toString(36).slice(2), 'SCH1', studentId, '成员' + studentId, 'present', '2026-01-01', NOW, NOW);
}

// 清空并准备基础数据
db.exec("DELETE FROM attendances; DELETE FROM member_cards; DELETE FROM students; DELETE FROM leads;");

seedStudent('STU1', '体验未报名');
seedStudent('STU2', '体验已报名');
seedMember('STU2', 'active');
seedAttendance('STU1'); // STU1 有到课记录，但无会员卡

// 场景种子
seedLead({ id: 'L_NEW_STALE', name: '新线索久未联系', stage: 'new', createdAt: NOW - 3 * DAY, stageChangedAt: NOW - 3 * DAY });
seedLead({ id: 'L_OVERDUE', name: '错过约定跟进', stage: 'new', createdAt: NOW - 1 * DAY, stageChangedAt: NOW - 1 * DAY, nextFollowAt: NOW - 1 * DAY });
seedLead({ id: 'L_TRIAL_NODEAL', name: '体验未报名', stage: 'trial', createdAt: NOW - 10 * DAY, stageChangedAt: NOW - 4 * DAY, studentId: 'STU1' });
seedLead({ id: 'L_TRIAL_HAS_DEAL', name: '体验已报名', stage: 'trial', createdAt: NOW - 10 * DAY, stageChangedAt: NOW - 4 * DAY, studentId: 'STU2' });
seedLead({ id: 'L_TRIAL_UNLINKED', name: '体验未关联', stage: 'trial', createdAt: NOW - 10 * DAY, stageChangedAt: NOW - 4 * DAY, studentId: '' });
seedLead({ id: 'L_CONTACTED', name: '已联系未推进', stage: 'contacted', createdAt: NOW - 10 * DAY, stageChangedAt: NOW - 4 * DAY });
seedLead({ id: 'L_LOW_INTENT', name: '低意向久未跟', stage: 'contacted', createdAt: NOW - 10 * DAY, stageChangedAt: NOW - 2 * DAY, intentLevel: 1 });
seedLead({ id: 'L_NEW_FRESH', name: '新线索刚登记', stage: 'new', createdAt: NOW - 3600 * 1000, stageChangedAt: NOW - 3600 * 1000 });
seedLead({ id: 'L_DEAL', name: '已成交线索', stage: 'deal', createdAt: NOW - 20 * DAY, stageChangedAt: NOW - 15 * DAY, status: 'converted' });
seedLead({ id: 'L_LOST', name: '已流失线索', stage: 'lost', createdAt: NOW - 20 * DAY, stageChangedAt: NOW - 15 * DAY, status: 'lost' });

console.log('— 单条建议断言 —');
let s;

s = getLeadSuggestion(db, 'L_NEW_STALE');
ok(s && s.priority === 'normal', '新线索3天未联系 → normal');
ok(s && s.suggestedNextStage === 'contacted', '新线索 → 建议推进到 contacted');
ok(s && s.evidence.some((e) => e.type === 'new_stale'), '新线索 evidence 含 new_stale');

s = getLeadSuggestion(db, 'L_OVERDUE');
ok(s && s.priority === 'urgent', '错过约定跟进 → urgent');
ok(s && s.suggestedNextStage === null, '逾期无建议阶段（先联系）');
ok(s && s.evidence.some((e) => e.type === 'overdue_follow'), '逾期 evidence 含 overdue_follow');

s = getLeadSuggestion(db, 'L_TRIAL_NODEAL');
ok(s && s.priority === 'high', '体验4天未报名(有到课无会员卡) → high');
ok(s && s.suggestedNextStage === 'deal', '体验未报名 → 建议推进到 deal');
ok(s && s.evidence.some((e) => e.type === 'trial_no_membership'), '体验未报名 evidence 含 trial_no_membership');

s = getLeadSuggestion(db, 'L_TRIAL_HAS_DEAL');
ok(s && s.priority === 'normal', '体验阶段但有会员卡 → normal(数据不一致提醒)');
ok(s && s.evidence.some((e) => e.type === 'trial_has_membership'), 'evidence 含 trial_has_membership');

s = getLeadSuggestion(db, 'L_TRIAL_UNLINKED');
ok(s && s.priority === 'normal', '体验未关联成员 → normal');
ok(s && s.evidence.some((e) => e.type === 'trial_unlinked'), 'evidence 含 trial_unlinked');

s = getLeadSuggestion(db, 'L_CONTACTED');
ok(s && s.priority === 'normal', '已联系4天未推进 → normal');
ok(s && s.suggestedNextStage === 'trial', '已联系 → 建议推进到 trial');

s = getLeadSuggestion(db, 'L_LOW_INTENT');
ok(s && s.priority === 'low', '低意向(1星)+久未跟进(2天,未触发更强的) → low');
ok(s && s.evidence.some((e) => e.type === 'low_intent'), 'evidence 含 low_intent');

s = getLeadSuggestion(db, 'L_NEW_FRESH');
ok(s && s.priority === 'none', '新线索刚登记1小时 → none(暂不催促)');

s = getLeadSuggestion(db, 'L_DEAL');
ok(s && s.priority === 'none', '已成交 → none');
s = getLeadSuggestion(db, 'L_LOST');
ok(s && s.priority === 'none', '已流失 → none');
ok(getLeadSuggestion(db, 'NOPE') === null, '不存在线索 → null');

console.log('— 列表排序与过滤断言 —');
const full = getLeadSuggestions(db, { limit: 200, onlyActionable: false });
ok(full.length === 8, `活跃线索共 8 条（排除 deal/lost），实际 ${full.length}`);
ok(full[0].priority === 'urgent', '排序首位为 urgent（逾期）');
const idxHigh = full.findIndex((r) => r.id === 'L_TRIAL_NODEAL');
const idxNone = full.findIndex((r) => r.id === 'L_NEW_FRESH');
ok(idxHigh >= 0 && idxNone >= 0 && idxHigh < idxNone, 'high 优先级排在 none 之前');

const actionable = getLeadSuggestions(db, { limit: 200, onlyActionable: true });
ok(actionable.length === 7, `仅看需要跟进 = 7 条（排除 1 条 none）实际 ${actionable.length}`);
ok(actionable.every((r) => r.priority !== 'none'), 'onlyActionable 不含 none');

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
try { fs.unlinkSync(dbPath); } catch (e) {}
process.exit(fail ? 1 : 0);
