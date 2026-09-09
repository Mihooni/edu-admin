/**
 * 线索「证据→建议」引擎（业务层，单一真相源）
 *
 * 设计原则（见 DESIGN-v3 §7）：
 *  - 智能逻辑在业务层而非路由层：本文件是跟进建议的唯一计算来源，路由只负责鉴权与返回。
 *  - 证据不猜测（借鉴 trycompai/crm）：每条建议都必须由「已观测事实」支撑，写入 evidence 列表；
 *    无法观测的状态（如未关联成员时是否报名未知）只给弱信号，绝不臆断。
 *  - 派生状态不落库、不重复实现：建议由 leads + member_cards + attendances 实时计算，前端只读 API。
 *
 * 不依赖 utils/index，避免循环依赖（参照 audit.js / queue.js 的教训）。
 */

const DAY = 86400000;

// 阶段中文（与 routes/growth.js 的 STAGE_TEXT 保持一致）
const STAGE_TEXT = {
  new: '新线索',
  contacted: '已联系',
  trial: '体验中',
  deal: '已成交',
  lost: '已流失',
};

// 优先级权重（用于排序）
const PRIORITY_WEIGHT = { urgent: 4, high: 3, normal: 2, low: 1, none: 0 };

// 阈值（天）
const NEW_STALE_DAYS = 2; // 新线索登记超过 N 天未联系
const CONTACTED_STALE_DAYS = 3; // 已联系超过 N 天未推进
const TRIAL_STALE_DAYS = 3; // 体验中超过 N 天
const LOW_INTENT = 2; // 意向度 <= N 视为低意向

function daysBetween(fromTs, toTs) {
  if (!fromTs) return null;
  return Math.floor((toTs - fromTs) / DAY);
}

/**
 * 富集线索关联成员的观测事实。
 * 无关联成员时返回 null（表示无法观测其报名/到课状态）。
 */
function enrichLead(db, lead) {
  const sid = lead.student_id || '';
  if (!sid) return null;
  const m = db.prepare("SELECT COUNT(*) AS c FROM member_cards WHERE student_id = ? AND status IN ('active','paused')").get(sid);
  const a = db.prepare('SELECT COUNT(*) AS c FROM attendances WHERE student_id = ?').get(sid);
  const o = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE student_id = ? AND status = 'paid'").get(sid);
  return {
    hasActiveMembership: !!(m && m.c > 0),
    trialAttended: a ? a.c : 0,
    hasOrder: !!(o && o.c > 0),
  };
}

/**
 * 纯函数：根据线索行 + 富集上下文 + 当前时间，计算「证据→建议」。
 * 返回 { priority, suggestedAction, evidence[], suggestedNextStage }。
 * 调用方负责拼装给前端用的线索快照字段。
 */
function computeSuggestion({ lead, studentCtx, now }) {
  const stage = lead.stage;
  const intent = lead.intent_level || 3;
  const stageRef = lead.stage_changed_at ? lead.stage_changed_at : (lead.created_at || now);
  const stageDays = Math.max(0, daysBetween(stageRef, now) || 0);
  const createdDays = daysBetween(lead.created_at, now);
  const overdue = lead.next_follow_at && lead.next_follow_at < now;
  const overdueDays = overdue ? (daysBetween(lead.next_follow_at, now) || 0) : 0;

  const evidence = [];
  evidence.push({ type: 'stage_age', label: `停留「${STAGE_TEXT[stage] || stage}」${stageDays} 天` });
  evidence.push({ type: 'intent', label: `意向度 ${intent} 星` });
  if (overdue) evidence.push({ type: 'overdue_follow', label: `已错过约定跟进 ${overdueDays} 天` });

  let priority = 'none';
  let suggestedAction = '按当前计划跟进即可';
  let suggestedNextStage = null;

  if (overdue) {
    priority = 'urgent';
    suggestedAction = '已错过约定跟进时间，请立即联系并重新约定下次时间';
  } else if (stage === 'trial') {
    if (stageDays >= TRIAL_STALE_DAYS) {
      if (studentCtx && !studentCtx.hasActiveMembership) {
        priority = stageDays >= 7 ? 'urgent' : 'high';
        evidence.push({ type: 'trial_no_membership', label: `体验中 ${stageDays} 天，无有效会员卡` });
        if (studentCtx.trialAttended === 0) evidence.push({ type: 'no_trial_attendance', label: '无到课记录，是否实际到店待确认' });
        suggestedAction = '体验已有一段时间仍未报名，建议给出限时优惠并尽快逼单转化';
        suggestedNextStage = 'deal';
      } else if (!studentCtx) {
        priority = 'normal';
        evidence.push({ type: 'trial_unlinked', label: `体验中 ${stageDays} 天，未关联成员、报名状态未知` });
        suggestedAction = '体验阶段久未推进且未关联成员，建议确认是否到店/报名并更新跟进';
        suggestedNextStage = 'deal';
      } else if (studentCtx.hasActiveMembership) {
        priority = 'normal';
        evidence.push({ type: 'trial_has_membership', label: '已有关联会员卡，但阶段仍停留在体验中' });
        suggestedAction = '该线索已报名（有关联会员卡），建议将阶段推进到「已成交」';
        suggestedNextStage = 'deal';
      }
    }
  } else if (stage === 'new') {
    if (createdDays != null && createdDays >= NEW_STALE_DAYS) {
      priority = 'normal';
      evidence.push({ type: 'new_stale', label: `已登记 ${createdDays} 天未联系` });
      suggestedAction = '新线索久未触达，建议尽快首次电话/微信联系并邀约到店';
      suggestedNextStage = 'contacted';
    }
  } else if (stage === 'contacted') {
    if (stageDays >= CONTACTED_STALE_DAYS) {
      priority = 'normal';
      evidence.push({ type: 'contacted_stale', label: `已联系 ${stageDays} 天未推进` });
      suggestedAction = '已建立联系但未推进，建议邀约到店/线上体验，推进到体验阶段';
      suggestedNextStage = 'trial';
    }
  } else if (stage === 'deal') {
    priority = 'none';
    suggestedAction = '线索已成交，建议安排入班并启动老带新转介绍';
  } else if (stage === 'lost') {
    priority = 'none';
    suggestedAction = '线索已流失，必要时可尝试挽回';
  }

  // 低意向且久未跟进（弱信号，仅在没有更强建议时补充）
  if (priority === 'none' && intent <= LOW_INTENT && ((createdDays != null && createdDays >= 7) || stageDays >= 7)) {
    priority = 'low';
    evidence.push({ type: 'low_intent', label: `意向度偏低（${intent} 星）且久未跟进` });
    suggestedAction = '意向度低且长期未推进，建议评估是否继续投入或重新激活';
  }

  return { priority, suggestedAction, evidence, suggestedNextStage, stageDays, createdDays };
}

function snapshot(lead, s) {
  return {
    id: lead.id,
    name: lead.name,
    phone: lead.phone || '',
    stage: lead.stage,
    stageText: STAGE_TEXT[lead.stage] || lead.stage,
    intentLevel: lead.intent_level || 3,
    salesperson: lead.salesperson || '',
    source: lead.source || 'natural',
    studentId: lead.student_id || '',
    nextFollowAt: lead.next_follow_at || null,
    priority: s.priority,
    suggestedAction: s.suggestedAction,
    evidence: s.evidence,
    suggestedNextStage: s.suggestedNextStage,
    stageDays: s.stageDays,
  };
}

/**
 * 获取单条线索的跟进建议。
 */
function getLeadSuggestion(db, leadId) {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId);
  if (!lead) return null;
  const studentCtx = enrichLead(db, lead);
  const s = computeSuggestion({ lead, studentCtx, now: Date.now() });
  return snapshot(lead, s);
}

/**
 * 获取全部活跃线索的跟进建议，按优先级权重降序、停留时长降序、登记时间升序排序。
 * @param {object} opts
 * @param {number} [opts.limit=50] 返回条数上限
 * @param {boolean} [opts.onlyActionable=false] 仅返回 priority !== 'none'
 */
function getLeadSuggestions(db, { limit = 50, onlyActionable = false } = {}) {
  const leads = db.prepare("SELECT * FROM leads WHERE status = 'active' ORDER BY updated_at DESC").all();
  const now = Date.now();
  let rows = leads.map((lead) => {
    const studentCtx = enrichLead(db, lead);
    const s = computeSuggestion({ lead, studentCtx, now });
    return snapshot(lead, s);
  });
  if (onlyActionable) rows = rows.filter((r) => r.priority !== 'none');
  rows.sort(
    (a, b) =>
      (PRIORITY_WEIGHT[b.priority] || 0) - (PRIORITY_WEIGHT[a.priority] || 0) ||
      (b.stageDays || 0) - (a.stageDays || 0) ||
      (a.created_at || 0) - (b.created_at || 0)
  );
  return rows.slice(0, limit);
}

module.exports = {
  STAGE_TEXT,
  PRIORITY_WEIGHT,
  enrichLead,
  computeSuggestion,
  getLeadSuggestion,
  getLeadSuggestions,
};
