/**
 * 机构称呼（术语）方案 — 前端镜像
 * 与后端 backend/utils/terms.js 保持一致。
 * 机构可在管理端「称呼设置」选择预设（教培版 / 健身版）并对单个概念微调。
 * 页面统一通过 useTerms().t(key) 或全局 $t(key) 取词，杜绝“教练/老师/学员/会员”混用。
 */

// 可配置概念（设置页按此渲染微调项）
export const CONCEPTS = [
  { key: 'instructor', label: '授课员工（教练/老师）' },
  { key: 'learner', label: '被服务者（学员/会员）' },
  { key: 'membership', label: '会员卡/学员卡' },
  { key: 'course', label: '课程/训练' },
  { key: 'checkin', label: '签到/打卡' },
  { key: 'session', label: '一次排课（课次/训练）' },
  { key: 'leave', label: '请假' },
  { key: 'makeup', label: '补课' },
  { key: 'guardian', label: '家长' },
  { key: 'org', label: '机构/场馆' },
  { key: 'sales', label: '销售/会籍顾问' },
];

// 两套预设
export const SCHEMES = {
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

export const DEFAULT_SCHEME = 'edu';

export function resolveTerms(scheme, overrides) {
  const base = (SCHEMES[scheme] && SCHEMES[scheme].terms) || SCHEMES[DEFAULT_SCHEME].terms;
  return { ...base, ...(overrides || {}) };
}

// 角色徽标称呼（coach/sales 跟随方案；admin/parent 固定）
export function roleLabel(role, terms) {
  switch (role) {
    case 'admin': return '管理员';
    case 'coach': return terms.instructor;
    case 'sales': return terms.sales;
    case 'parent': return terms.guardian;
    case 'student': return terms.learner;
    default: return role || '';
  }
}
