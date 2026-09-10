/**
 * 一键全量验收脚本
 * 运行全部自动化验证套件并输出汇总报告。
 * 用法：node tools/verify-all.mjs   （或 npm run verify）
 * 前置：后端运行在 http://localhost:3001（./start-all.sh 或 backend/node server.js）
 */
import { execFileSync } from 'child_process';

const root = new URL('..', import.meta.url).pathname;
const run = (cmd, args, cwd = root) => {
  const t0 = Date.now();
  try {
    const out = execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, ms: Date.now() - t0, tail: out.trim().split('\n').slice(-2).join(' | ') };
  } catch (e) {
    const err = (e.stdout || '') + (e.stderr || '');
    return { ok: false, ms: Date.now() - t0, tail: err.trim().split('\n').slice(-2).join(' | ') };
  }
};

const suites = [
  { name: '测试数据卫生检查', fn: () => run('node', ['tools/data-hygiene.mjs']) },
  { name: '冒烟测试（33 项）', fn: () => run('node', ['smoke-test.mjs']) },
  { name: '管理端 API 全流程（30 项）', fn: () => run('node', ['tools/admin-api-flow.mjs']) },
  { name: '业务剧本（全链路 21 项）', fn: () => run('node', ['tools/business-flow-test.mjs']) },
  { name: '双计费模式（时效/次数 14 项）', fn: () => run('node', ['tools/billing-mode-test.mjs']) },
  { name: '多孩报名链路（6 项）', fn: () => run('node', ['tools/multikid-enroll-test.mjs']) },
  { name: '积分奖励体系（9 项）', fn: () => run('node', ['tools/points-reward-test.mjs']) },
  { name: '请假扣减规则（课时/天数/双卡）', fn: () => run('node', ['tools/leave-deduct-test.mjs']) },
  { name: '家长扫码签到链路（8 项）', fn: () => run('node', ['tools/parent-checkin-test.mjs']) },
  { name: '提醒定时任务逻辑（7 项）', fn: () => run('node', ['tools/reminders-test.mjs']) },
  { name: 'API边界与越权（21 项）', fn: () => run('node', ['tools/api-edge-test.mjs']) },
  { name: '退款边界（6 项）', fn: () => run('node', ['tools/refund-test.mjs']) },
  { name: '管理端工作台链路（7 项）', fn: () => run('node', ['tools/admin-flow-test.mjs']) },
  { name: '管理端深化（添加/取消/字段 7 项）', fn: () => run('node', ['tools/admin-deep-test.mjs']) },
  { name: '管理端优化（展开/改排课/签到 7 项）', fn: () => run('node', ['tools/manage-opt-test.mjs']) },
  { name: '管理端真实工作流（24 项）', fn: () => run('node', ['tools/admin-workflow-e2e.mjs']) },
  { name: '薪资计算（规则引擎+API）', fn: () => run('node', ['tools/payroll-test.mjs']) },
  { name: 'Web 角色权限审计', fn: () => run('node', ['tools/web-role-audit.mjs']) },
  { name: 'Web 交互流审计', fn: () => run('node', ['tools/web-flow-audit.mjs']) },
];
// 收尾清理：流程测试会创建临时数据（排期/通知/积分/请假等），在验收结束后再跑一次数据卫生，
// 保证演示数据库在「验收完成」后立即恢复干净状态
const FINAL_CLEANUP = { name: '收尾数据清理', fn: () => run('node', ['tools/data-hygiene.mjs']) };
// 全库一致性审计：必须在收尾清理之后执行（前置套件会创建并清理测试数据）
const DB_INTEGRITY = { name: '全库跨表一致性审计（12 项）', fn: () => run('node', ['tools/db-integrity-test.mjs']) };

console.log('========================================');
console.log('  教务系统 · 一键全量验收');
console.log('========================================\n');

let failed = 0;
for (const s of [...suites, FINAL_CLEANUP, DB_INTEGRITY]) {
  const r = s.fn();
  const mark = r.ok ? '✓' : '✗';
  console.log(`${mark} ${s.name}  (${r.ms}ms)`);
  if (!r.ok) {
    failed++;
    console.log(`    ${r.tail}`);
  }
}

console.log('\n========================================');
console.log(failed ? `结果：${suites.length - failed}/${suites.length} 通过，${failed} 项失败` : `结果：${suites.length}/${suites.length} 全部通过 ✅`);
console.log('========================================');
process.exit(failed ? 1 : 0);
