/**
 * 清理测试残留数据（排期/课程/通知），供数据卫生恢复使用
 */
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const db = require(process.cwd() + '/backend/db')

const scheds = db.prepare(`
  SELECT id FROM schedules
  WHERE course_name LIKE '%测试%' OR course_name LIKE '%剧本%' OR course_name LIKE '%扣课%'
     OR course_name LIKE '%多孩%' OR course_name LIKE 'E2E%' OR course_name LIKE '首页验证%'
`).all()
if (scheds.length) {
  const ph = scheds.map(() => '?').join(',')
  db.prepare('DELETE FROM enrollments WHERE schedule_id IN (' + ph + ')').run(...scheds.map((s) => s.id))
  db.prepare('DELETE FROM attendances WHERE schedule_id IN (' + ph + ')').run(...scheds.map((s) => s.id))
  db.prepare('DELETE FROM schedules WHERE id IN (' + ph + ')').run(...scheds.map((s) => s.id))
}

const courses = db.prepare(`
  SELECT id FROM courses
  WHERE name LIKE '%测试%' OR name LIKE 'E2E%' OR name LIKE '首页验证%'
     OR name LIKE '%剧本%' OR name LIKE '%扣课%' OR name LIKE '%多孩%'
`).all()
if (courses.length) {
  const ph = courses.map(() => '?').join(',')
  db.prepare('DELETE FROM courses WHERE id IN (' + ph + ')').run(...courses.map((c) => c.id))
}

const notices = db.prepare(`
  SELECT id FROM notifications
  WHERE title LIKE '%测试%' OR title LIKE 'E2E%' OR title LIKE '全检%'
`).all()
if (notices.length) {
  const ph = notices.map(() => '?').join(',')
  db.prepare('DELETE FROM notification_reads WHERE notification_id IN (' + ph + ')').run(...notices.map((n) => n.id))
  db.prepare('DELETE FROM notifications WHERE id IN (' + ph + ')').run(...notices.map((n) => n.id))
}

console.log(`清理完成：排期 ${scheds.length} / 课程 ${courses.length} / 通知 ${notices.length}`)
