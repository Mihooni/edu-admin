/**
 * 审计写入工具（轻量、失败不影响主流程）
 *
 * 设计要点：
 * - 自包含，不依赖 ../utils（避免与 utils/index.js 形成循环依赖：
 *   index.js 在导出前 require('./audit')，若 audit 又反向 require('./index')，
 *   会在 index 尚未导出 generateId/now 时拿到 undefined，导致审计写入失败）。
 * - 写入失败（如字段异常）一律吞掉并打日志，绝不阻断签到/报名等主业务。
 */
const crypto = require('crypto');

function recordAudit(db, { entity, entityId, action, actorId, actorRole, before, after }) {
  try {
    const beforeState = before == null ? null : (typeof before === 'string' ? before : JSON.stringify(before));
    const afterState = after == null ? null : (typeof after === 'string' ? after : JSON.stringify(after));
    const id = `AUD_${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`.toUpperCase();
    db.prepare(`
      INSERT INTO audit_log (id, entity, entity_id, action, actor_id, actor_role, before_state, after_state, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, entity, entityId || '', action, actorId || '', actorRole || '', beforeState, afterState, Date.now());
  } catch (e) {
    console.error('[audit] 写入失败（不影响业务）:', e && e.message);
  }
}

module.exports = { recordAudit };
