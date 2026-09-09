/**
 * 迁移 003：为 students 表补充 avatar 列
 *
 * 原 students 详情接口（GET /api/students/:id）及部分列表查询会 SELECT avatar，
 * 但 init.js 的建表语句与历史迁移均未创建该列，导致全新数据库（npm start 空库）
 * 首次查看成员详情时抛出 SqliteError: no such column: avatar（HTTP 500）。
 * 这里用 safeAddColumn 幂等补齐，保证空库也能正常查看成员详情。
 */

function safeAddColumn(db, table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function up(db) {
  safeAddColumn(db, 'students', 'avatar', "TEXT DEFAULT ''");
}

module.exports = { up };
