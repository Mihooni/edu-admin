/**
 * 机构称呼（术语）方案
 * ------------------------------------------------------------
 * 不同机构对外表述不同：教培机构称「老师 / 学员 / 课程 / 签到」，
 * 健身/俱乐部机构为规避“教培”标签称「教练 / 会员 / 训练 / 打卡」。
 * 本模块提供统一的「概念键 → 显示词」映射，供前端页面、家长小程序、
 * 以及后端发送给家长的微信通知共用，确保全端称呼一致、不混乱。
 *
 * 机构可在管理端「称呼设置」中选择预设方案（教培版 / 健身版），
 * 并可在预设基础上对单个概念做自定义微调（term_overrides）。
 */

// 可配置的概念键（管理端设置页按此列表渲染微调输入框）
const CONCEPTS = [
  { key: 'instructor', label: '授课员工（教练/老师）', example: '教练' },
  { key: 'learner', label: '被服务者（学员/会员）', example: '学员' },
  { key: 'membership', label: '会员卡/学员卡', example: '会员卡' },
  { key: 'course', label: '课程/训练', example: '课程' },
  { key: 'checkin', label: '签到/打卡', example: '签到' },
  { key: 'session', label: '一次排课（课次/训练）', example: '课次' },
  { key: 'leave', label: '请假', example: '请假' },
  { key: 'makeup', label: '补课', example: '补课' },
  { key: 'guardian', label: '家长', example: '家长' },
  { key: 'org', label: '机构/场馆', example: '机构' },
  { key: 'sales', label: '销售/会籍顾问', example: '销售' },
];

// 两套预设方案
const SCHEMES = {
  edu: {
    key: 'edu',
    name: '教培版',
    desc: '老师 / 学员 / 课程 / 签到',
    terms: {
      instructor: '老师',
      learner: '学员',
      membership: '学员卡',
      course: '课程',
      checkin: '签到',
      session: '课次',
      leave: '请假',
      makeup: '补课',
      guardian: '家长',
      org: '机构',
      sales: '销售',
    },
  },
  fitness: {
    key: 'fitness',
    name: '健身版',
    desc: '教练 / 会员 / 训练 / 打卡',
    terms: {
      instructor: '教练',
      learner: '会员',
      membership: '会员卡',
      course: '训练',
      checkin: '打卡',
      session: '训练',
      leave: '请假',
      makeup: '补课',
      guardian: '家长',
      org: '场馆',
      sales: '会籍顾问',
    },
  },
};

const DEFAULT_SCHEME = 'edu';

// 角色徽标使用的称呼（coach/sales 跟随方案，admin/parent 固定）
function roleLabel(role, terms) {
  switch (role) {
    case 'admin': return '管理员';
    case 'coach': return terms.instructor;
    case 'sales': return terms.sales;
    case 'parent': return terms.guardian;
    case 'student': return terms.learner;
    default: return role || '';
  }
}

/**
 * 解析最终术语表：预设 + 自定义覆盖
 * @param {string} scheme - 'edu' | 'fitness'
 * @param {object} overrides - { conceptKey: 自定义词 }
 * @returns {object} 概念键 → 显示词
 */
function resolveTerms(scheme, overrides) {
  const base = (SCHEMES[scheme] && SCHEMES[scheme].terms) || SCHEMES[DEFAULT_SCHEME].terms;
  return Object.assign({}, base, overrides || {});
}

/**
 * 从数据库 settings 读取机构术语方案
 * @param {object} db - better-sqlite3 实例
 * @returns {{ scheme: string, overrides: object, terms: object }}
 */
function getTerms(db) {
  let scheme = DEFAULT_SCHEME;
  let overrides = {};
  try {
    const sRow = db.prepare("SELECT value FROM settings WHERE key = 'term_scheme'").get();
    if (sRow && sRow.value) scheme = sRow.value || DEFAULT_SCHEME;
    const oRow = db.prepare("SELECT value FROM settings WHERE key = 'term_overrides'").get();
    if (oRow && oRow.value) {
      try { overrides = JSON.parse(oRow.value) || {}; } catch (e) { overrides = {}; }
    }
  } catch (e) { /* settings 表缺失时回退默认 */ }
  return { scheme, overrides, terms: resolveTerms(scheme, overrides) };
}

/**
 * 将文本中的 {{conceptKey}} 占位符替换为机构术语
 * @param {string} text
 * @param {object} terms - resolveTerms 的结果
 * @returns {string}
 */
function applyTerms(text, terms) {
  if (!text || typeof text !== 'string') return text;
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, key) => {
    return (terms && terms[key] != null) ? terms[key] : m;
  });
}

module.exports = {
  CONCEPTS,
  SCHEMES,
  DEFAULT_SCHEME,
  resolveTerms,
  getTerms,
  applyTerms,
  roleLabel,
};
