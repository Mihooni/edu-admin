/**
 * 004_student_class — 课程班级成员关联表
 *
 * 模型说明：「课程即班级」。courses 表复用为「课程班级」，
 * 通过 student_class 显式记录成员（学员）归属于哪一个课程(班级)。
 *
 * 排期的目标班级可见机制沿用 schedules.group_course_id / group_name
 * （已在 schedules.js 顶部轻量迁移中补齐），本迁移不再重复添加，
 * 以保持向后兼容：group_course_id 为空表示全员可见，非空表示仅该班级可见。
 */
function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS student_class (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at INTEGER NOT NULL,
      UNIQUE(student_id, class_id)
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_student_class_student ON student_class(student_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_student_class_class ON student_class(class_id);');
}

module.exports = { up };
