/**
 * 007_audit_log — 全量操作审计表
 *
 * 借鉴开源 CRM 的「证据不猜测（evidence over guessing）」原则：
 * 对签到、报名等关键写入做留痕，记录
 *   - 谁（actor_id + actor_role）在何时（created_at）
 *   - 对哪个实体（entity + entity_id）做了什么（action）
 *   - 变更前后的状态快照（before_state / after_state，JSON）
 *
 * 设计约束：
 *   - 纯增量扩展，不改动任何既有表/列，向后兼容。
 *   - 审计写入失败仅告警、绝不抛错中断主业务流程（由 recordAudit 内部 try/catch 保证）。
 *   - 不存储敏感明文；快照只放业务相关的少量字段。
 */
function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id          TEXT    PRIMARY KEY,
      entity      TEXT    NOT NULL,                -- attendance / enrollment / ...
      entity_id   TEXT    NOT NULL DEFAULT '',     -- 业务主键（如 scheduleId:studentId 或 enrollment id）
      action      TEXT    NOT NULL,                -- checkin / checkin_clear / enroll / enroll_cancel / enroll_request / enroll_approve / enroll_reject ...
      actor_id    TEXT    NOT NULL DEFAULT '',     -- 操作者 openid 或用户 id
      actor_role  TEXT    NOT NULL DEFAULT '',     -- admin / coach / sales / parent / system
      before_state TEXT,                           -- JSON，变更前快照（可为空）
      after_state  TEXT,                           -- JSON，变更后快照（可为空）
      created_at  INTEGER
    );
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity, entity_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);');
}

module.exports = { up };
