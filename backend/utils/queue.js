/**
 * 异步任务队列核心（SQLite 版 SKIP LOCKED 租约模式）
 *
 * 借鉴 trycompai/crm 的 claimDue 租约行防重复处理：
 *   - 任务只被一个 worker 原子认领（claimJobs 在单事务内 SELECT 候选 + UPDATE 为 processing，
 *     等价于 Postgres 的 FOR UPDATE SKIP LOCKED，并发下不会重复认领同一行）。
 *   - 处理中任务持租约（claimed_at + lease_ms），租约到期可被回收重投，防止 worker 崩溃丢任务。
 *   - 失败按 max_attempts 退避后转 failed，绝不死循环。
 *
 * 本模块完全自包含（自带 id/时间），不反向依赖 utils/index，避免循环依赖（参照 audit.js 教训）。
 */
const crypto = require('crypto');

function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`.toUpperCase();
}

/**
 * 投递一个任务
 * @returns {string} 任务 id
 */
function enqueue(db, { type, payload, dueAt, priority = 0, maxAttempts = 3, leaseMs = 60000 }) {
  const now = Date.now();
  const id = genId('JOB');
  db.prepare(`
    INSERT INTO jobs (id, type, payload, status, priority, attempts, max_attempts, due_at, lease_ms, created_at, updated_at)
    VALUES (?, ?, ?, 'pending', ?, 0, ?, ?, ?, ?, ?)
  `).run(
    id,
    type,
    payload == null ? null : JSON.stringify(payload),
    priority,
    maxAttempts,
    dueAt == null ? now : dueAt,
    leaseMs,
    now,
    now
  );
  return id;
}

// 原子认领一批：单事务内 SELECT 候选 + UPDATE 为 processing，等价于 SKIP LOCKED（并发下不会重复认领同一行）
function buildClaimTx(db) {
  return db.transaction((now, leaseMs, limit) => {
    const rows = db.prepare(`
      SELECT id FROM jobs
      WHERE status = 'pending' AND due_at <= ?
      ORDER BY priority DESC, due_at ASC, id ASC
      LIMIT ?
    `).all(now, limit);
    if (!rows.length) return [];
    const upd = db.prepare(`
      UPDATE jobs SET status = 'processing', claimed_at = ?, lease_ms = ?, attempts = attempts + 1, updated_at = ?
      WHERE id = ?
    `);
    for (const r of rows) upd.run(now, leaseMs, now, r.id);
    const sel = db.prepare(`SELECT * FROM jobs WHERE id IN (${rows.map(() => '?').join(',')})`);
    return sel.all(...rows.map((r) => r.id));
  });
}

/**
 * 原子认领一批到期且 pending 的任务（等价 SKIP LOCKED）
 * @returns {Array} 被认领的任务行
 */
function claimJobs(db, { limit = 5, now = Date.now(), leaseMs = 60000 } = {}) {
  return buildClaimTx(db)(now, leaseMs, limit);
}

function completeJob(db, id, result) {
  db.prepare(`
    UPDATE jobs SET status = 'done', result = ?, claimed_at = NULL, updated_at = ?
    WHERE id = ?
  `).run(result == null ? null : JSON.stringify(result), Date.now(), id);
}

/**
 * 标记任务失败并按退避重投（attempts < max_attempts）或转 failed
 */
function failJob(db, id, error, { now = Date.now(), backoffMs = 60000 } = {}) {
  const job = db.prepare('SELECT attempts, max_attempts FROM jobs WHERE id = ?').get(id);
  if (!job) return;
  const msg = error && error.message ? error.message : String(error);
  if (job.attempts < job.max_attempts) {
    db.prepare(`
      UPDATE jobs SET status = 'pending', last_error = ?, claimed_at = NULL, due_at = ?, updated_at = ?
      WHERE id = ?
    `).run(msg, now + backoffMs, now, id);
  } else {
    db.prepare(`
      UPDATE jobs SET status = 'failed', last_error = ?, claimed_at = NULL, updated_at = ?
      WHERE id = ?
    `).run(msg, now, id);
  }
}

/**
 * 回收租约过期的任务（worker 崩溃保护）：processing 且 claimed_at + lease_ms < now 的任务回到 pending
 * @returns {number} 回收数量
 */
function reclaimExpired(db, now = Date.now()) {
  return db.prepare(`
    UPDATE jobs SET status = 'pending', claimed_at = NULL, updated_at = ?
    WHERE status = 'processing' AND claimed_at IS NOT NULL AND claimed_at + lease_ms < ?
  `).run(now, now).changes;
}

function getJob(db, id) {
  return db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
}

function listJobs(db, { status, type, limit = 50 } = {}) {
  const where = [];
  const params = [];
  if (status) { where.push('status = ?'); params.push(status); }
  if (type) { where.push('type = ?'); params.push(type); }
  const sql = `SELECT * FROM jobs ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT ?`;
  return db.prepare(sql).all(...params, limit);
}

module.exports = {
  enqueue,
  claimJobs,
  completeJob,
  failJob,
  reclaimExpired,
  getJob,
  listJobs,
  genId,
};
