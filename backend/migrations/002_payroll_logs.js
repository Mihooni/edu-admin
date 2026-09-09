/**
 * 迁移 002：创建薪资记录表（用于财务报表统计教师支出）
 */

function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS payroll_logs (
      id TEXT PRIMARY KEY,
      teacher_id TEXT NOT NULL,
      teacher_name TEXT,
      month TEXT NOT NULL,
      lesson_count INTEGER DEFAULT 0,
      amount REAL DEFAULT 0,
      rule_snapshot TEXT,
      status TEXT DEFAULT 'calculated',
      paid_at INTEGER,
      created_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_payroll_logs_teacher ON payroll_logs(teacher_id);
    CREATE INDEX IF NOT EXISTS idx_payroll_logs_month ON payroll_logs(month);
  `);
}

module.exports = { up };
