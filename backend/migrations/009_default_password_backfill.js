/**
 * 009_default_password_backfill — 一次性回填管理员/教练默认密码
 *
 * 原先该回填逻辑位于 db/index.js 每次启动都执行，重启会重复触碰这些行。
 * 迁移系统保证本文件只执行一次，此后新账号由 routes 创建逻辑保证有密码。
 */
function up(db) {
  const { hashPassword } = require('../utils');
  const DEFAULT_HASH = hashPassword('123456');

  const rows = db.prepare(
    "SELECT id FROM users WHERE role IN ('admin','coach') AND (password IS NULL OR password = '')"
  ).all();

  if (rows.length > 0) {
    const upd = db.prepare("UPDATE users SET password = ? WHERE id = ?");
    for (const row of rows) upd.run(DEFAULT_HASH, row.id);
    console.log(`[DB] 迁移：已为 ${rows.length} 个管理员/教练账号回填默认密码`);
  }
}

module.exports = { up };
