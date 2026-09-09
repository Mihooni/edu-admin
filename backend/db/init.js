/**
 * 数据库初始化 — 创建所有基础表
 * 接收已建立的 db 实例（避免与 db/index.js 形成循环依赖），
 * 在 runMigrations 之前调用，确保全新数据库也能直接启动（无需先手动 node db/init.js）。
 */
function init(db) {
  console.log('[DB] 开始初始化数据库...');

  // 用户表
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      openid TEXT UNIQUE,
      phone TEXT UNIQUE,
      nickname TEXT,
      avatar TEXT DEFAULT '',
      role TEXT NOT NULL DEFAULT 'parent',
      password TEXT,
      status TEXT DEFAULT 'active',
      created_at INTEGER,
      updated_at INTEGER
    );
  `);

  // 成员表
  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      gender TEXT,
      birthday TEXT,
      school TEXT,
      grade TEXT,
      hobby TEXT,
      level TEXT DEFAULT '',
      height REAL DEFAULT 0,
      weight REAL DEFAULT 0,
      bmi REAL DEFAULT 0,
      qr_code TEXT,
      remark TEXT,
      status TEXT DEFAULT 'active',
      join_date TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );
  `);

  // 家长-成员绑定表
  db.exec(`
    CREATE TABLE IF NOT EXISTS parent_bindings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      student_name TEXT,
      parent_name TEXT,
      parent_openid TEXT,
      parent_phone TEXT,
      relation TEXT,
      is_main INTEGER DEFAULT 0,
      created_at INTEGER,
      FOREIGN KEY (student_id) REFERENCES students(id)
    );
  `);

  // 教师表
  db.exec(`
    CREATE TABLE IF NOT EXISTS teachers (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      name TEXT NOT NULL,
      phone TEXT,
      gender TEXT,
      avatar TEXT DEFAULT '',
      specialty TEXT,
      bio TEXT,
      status TEXT DEFAULT 'active',
      hire_date TEXT,
      class_fee REAL DEFAULT 0,
      pay_rule TEXT,
      created_at INTEGER
    );
  `);

  // 场地表
  db.exec(`
    CREATE TABLE IF NOT EXISTS classrooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      capacity INTEGER,
      area INTEGER,
      equipment TEXT,
      location TEXT,
      status TEXT DEFAULT 'active',
      color TEXT,
      created_at INTEGER
    );
  `);

  // 活动表
  db.exec(`
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      description TEXT,
      duration INTEGER DEFAULT 90,
      consume_classes INTEGER DEFAULT 1,
      color TEXT,
      min_age INTEGER,
      max_age INTEGER,
      max_students INTEGER,
      price_per_class INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at INTEGER
    );
  `);

  // 排期记录表
  db.exec(`
    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      course_name TEXT,
      teacher_id TEXT,
      teacher_name TEXT,
      classroom_id TEXT,
      classroom_name TEXT,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      max_students INTEGER,
      enrolled_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'scheduled',
      is_recursive INTEGER DEFAULT 0,
      rule_id TEXT,
      remark TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      FOREIGN KEY (course_id) REFERENCES courses(id)
    );
  `);

  // 周期性排期规则表
  db.exec(`
    CREATE TABLE IF NOT EXISTS schedule_rules (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      teacher_id TEXT,
      classroom_id TEXT,
      week_day INTEGER,
      start_time TEXT,
      end_time TEXT,
      start_date TEXT,
      end_date TEXT,
      max_students INTEGER,
      repeat_type TEXT DEFAULT 'weekly',
      interval_days INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      created_at INTEGER
    );
  `);

  // 登记表
  db.exec(`
    CREATE TABLE IF NOT EXISTS enrollments (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      student_name TEXT,
      course_id TEXT NOT NULL,
      course_name TEXT,
      schedule_id TEXT,
      member_card_id TEXT,
      enroll_type TEXT DEFAULT 'schedule',
      status TEXT DEFAULT 'active',
      enrolled_at INTEGER,
      order_id TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      FOREIGN KEY (student_id) REFERENCES students(id),
      FOREIGN KEY (course_id) REFERENCES courses(id)
    );
  `);

  // 签到记录表
  db.exec(`
    CREATE TABLE IF NOT EXISTS attendances (
      id TEXT PRIMARY KEY,
      schedule_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      student_name TEXT,
      course_id TEXT,
      course_name TEXT,
      status TEXT NOT NULL,
      checkin_method TEXT,
      checkin_time INTEGER,
      checkin_by TEXT,
      consume_classes INTEGER DEFAULT 0,
      member_card_id TEXT,
      points_earned INTEGER DEFAULT 0,
      parent_notified_at INTEGER,
      date TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      FOREIGN KEY (schedule_id) REFERENCES schedules(id),
      FOREIGN KEY (student_id) REFERENCES students(id)
    );
  `);

  // 会员卡类型表
  db.exec(`
    CREATE TABLE IF NOT EXISTS membership_cards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      total_classes INTEGER NOT NULL,
      valid_days INTEGER NOT NULL,
      billing_mode TEXT DEFAULT 'time',
      points_reward INTEGER DEFAULT 0,
      price INTEGER DEFAULT 0,
      course_scope TEXT,
      transferable INTEGER DEFAULT 0,
      refundable INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      created_at INTEGER
    );
  `);

  // 会员卡实例表
  db.exec(`
    CREATE TABLE IF NOT EXISTS member_cards (
      id TEXT PRIMARY KEY,
      card_type_id TEXT NOT NULL,
      card_type_name TEXT,
      billing_mode TEXT DEFAULT 'time',
      student_id TEXT NOT NULL,
      student_name TEXT,
      total_classes INTEGER NOT NULL,
      remaining_classes INTEGER NOT NULL,
      used_classes INTEGER DEFAULT 0,
      activated_at INTEGER,
      expires_at INTEGER,
      status TEXT DEFAULT 'inactive',
      paused_at INTEGER DEFAULT 0,
      pause_total_ms INTEGER DEFAULT 0,
      pause_reason TEXT DEFAULT '',
      order_id TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      FOREIGN KEY (student_id) REFERENCES students(id)
    );
  `);

  // 扣课记录表（幂等）
  db.exec(`
    CREATE TABLE IF NOT EXISTS deduction_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      card_id TEXT,
      deducted_at INTEGER,
      UNIQUE(schedule_id, student_id)
    );
  `);

  // 积分账户表
  db.exec(`
    CREATE TABLE IF NOT EXISTS points (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL UNIQUE,
      student_name TEXT,
      total_earned INTEGER DEFAULT 0,
      total_consumed INTEGER DEFAULT 0,
      balance INTEGER DEFAULT 0,
      expire_at INTEGER,
      updated_at INTEGER,
      FOREIGN KEY (student_id) REFERENCES students(id)
    );
  `);

  // 积分流水表
  db.exec(`
    CREATE TABLE IF NOT EXISTS point_logs (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      balance INTEGER,
      reason TEXT,
      reference_id TEXT,
      description TEXT,
      created_at INTEGER,
      FOREIGN KEY (student_id) REFERENCES students(id)
    );
  `);

  // 订单表
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_no TEXT UNIQUE,
      user_id TEXT,
      student_id TEXT,
      student_name TEXT,
      order_type TEXT,
      items TEXT,
      total_amount INTEGER DEFAULT 0,
      discount_amount INTEGER DEFAULT 0,
      payable_amount INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      salesperson TEXT DEFAULT '',
      remark TEXT DEFAULT '',
      is_1v1 INTEGER DEFAULT 0,
      paid_at INTEGER,
      payment_id TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );
  `);

  // 支付记录表
  db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      order_no TEXT,
      user_id TEXT,
      amount INTEGER NOT NULL,
      channel TEXT DEFAULT 'wechat',
      transaction_id TEXT,
      status TEXT DEFAULT 'success',
      paid_at INTEGER,
      created_at INTEGER
    );
  `);

  // 消息推送记录表
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      student_id TEXT,
      template_id TEXT,
      title TEXT,
      content TEXT,
      channel TEXT DEFAULT 'inapp',
      status TEXT DEFAULT 'pending',
      priority TEXT DEFAULT 'normal',
      summary TEXT DEFAULT '',
      category TEXT DEFAULT 'system',
      is_broadcast INTEGER DEFAULT 0,
      group_name TEXT DEFAULT '',
      sent_at INTEGER,
      fail_reason TEXT,
      retry_count INTEGER DEFAULT 0,
      created_at INTEGER
    );
  `);

  // 请假申请表
  db.exec(`
    CREATE TABLE IF NOT EXISTS leave_requests (
      id TEXT PRIMARY KEY,
      student_id TEXT,
      student_name TEXT,
      schedule_id TEXT,
      course_name TEXT,
      date TEXT,
      start_time TEXT,
      reason TEXT,
      status TEXT DEFAULT 'pending',
      parent_openid TEXT,
      parent_phone TEXT,
      review_note TEXT DEFAULT '',
      created_at INTEGER,
      updated_at INTEGER
    );
  `);

  // 意见反馈表
  db.exec(`
    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      user_name TEXT,
      content TEXT,
      contact TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      created_at INTEGER,
      updated_at INTEGER
    );
  `);

  // 系统设置表
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      label TEXT,
      value TEXT,
      description TEXT,
      updated_at INTEGER
    );
  `);

  // 线索管理表（增长中心）
  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      source TEXT DEFAULT 'natural',
      stage TEXT DEFAULT 'new',
      intent_level INTEGER DEFAULT 3,
      next_follow_at INTEGER,
      note TEXT DEFAULT '',
      salesperson TEXT DEFAULT '',
      student_id TEXT DEFAULT '',
      converted_at INTEGER,
      status TEXT DEFAULT 'active',
      created_at INTEGER,
      updated_at INTEGER
    );
  `);

  // 通知已读记录表（广播通知按用户独立记录已读状态）
  db.exec(`
    CREATE TABLE IF NOT EXISTS notification_reads (
      notification_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      read_at INTEGER,
      PRIMARY KEY (notification_id, user_id)
    );
  `);

  // 创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_students_name ON students(name);
    CREATE INDEX IF NOT EXISTS idx_parent_bindings_student ON parent_bindings(student_id);
    CREATE INDEX IF NOT EXISTS idx_parent_bindings_openid ON parent_bindings(parent_openid);
    CREATE INDEX IF NOT EXISTS idx_schedules_date ON schedules(date);
    CREATE INDEX IF NOT EXISTS idx_schedules_teacher ON schedules(teacher_id);
    CREATE INDEX IF NOT EXISTS idx_attendances_schedule ON attendances(schedule_id);
    CREATE INDEX IF NOT EXISTS idx_attendances_student ON attendances(student_id);
    CREATE INDEX IF NOT EXISTS idx_attendances_date ON attendances(date);
    CREATE INDEX IF NOT EXISTS idx_member_cards_student ON member_cards(student_id);
    CREATE INDEX IF NOT EXISTS idx_member_cards_status ON member_cards(status);
    CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id);
    CREATE INDEX IF NOT EXISTS idx_point_logs_student ON point_logs(student_id);
    CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);
    CREATE INDEX IF NOT EXISTS idx_leave_requests_parent ON leave_requests(parent_openid);
    CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
    CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_notification_reads_user ON notification_reads(user_id);
    -- 复合索引：高频组合查询优化
    CREATE INDEX IF NOT EXISTS idx_schedules_date_status ON schedules(date, status);
    CREATE INDEX IF NOT EXISTS idx_member_cards_student_status ON member_cards(student_id, status);
    CREATE INDEX IF NOT EXISTS idx_attendances_student_date ON attendances(student_id, date);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  `);

  console.log('[DB] ✅ 数据库初始化完成！');
}

// 如果直接运行此文件（node db/init.js）：自行建立连接后初始化
// 注意：不可 require('./index')，否则会与 index.js 的 require('./init') 形成循环依赖，
// 导致 index.js 在半初始化状态下拿到空导出、报 "initDbSchema is not a function"。
// 这里直接基于 better-sqlite3 建库，彻底打破循环。
if (require.main === module) {
  const Database = require('better-sqlite3');
  const path = require('path');
  const fs = require('fs');
  const DB_PATH = process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.join(__dirname, 'data.db');
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  init(db);
  db.close();
}

module.exports = { init };
