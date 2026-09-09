/**
 * 迁移 010：为 feedback 表补充机构回复字段
 *
 * 支持反馈闭环：管理员在 web 端回复家长反馈，家长小程序端「我的反馈」展示回复。
 * 小程序端前端条件渲染已在位（feedback.js 按 reply/reply_at 条件展示），此前因后端无
 * 字段与写路径记为产品待办。safeAddColumn 幂等补齐，保证空库/旧库均可升级。
 */

function safeAddColumn(db, table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function up(db) {
  safeAddColumn(db, 'feedback', 'reply', "TEXT DEFAULT ''");
  safeAddColumn(db, 'feedback', 'reply_at', 'INTEGER');
  safeAddColumn(db, 'feedback', 'replied_by', "TEXT DEFAULT ''");
}

module.exports = { up };
