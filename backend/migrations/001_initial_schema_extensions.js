/**
 * 迁移 001：整合所有历史 try/catch ALTER 迁移
 * 将散落在各路由文件中的列扩展统一管理
 */

function safeAddColumn(db, table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function safeCreateTable(db, name, sql) {
  const exists = db.prepare(
    "SELECT count(*) as cnt FROM sqlite_master WHERE type='table' AND name=?"
  ).get(name);
  if (!exists || exists.cnt === 0) {
    db.exec(sql);
  }
}

function up(db) {
  // === users 表扩展 ===
  safeAddColumn(db, 'users', 'password', 'TEXT');
  safeAddColumn(db, 'users', 'alias', "TEXT DEFAULT ''");
  safeAddColumn(db, 'users', 'permissions', "TEXT DEFAULT ''");

  // === students 表扩展 ===
  safeAddColumn(db, 'students', 'level', "TEXT DEFAULT ''");
  safeAddColumn(db, 'students', 'member_no', "TEXT DEFAULT ''");
  safeAddColumn(db, 'students', 'archived', 'INTEGER DEFAULT 0');

  // === teachers 表扩展 ===
  safeAddColumn(db, 'teachers', 'alias', "TEXT DEFAULT ''");
  safeAddColumn(db, 'teachers', 'class_fee', 'REAL DEFAULT 0');
  safeAddColumn(db, 'teachers', 'pay_rule', 'TEXT');

  // === courses 表扩展 ===
  safeAddColumn(db, 'courses', 'archived', 'INTEGER DEFAULT 0');

  // === schedules 表扩展 ===
  safeAddColumn(db, 'schedules', 'group_course_id', "TEXT DEFAULT ''");
  safeAddColumn(db, 'schedules', 'group_name', "TEXT DEFAULT ''");

  // === schedule_rules 表扩展 ===
  safeAddColumn(db, 'schedule_rules', 'repeat_type', "TEXT DEFAULT 'weekly'");
  safeAddColumn(db, 'schedule_rules', 'interval_days', 'INTEGER DEFAULT 1');
  safeAddColumn(db, 'schedule_rules', 'group_course_id', "TEXT DEFAULT ''");
  safeAddColumn(db, 'schedule_rules', 'group_name', "TEXT DEFAULT ''");

  // === enrollments 表扩展 ===
  safeAddColumn(db, 'enrollments', 'created_by', "TEXT DEFAULT ''");

  // === orders 表扩展 ===
  safeAddColumn(db, 'orders', 'refunded_amount', 'REAL DEFAULT 0');
  safeAddColumn(db, 'orders', 'salesperson', "TEXT DEFAULT ''");
  safeAddColumn(db, 'orders', 'remark', "TEXT DEFAULT ''");
  safeAddColumn(db, 'orders', 'is_1v1', 'INTEGER DEFAULT 0');

  // === notifications 表扩展 ===
  safeAddColumn(db, 'notifications', 'priority', "TEXT DEFAULT 'normal'");
  safeAddColumn(db, 'notifications', 'summary', "TEXT DEFAULT ''");
  safeAddColumn(db, 'notifications', 'category', "TEXT DEFAULT 'system'");
  safeAddColumn(db, 'notifications', 'is_broadcast', 'INTEGER DEFAULT 0');
  safeAddColumn(db, 'notifications', 'group_name', "TEXT DEFAULT ''");
  safeAddColumn(db, 'notifications', 'fail_reason', 'TEXT');
  safeAddColumn(db, 'notifications', 'retry_count', 'INTEGER DEFAULT 0');

  // === member_cards 表扩展 ===
  safeAddColumn(db, 'member_cards', 'paused_at', 'INTEGER DEFAULT 0');
  safeAddColumn(db, 'member_cards', 'pause_total_ms', 'INTEGER DEFAULT 0');
  safeAddColumn(db, 'member_cards', 'pause_reason', "TEXT DEFAULT ''");
  safeAddColumn(db, 'member_cards', 'billing_mode', "TEXT DEFAULT 'time'");

  // === membership_cards 表扩展 ===
  safeAddColumn(db, 'membership_cards', 'billing_mode', "TEXT DEFAULT 'time'");
  safeAddColumn(db, 'membership_cards', 'points_reward', 'INTEGER DEFAULT 0');
  safeAddColumn(db, 'membership_cards', 'product_type', "TEXT DEFAULT 'membership'");
  safeAddColumn(db, 'membership_cards', 'unit', "TEXT DEFAULT ''");
  safeAddColumn(db, 'membership_cards', 'description', "TEXT DEFAULT ''");

  // === 补充索引 ===
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_orders_student ON orders(student_id, status);
    CREATE INDEX IF NOT EXISTS idx_leave_parent ON leave_requests(parent_openid, status);
    CREATE INDEX IF NOT EXISTS idx_leave_student_schedule ON leave_requests(student_id, schedule_id);
  `);

  // === 补充表（历史路由文件中创建的） ===
  safeCreateTable(db, 'notification_reads', `
    CREATE TABLE notification_reads (
      notification_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      read_at INTEGER,
      PRIMARY KEY (notification_id, user_id)
    );
  `);
}

module.exports = { up };
