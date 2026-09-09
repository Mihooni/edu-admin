/**
 * 薪资/课时费路由
 *
 * GET  /api/payroll/coaches?month=YYYY-MM   — 管理员：全部教练当月结算汇总
 * GET  /api/payroll/coach/:id?month=YYYY-MM — 管理员/本人：某教练逐节薪资明细
 * PUT  /api/payroll/coach/:id/rule          — 管理员：保存教练薪资规则
 * GET  /api/payroll/me?month=YYYY-MM        — 教练本人：我的薪资规则与当月预估
 */
const express = require('express');
const router = express.Router();
const db = require('../db');
const { generateId, success, fail, safeFail, getOpenId, now } = require('../utils');
const {
  DEFAULT_RULE,
  normalizeRule,
  calcLessonPay,
  ruleSummary,
  calcText,
} = require('../utils/payroll');

// 兼容旧库：确保 teachers 表存在 pay_rule 列
try {
  db.prepare("ALTER TABLE teachers ADD COLUMN pay_rule TEXT").run();
} catch (e) { /* 已存在 */ }

function isAdmin(req) {
  if (req.userRole === 'admin') return true;
  const openid = getOpenId(req);
  if (!openid) return false;
  const u = db.prepare('SELECT role FROM users WHERE openid = ?').get(openid);
  return !!(u && u.role === 'admin');
}

/**
 * 读取教练薪资规则；未配置时回退旧 class_fee 字段
 */
function getPayRule(teacher) {
  if (teacher.pay_rule) {
    try {
      return normalizeRule(JSON.parse(teacher.pay_rule));
    } catch (e) { /* 解析失败走回退 */ }
  }
  return normalizeRule({ ...DEFAULT_RULE, baseRate: Number(teacher.class_fee) || 0 });
}

/**
 * 教练在日期范围内的逐节明细（含薪资计算）
 */
function lessonRows(teacherId, startDate, endDate) {
  const teacher = db.prepare("SELECT * FROM teachers WHERE id = ?").get(teacherId);
  if (!teacher) return null;
  const rule = getPayRule(teacher);
  const list = db.prepare(`
    SELECT s.id, s.date, s.course_name, s.start_time, s.end_time, s.status,
      s.enrolled_count, s.classroom_name,
      (SELECT COUNT(*) FROM attendances a
        WHERE a.schedule_id = s.id AND a.status IN ('present','late')) AS attended
    FROM schedules s
    WHERE s.teacher_id = ? AND s.status != 'cancelled' AND s.date >= ? AND s.date <= ?
    ORDER BY s.date ASC, s.start_time ASC
  `).all(teacherId, startDate, endDate);

  const rows = list.map((r) => {
    const attended = r.attended || 0;
    return {
      id: r.id,
      date: r.date,
      courseName: r.course_name || '',
      startTime: r.start_time || '',
      endTime: r.end_time || '',
      status: r.status || 'scheduled',
      classroomName: r.classroom_name || '',
      enrolledCount: r.enrolled_count || 0,
      attended,
      calcText: calcText(rule, attended),
      lessonAmount: calcLessonPay(rule, attended),
    };
  });

  const totals = rows.reduce(
    (acc, r) => {
      acc.classes += 1;
      acc.students += r.attended;
      acc.amount += r.lessonAmount;
      return acc;
    },
    { classes: 0, students: 0, amount: 0 }
  );

  return {
    teacher: { id: teacher.id, name: teacher.name, phone: teacher.phone || '' },
    rule,
    summary: ruleSummary(rule),
    rows,
    totals,
  };
}

function monthRange(month) {
  if (!/^\d{4}-\d{2}$/.test(month || '')) return null;
  const [y, m] = month.split('-').map(Number);
  if (m < 1 || m > 12) return null;
  const start = `${month}-01`;
  const end = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  return { startDate: start, endDate: end };
}

/**
 * GET /api/payroll/coaches?month=YYYY-MM — 全部教练当月结算汇总
 */
router.get('/coaches', (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json(safeFail('仅管理员可查看薪资结算'));
    const range = monthRange(req.query.month);
    if (!range) return res.json(fail('月份格式应为 YYYY-MM'));
    const { startDate, endDate } = range;
    const teachers = db.prepare("SELECT * FROM teachers ORDER BY status, name").all();
    const list = teachers.map((t) => {
      const rule = getPayRule(t);
      const rows = lessonRows(t.id, startDate, endDate);
      return {
        teacherId: t.id,
        name: t.name,
        phone: t.phone || '',
        status: t.status || 'active',
        payRule: rule,
        ruleSummary: ruleSummary(rule),
        classes: rows ? rows.totals.classes : 0,
        students: rows ? rows.totals.students : 0,
        amount: rows ? rows.totals.amount : 0,
      };
    });
    res.json(success({ list, month: req.query.month, startDate, endDate }));
  } catch (err) {
    console.error('[payroll coaches]', err);
    res.status(500).json(safeFail('获取薪资结算失败'));
  }
});

/**
 * GET /api/payroll/coach/:id?month=YYYY-MM — 某教练逐节薪资明细
 */
router.get('/coach/:id', (req, res) => {
  try {
    const range = monthRange(req.query.month);
    if (!range) return res.json(fail('月份格式应为 YYYY-MM'));
    const teacher = db.prepare("SELECT * FROM teachers WHERE id = ?").get(req.params.id);
    if (!teacher) return res.json(fail('教练不存在'));

    // 权限：管理员 或 教练本人
    if (!isAdmin(req)) {
      const openid = getOpenId(req);
      const u = openid ? db.prepare('SELECT phone, role FROM users WHERE openid = ?').get(openid) : null;
      const mine = u && u.role === 'coach' && u.phone && u.phone === teacher.phone;
      if (!mine) return res.status(403).json(safeFail('无权查看该教练薪资明细'));
    }

    const data = lessonRows(req.params.id, range.startDate, range.endDate);
    if (!data) return res.json(fail('教练不存在'));
    res.json(success({ ...data, month: req.query.month, startDate: range.startDate, endDate: range.endDate }));
  } catch (err) {
    console.error('[payroll coach detail]', err);
    res.status(500).json(safeFail('获取薪资明细失败'));
  }
});

/**
 * PUT /api/payroll/coach/:id/rule — 保存教练薪资规则
 * Body: { payRule }
 */
router.put('/coach/:id/rule', (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json(safeFail('仅管理员可设置薪资规则'));
    const teacher = db.prepare("SELECT id, name FROM teachers WHERE id = ?").get(req.params.id);
    if (!teacher) return res.json(fail('教练不存在'));
    const rule = normalizeRule(req.body.payRule);
    db.prepare("UPDATE teachers SET pay_rule = ? WHERE id = ?")
      .run(JSON.stringify(rule), req.params.id);
    res.json(success({ payRule: rule, summary: ruleSummary(rule) }));
  } catch (err) {
    console.error('[payroll rule save]', err);
    res.status(500).json(safeFail('保存薪资规则失败'));
  }
});

/**
 * GET /api/payroll/me?month=YYYY-MM — 教练本人薪资规则与当月预估
 */
router.get('/me', (req, res) => {
  try {
    const openid = getOpenId(req);
    if (!openid) return res.status(401).json(safeFail('未登录'));
    const u = db.prepare('SELECT phone, role FROM users WHERE openid = ?').get(openid);
    if (!u || u.role !== 'coach') return res.status(403).json(safeFail('仅教练可查看本人薪资'));
    if (!u.phone) return res.json(fail('账号未绑定手机号'));
    const teacher = db.prepare("SELECT * FROM teachers WHERE phone = ?").get(u.phone);
    if (!teacher) return res.json(fail('尚未配置教练档案'));
    const month = /^\d{4}-\d{2}$/.test(req.query.month || '')
      ? req.query.month
      : new Date().toISOString().slice(0, 7);
    const range = monthRange(month);
    const data = lessonRows(teacher.id, range.startDate, range.endDate);
    res.json(success({ ...data, month }));
  } catch (err) {
    console.error('[payroll me]', err);
    res.status(500).json(safeFail('获取薪资信息失败'));
  }
});

module.exports = router;
