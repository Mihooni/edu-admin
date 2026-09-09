/**
 * 数据导入/导出工具 — 按业务模块将业务数据导出为 JSON，并可整体或分模块导入。
 *
 * 设计目标：
 *  - 私有化部署下的「数据迁移 / 备份 / 恢复」：不依赖外部存储，生成可阅读、可二次处理的 JSON。
 *  - 支持「整体导出再整体导入」，也支持「按模块单独导入/导出」。
 *  - 导入默认按主键 upsert（INSERT OR REPLACE），幂等安全；可选「覆盖模式」先清空所选模块再写入，用于完整回滚。
 *
 * 安全说明：SQL 中的表名、列名均来自本文件内受控的 MODULES 常量（非用户输入），不存在注入风险。
 */
const db = require('../db');

const APP_NAME = 'edu-admin';
const FORMAT_VERSION = 1;

// 业务模块 → 数据表 映射（仅导出/导入业务表，不含迁移记录 _migrations）
// 表名、列名全部来自此处受控常量，导入导出时使用 PRAGMA 读取列，避免手写漂移。
// desc：用于导出/导入确认弹窗中向管理员说明该模块具体包含哪些数据。
const MODULES = [
  { key: 'students',      label: '成员',       tables: ['students', 'parent_bindings'], desc: '成员档案：姓名、性别、生日、学校、年级、联系方式、入会日期、状态，以及家长绑定关系' },
  { key: 'staff',         label: '员工与场地', tables: ['teachers', 'classrooms', 'payroll_logs'], desc: '员工与场地：教练/老师资料、教室场地信息、工资发放记录' },
  { key: 'courses',       label: '课程与活动', tables: ['courses', 'schedule_rules'], desc: '课程与活动：课程信息、自动排课规则' },
  { key: 'schedules',     label: '排课',       tables: ['schedules'], desc: '排课：课程排期安排与时间' },
  { key: 'enrollments',   label: '报名',       tables: ['enrollments'], desc: '报名：成员报名记录' },
  { key: 'attendances',   label: '签到记录',   tables: ['attendances', 'deduction_logs'], desc: '签到记录：考勤明细与扣课记录' },
  { key: 'memberships',   label: '会员卡',     tables: ['membership_cards', 'member_cards'], desc: '会员卡：卡类型定义与成员持卡实例（剩余课时、有效期等）' },
  { key: 'points',        label: '积分',       tables: ['points', 'point_logs'], desc: '积分：积分账户余额与积分流水' },
  { key: 'orders',        label: '订单与支付', tables: ['orders', 'payments'], desc: '订单与支付：销售订单、收款/退款记录' },
  { key: 'notifications', label: '通知消息',   tables: ['notifications', 'notification_reads'], desc: '通知消息：站内/微信推送记录与已读状态' },
  { key: 'leaves',        label: '请假',       tables: ['leave_requests'], desc: '请假：家长请假申请与审批' },
  { key: 'feedback',      label: '意见反馈',   tables: ['feedback'], desc: '意见反馈：用户提交的建议与问题' },
  { key: 'growth',        label: '增长线索',   tables: ['leads'], desc: '增长线索：潜在客户线索与跟进' },
  { key: 'settings',      label: '系统设置',   tables: ['settings'], desc: '系统设置：机构信息、积分/推送/退费/请假规则、称呼配置等' },
  { key: 'users',         label: '账号',       tables: ['users'], desc: '账号：管理员/教练/销售登录账号（含密码哈希，跨机器可直接登录）' },
];

const MODULE_MAP = Object.fromEntries(MODULES.map((m) => [m.key, m]));

// 各表可用于「按时间范围导出」的日期列（均为 epoch 毫秒）。
// 仅当该列存在且查询给定了 from/to 时，导出才对该表做时间筛选；其余表导出全部。
const TABLE_DATE_COLUMNS = {
  users: 'created_at',
  students: 'created_at',
  parent_bindings: 'created_at',
  teachers: 'created_at',
  classrooms: 'created_at',
  courses: 'created_at',
  schedules: 'created_at',
  schedule_rules: 'created_at',
  enrollments: 'enrolled_at',
  attendances: 'created_at',
  membership_cards: 'created_at',
  member_cards: 'created_at',
  points: 'updated_at',
  point_logs: 'created_at',
  orders: 'created_at',
  payments: 'paid_at',
  notifications: 'created_at',
  notification_reads: 'created_at',
  leave_requests: 'created_at',
  feedback: 'created_at',
  settings: 'updated_at',
  leads: 'created_at',
};

/** 返回模块元信息（前端用于渲染多选框与确认弹窗） */
function getModulesMeta() {
  return MODULES.map((m) => ({
    key: m.key,
    label: m.label,
    desc: m.desc,
    tables: m.tables,
    dateFilter: m.tables.some((t) => TABLE_DATE_COLUMNS[t]),
  }));
}

/**
 * 解析模块选择：undefined/null → 全部；字符串按逗号拆分；数组直接使用。
 * 过滤掉非法模块 key。
 */
function resolveModules(input) {
  let keys;
  if (!input) {
    keys = MODULES.map((m) => m.key);
  } else if (Array.isArray(input)) {
    keys = input;
  } else {
    keys = String(input)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return keys.filter((k) => MODULE_MAP[k]).map((k) => MODULE_MAP[k]);
}

/** 读取某张表的列名（用于 upsert 时精确匹配列，规避 SELECT * 顺序/缺列问题） */
function getColumns(table) {
  try {
    return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  } catch (e) {
    return [];
  }
}

/**
 * 导出数据
 * @param {string|string[]|undefined} modulesInput
 * @param {{ dateFrom?: number, dateTo?: number }} [opts] 时间范围（epoch 毫秒），对含日期列的表做筛选
 * @returns {{ meta: object, data: object }}
 */
function exportData(modulesInput, opts = {}) {
  const mods = resolveModules(modulesInput);
  const dateFrom = typeof opts.dateFrom === 'number' && !Number.isNaN(opts.dateFrom) ? opts.dateFrom : null;
  const dateTo = typeof opts.dateTo === 'number' && !Number.isNaN(opts.dateTo) ? opts.dateTo : null;
  const useDate = dateFrom != null && dateTo != null;
  const data = {};
  for (const m of mods) {
    const tables = {};
    for (const t of m.tables) {
      try {
        const dateCol = TABLE_DATE_COLUMNS[t];
        let sql = `SELECT * FROM ${t}`;
        const params = [];
        if (useDate && dateCol) {
          // 仅在列真实存在时才加筛选，避免列名不匹配导致整表导出失败
          const cols = getColumns(t);
          if (cols.includes(dateCol)) {
            sql += ` WHERE ${dateCol} >= ? AND ${dateCol} <= ?`;
            params.push(dateFrom, dateTo);
          }
        }
        tables[t] = db.prepare(sql).all(...params);
      } catch (e) {
        tables[t] = [];
      }
    }
    data[m.key] = { tables };
  }
  return {
    meta: {
      app: APP_NAME,
      format: FORMAT_VERSION,
      exportedAt: Date.now(),
      modules: mods.map((m) => m.key),
      dateFrom,
      dateTo,
    },
    data,
  };
}

/**
 * 导入数据
 * @param {object} payload 文件 JSON：{ meta, data }
 * @param {{ modules?: string[], replace?: boolean }} opts
 * @returns {{ imported: object, errors: string[], meta: object }}
 */
function importData(payload, opts = {}) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('导入数据格式错误（应为 JSON 对象）');
  }
  const meta = payload.meta || {};
  if (meta.app && meta.app !== APP_NAME) {
    throw new Error('该文件不属于本系统，无法导入');
  }
  if (!payload.data || typeof payload.data !== 'object') {
    throw new Error('文件中不包含可导出的数据');
  }
  const format = meta.format || 1;
  if (format > FORMAT_VERSION) {
    throw new Error('文件格式版本过高，请升级系统后再导入');
  }

  // 选择要导入的模块：指定则以文件内存在的为准，否则导入文件包含的全部模块
  let targetKeys;
  if (opts.modules && opts.modules.length) {
    targetKeys = opts.modules.filter((k) => payload.data[k]);
  } else {
    targetKeys = Object.keys(payload.data);
  }
  targetKeys = targetKeys.filter((k) => MODULE_MAP[k]);
  if (targetKeys.length === 0) {
    throw new Error('文件中没有可导入的模块');
  }

  const summary = {};
  const errors = [];
  const replace = !!opts.replace;

  const run = db.transaction(() => {
    for (const key of targetKeys) {
      const mod = MODULE_MAP[key];
      const modData = payload.data[key];
      // 兼容 { tables: {...} } 与直接 {...} 两种结构
      const tablesObj = modData && modData.tables ? modData.tables : modData;
      const tableSummary = {};
      for (const t of mod.tables) {
        const rows = tablesObj[t];
        if (!Array.isArray(rows)) continue;
        const cols = getColumns(t);
        if (cols.length === 0) {
          errors.push(`表 ${t} 不存在，已跳过`);
          continue;
        }
        if (replace) {
          db.prepare(`DELETE FROM ${t}`).run();
        }
        if (rows.length === 0) {
          tableSummary[t] = 0;
          continue;
        }
        const colList = cols.map((c) => `"${c}"`).join(',');
        const placeholders = cols.map(() => '?').join(',');
        const stmt = db.prepare(
          `INSERT OR REPLACE INTO ${t} (${colList}) VALUES (${placeholders})`
        );
        let count = 0;
        for (const row of rows) {
          const vals = cols.map((c) => (row[c] === undefined ? null : row[c]));
          stmt.run(...vals);
          count++;
        }
        tableSummary[t] = count;
      }
      summary[key] = {
        label: mod.label,
        tables: tableSummary,
        total: Object.values(tableSummary).reduce((a, b) => a + b, 0),
      };
    }
  });

  // 覆盖模式需要在清空父表前关闭外键约束。注意：foreign_keys 不能在事务内切换，
  // 必须在事务开启前（run() 之前）设置，事务结束后再恢复。
  if (replace) db.pragma('foreign_keys = OFF');
  try {
    run();
  } finally {
    if (replace) db.pragma('foreign_keys = ON');
  }

  return {
    imported: summary,
    errors,
    meta: { exportedAt: meta.exportedAt, modules: targetKeys },
  };
}

module.exports = {
  APP_NAME,
  FORMAT_VERSION,
  MODULES,
  getModulesMeta,
  resolveModules,
  exportData,
  importData,
};
