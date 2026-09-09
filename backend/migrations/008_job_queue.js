/**
 * 008_job_queue — 异步任务队列（借鉴 CRM 的 FOR UPDATE SKIP LOCKED 租约防重复处理）
 *
 * 承载：训练提醒 / 低课时提醒 / 续费提醒 / 生日提醒 等定时发送，
 * 替代原先散落在 server.js 的多个 setInterval 直连执行，解决：
 *   - 多实例 / 重启重叠导致重复发送（无协调）
 *   - worker 崩溃丢任务（无租约回收）
 *   - 失败无重试（一次性执行）
 *
 * 设计约束：
 *   - 纯增量扩展，不改动任何既有表/列，向后兼容。
 *   - 任务仅被一个 worker 原子认领（claimJobs 在单事务内 SELECT+UPDATE，等价 SKIP LOCKED）。
 *   - 处理中持租约（claimed_at + lease_ms），租约到期可被回收重投，防 worker 崩溃丢任务。
 *   - 失败按 max_attempts 退避后转 failed，绝不死循环。
 */
function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id           TEXT    PRIMARY KEY,
      type         TEXT    NOT NULL,
      payload      TEXT,                       -- JSON，业务参数
      status       TEXT    NOT NULL DEFAULT 'pending',  -- pending | processing | done | failed
      priority     INTEGER NOT NULL DEFAULT 0,
      attempts     INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      due_at       INTEGER NOT NULL,           -- 最早可执行时间（ms）
      claimed_at   INTEGER,                    -- 租约开始时间（ms）
      lease_ms     INTEGER NOT NULL DEFAULT 60000,
      last_error   TEXT,
      result       TEXT,                       -- JSON
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL
    );
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_status_due ON jobs(status, due_at);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);');
}

module.exports = { up };
