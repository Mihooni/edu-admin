/**
 * 005_schedule_pricing — 排期课程补「课时数 + 单节价格」
 *
 * 领域模型（用户确认 2026-08-19）：
 *   - 班级（courses）仅用于打标签 / 分组，不承载课时与价格。
 *   - 课时与价格属于排期课程（schedules）。
 *
 * 新增列：
 *   schedules.class_count      INTEGER DEFAULT 1 —— 本次排课消耗的课时数（默认 1）
 *   schedules.price_per_class  INTEGER DEFAULT 0 —— 单节价格（元）
 *
 * 幂等：各 ALTER 独立 try/catch，列已存在则跳过，避免单条重复列错误
 *       中断同文件内其余列的添加（迁移运行器对整段 up() 做事务包裹）。
 */
function up(db) {
  const add = (sql) => {
    try {
      db.exec(sql);
    } catch (e) {
      if (!/duplicate column name/i.test(e.message || '')) throw e;
    }
  };
  add("ALTER TABLE schedules ADD COLUMN class_count INTEGER DEFAULT 1");
  add("ALTER TABLE schedules ADD COLUMN price_per_class INTEGER DEFAULT 0");
}

module.exports = { up };
