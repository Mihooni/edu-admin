/**
 * 006_class_module — 课程班级模块（会员分班管理）
 *
 * 设计原则：将「班级」从 courses 表中解耦为独立实体。
 *   - courses  = 课程/训练「目录」（教什么、单价、时长），是抽象的课种。
 *   - classes  = 实际的「授课分组」（如「2026 春季篮球 A 班」），有固定名册、教练、场地。
 *   - class_members = 学员(会员) 与 班级 的多对多归属（一个会员可加入多个班级）。
 *   - schedules.class_id  = 排期直接关联的班级；发布排期时挂在班级下，班级成员可见并可报名。
 *   - enrollments 增加报名「请求→审批」流（request_status）与班级来源留痕（class_id）。
 *
 * 既有的 student_class / schedules.group_course_id（旧「课程即班级」模型）保持不变，
 * 本迁移仅做增量扩展，保证向后兼容，不破坏旧数据与既有接口行为。
 */
function up(db) {
  // === 班级主表 ===
  db.exec(`
    CREATE TABLE IF NOT EXISTS classes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      course_id TEXT DEFAULT '',          -- 所属课程目录（classes 跟随哪一门课）
      coach_id TEXT DEFAULT '',          -- 班主任/主教练
      classroom_id TEXT DEFAULT '',      -- 固定教室
      description TEXT DEFAULT '',       -- 班级说明
      schedule_desc TEXT DEFAULT '',     -- 上课时间说明（如「每周三 18:00-19:00」）
      max_members INTEGER DEFAULT 0,     -- 班级容量上限（0=不限）
      status TEXT DEFAULT 'active',      -- active / graduated(结业) / archived(归档)
      created_at INTEGER,
      updated_at INTEGER
    );
  `);

  // === 班级成员（分班）===
  // class_id 指向 classes.id；student_id 指向 students.id。
  // 一个学员可同时归属多个班级（UNIQUE 仅约束「同一班级内不重复」）。
  db.exec(`
    CREATE TABLE IF NOT EXISTS class_members (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',  -- member / monitor(班长)
      joined_at INTEGER NOT NULL,
      UNIQUE(class_id, student_id),
      FOREIGN KEY (class_id) REFERENCES classes(id),
      FOREIGN KEY (student_id) REFERENCES students(id)
    );
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_class_members_class ON class_members(class_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_class_members_student ON class_members(student_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_classes_course ON classes(course_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_classes_status ON classes(status);');

  // === schedules 关联班级 ===
  try { db.prepare("ALTER TABLE schedules ADD COLUMN class_id TEXT DEFAULT ''").run(); } catch (e) { /* 已存在 */ }
  try { db.prepare("CREATE INDEX IF NOT EXISTS idx_schedules_class ON schedules(class_id)").run(); } catch (e) { /* 已存在 */ }

  // === enrollments 报名请求/审批流 + 班级来源 ===
  try { db.prepare("ALTER TABLE enrollments ADD COLUMN request_status TEXT DEFAULT ''").run(); } catch (e) { /* 已存在 */ }
  try { db.prepare("ALTER TABLE enrollments ADD COLUMN class_id TEXT DEFAULT ''").run(); } catch (e) { /* 已存在 */ }
  try { db.prepare("ALTER TABLE enrollments ADD COLUMN reviewed_by TEXT DEFAULT ''").run(); } catch (e) { /* 已存在 */ }
  try { db.prepare("ALTER TABLE enrollments ADD COLUMN reviewed_at INTEGER DEFAULT 0").run(); } catch (e) { /* 已存在 */ }
  try { db.prepare("CREATE INDEX IF NOT EXISTS idx_enrollments_request ON enrollments(request_status)").run(); } catch (e) { /* 已存在 */ }
  try { db.prepare("CREATE INDEX IF NOT EXISTS idx_enrollments_class ON enrollments(class_id)").run(); } catch (e) { /* 已存在 */ }
}

module.exports = { up };
