/**
 * 教练/兼职薪资计算引擎
 *
 * 支持三种计费模式：
 *  - fixed    按课时：每节课固定单价，可按人数设置阶梯档位
 *              例：80 元/节；≥16 人 120 元/节
 *  - per_head 按人头：按实际签到人数 × 单价
 *              例：5 元/人
 *  - hybrid   混合：每节基础费 + 超出免费人数后每人加价
 *              例：60 元/节，超出 6 人后每多 1 人加 5 元
 *
 * payRule 结构：
 * {
 *   type: 'fixed' | 'per_head' | 'hybrid',
 *   baseRate: 80,              // fixed/hybrid 每节基础金额
 *   tiers: [{ minStudents: 16, rate: 120 }], // fixed 阶梯（升序）
 *   perHeadRate: 5,            // per_head 每人单价
 *   freeHeadCount: 6,          // hybrid 免费人数（含该人数）
 *   extraPerHead: 5            // hybrid 超出每人加价
 * }
 */

const DEFAULT_RULE = Object.freeze({
  type: 'fixed',
  baseRate: 0,
  tiers: [],
  perHeadRate: 0,
  freeHeadCount: 0,
  extraPerHead: 0,
});

const TYPES = ['fixed', 'per_head', 'hybrid'];

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 规范化规则：补全缺省字段，过滤非法档位，保证可安全用于计算
 */
function normalizeRule(rule) {
  const src = rule && typeof rule === 'object' ? rule : {};
  const type = TYPES.includes(src.type) ? src.type : 'fixed';
  const baseRate = Math.max(0, num(src.baseRate));
  const perHeadRate = Math.max(0, num(src.perHeadRate));
  const freeHeadCount = Math.max(0, Math.floor(num(src.freeHeadCount)));
  const extraPerHead = Math.max(0, num(src.extraPerHead));
  const tiers = Array.isArray(src.tiers)
    ? src.tiers
        .filter((t) => t && Number.isFinite(Number(t.minStudents)) && Number(t.minStudents) >= 0)
        .map((t) => ({
          minStudents: Math.floor(num(t.minStudents)),
          rate: Math.max(0, num(t.rate)),
        }))
        .sort((a, b) => a.minStudents - b.minStudents)
    : [];
  return { type, baseRate, perHeadRate, freeHeadCount, extraPerHead, tiers };
}

/**
 * 计算单节课的应发金额
 * @param {object} rule     规范化前的规则对象
 * @param {number} attended 实际签到人数（present + late）
 * @returns {number} 金额（元）
 */
function calcLessonPay(rule, attended) {
  const r = normalizeRule(rule);
  const n = Math.max(0, Math.floor(num(attended)));
  switch (r.type) {
    case 'per_head':
      return n * r.perHeadRate;
    case 'hybrid':
      return r.baseRate + Math.max(0, n - r.freeHeadCount) * r.extraPerHead;
    case 'fixed':
    default: {
      const hit = [...r.tiers]
        .sort((a, b) => b.minStudents - a.minStudents)
        .find((t) => n >= t.minStudents);
      return hit ? hit.rate : r.baseRate;
    }
  }
}

/**
 * 规则摘要（用于表格/列表展示）
 */
function ruleSummary(rule) {
  const r = normalizeRule(rule);
  switch (r.type) {
    case 'per_head':
      return `${r.perHeadRate} 元/人`;
    case 'hybrid':
      return `${r.baseRate} 元/节，超出 ${r.freeHeadCount} 人后 ${r.extraPerHead} 元/人`;
    case 'fixed':
    default: {
      const tiers = [...r.tiers].sort((a, b) => a.minStudents - b.minStudents);
      if (!tiers.length) return `${r.baseRate} 元/节`;
      const parts = [`${r.baseRate} 元/节`];
      for (const t of tiers) parts.push(`≥${t.minStudents}人 ${t.rate} 元/节`);
      return parts.join('，');
    }
  }
}

/**
 * 单节课计算说明（用于明细导出/弹窗）
 */
function calcText(rule, attended) {
  const r = normalizeRule(rule);
  const n = Math.max(0, Math.floor(num(attended)));
  switch (r.type) {
    case 'per_head':
      return `${r.perHeadRate} 元/人 × ${n} 人`;
    case 'hybrid': {
      const extra = Math.max(0, n - r.freeHeadCount);
      if (extra <= 0) return `${r.baseRate} 元/节（${n} 人，未超 ${r.freeHeadCount} 人）`;
      return `${r.baseRate} 元/节 + (${n} - ${r.freeHeadCount}) × ${r.extraPerHead} 元`;
    }
    case 'fixed':
    default: {
      const hit = [...r.tiers]
        .sort((a, b) => b.minStudents - a.minStudents)
        .find((t) => n >= t.minStudents);
      return hit
        ? `${hit.rate} 元/节（≥${hit.minStudents} 人）`
        : `${r.baseRate} 元/节`;
    }
  }
}

module.exports = {
  DEFAULT_RULE,
  TYPES,
  normalizeRule,
  calcLessonPay,
  ruleSummary,
  calcText,
};
