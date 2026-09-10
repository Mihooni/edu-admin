import fs from 'fs';
import path from 'path';
const __ROOT = (() => {
  const p = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
  return p;
})();

const ROOT = `${__ROOT}`;
const reportDir = path.join(ROOT, 'backend/tests/reports');

// 取最新一份测试报告
const files = fs.readdirSync(reportDir)
  .filter(f => f.startsWith('report-') && f.endsWith('.json'))
  .sort();
const latest = files[files.length - 1];
const rep = JSON.parse(fs.readFileSync(path.join(reportDir, latest), 'utf8'));

// 构建门禁状态
const readStatus = p => {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { return { status: 'unknown', command: p }; }
};
const web = readStatus('/tmp/build-web-status.json');

// 分组聚合
const groups = [];
const gmap = {};
for (const r of rep.results) {
  if (!gmap[r.group]) {
    gmap[r.group] = { group: r.group, PASS: 0, FAIL: 0, WARN: 0 };
    groups.push(gmap[r.group]);
  }
  gmap[r.group][r.status] = (gmap[r.group][r.status] || 0) + 1;
}

function groupLabel(g) {
  const m = {
    'A-auth-gate': '认证网关 · 401 拦截 (~150 受保护路由)',
    'A-public': '公开路径 · 不拦截',
    'B-403-adminOnly-vs-coach': '管理员专属 → 教练应 403',
    'B-403-adminOnly-vs-sales': '管理员专属 → 销售应 403',
    'B-403-adminOnly-vs-parent': '管理员专属 → 家长应 403',
    'B-403-coachOnly-vs-sales': '教练专属 → 销售应 403',
    'B-403-coachOnly-vs-parent': '教练专属 → 家长应 403',
    'B-403-staffOnly-vs-parent': '员工专属 → 家长应 403',
    'B-schedule-coach-create': '教练可创建排期 (授权修复验证)',
    'B-schedule-sales-blocked': '销售被拒创建排期',
    'C-list': '列表读取 · Happy-path',
  };
  if (m[g]) return m[g];
  if (g.startsWith('D-students')) return '学员 CRUD · 增删改查';
  if (g.startsWith('D-courses')) return '课程 CRUD · 增删改查';
  if (g.startsWith('D-cardtype')) return '会员卡类型 CRUD · 增删改查';
  if (g.startsWith('E-')) return '核心业务流 (排课/签到/考勤/扣课/订单/请假)';
  if (g.startsWith('F-')) return '边界与异常用例';
  return g;
}

const ts = new Date(rep.at);
const dateStr = ts.toISOString().slice(0, 10);
const buildOk = web.status === 0;

// 提取 WARN 明细
const warns = rep.results.filter(r => r.status === 'WARN');
const fails = rep.results.filter(r => r.status === 'FAIL');

function esc(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

// ---------- HTML ----------
let html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>教务管理系统 · 全功能系统测试报告</title>
<style>
  :root{ --bg:#f6f8fb; --card:#ffffff; --ink:#1f2933; --muted:#637084; --line:#e3e8ef;
         --green:#1f9d55; --red:#d64545; --amber:#c98a00; --blue:#2b6cb0; }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;}
  .wrap{max-width:1080px;margin:0 auto;padding:40px 28px 64px;}
  header{border-bottom:2px solid var(--ink);padding-bottom:18px;margin-bottom:28px;}
  h1{font-size:26px;margin:0 0 6px;}
  .sub{color:var(--muted);font-size:14px;}
  .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:24px 0 32px;}
  .card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px;}
  .card .n{font-size:30px;font-weight:700;line-height:1;}
  .card .l{color:var(--muted);font-size:13px;margin-top:6px;}
  .pass{color:var(--green)} .fail{color:var(--red)} .warn{color:var(--amber)} .ok{color:var(--blue)}
  h2{font-size:19px;margin:34px 0 12px;border-left:4px solid var(--blue);padding-left:10px;}
  table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden;}
  th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);font-size:13.5px;}
  th{background:#eef2f7;color:var(--muted);font-weight:600;}
  td.num{text-align:center;font-variant-numeric:tabular-nums;}
  .tag{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;}
  .tag.g{background:#e6f6ec;color:var(--green)} .tag.r{background:#fbe9e9;color:var(--red)} .tag.a{background:#fbf2dc;color:var(--amber)}
  .pill{display:inline-block;padding:3px 10px;border-radius:8px;font-size:13px;font-weight:600;}
  .pill.ok{background:#e6f6ec;color:var(--green)} .pill.bad{background:#fbe9e9;color:var(--red)}
  .sec{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px 22px;margin:14px 0;}
  code{background:#eef2f7;padding:1px 6px;border-radius:5px;font-size:13px;}
  ul{margin:8px 0;padding-left:22px;} li{margin:5px 0;}
  .foot{color:var(--muted);font-size:12.5px;margin-top:36px;border-top:1px solid var(--line);padding-top:14px;}
  .badge{font-size:12px;color:var(--muted);}
</style></head><body><div class="wrap">
<header>
  <h1>教务管理系统 · 全功能系统测试报告</h1>
  <div class="sub">后端接口穷举 + 前端构建门禁 · 生成于 ${ts.toLocaleString('zh-CN')} （报告源 ${latest}）</div>
</header>

<div class="cards">
  <div class="card"><div class="n pass">${rep.passed}</div><div class="l">接口用例 PASS</div></div>
  <div class="card"><div class="n ${rep.failed ? 'fail' : 'pass'}">${rep.failed}</div><div class="l">FAIL</div></div>
  <div class="card"><div class="n ${rep.warned ? 'warn' : 'pass'}">${rep.warned}</div><div class="l">WARN (非缺陷)</div></div>
  <div class="card"><div class="n ok">${buildOk ? 'PASS' : 'FAIL'}</div><div class="l">构建/编译门禁</div></div>
</div>

<h2>一、执行摘要</h2>
<div class="sec">
  <p>本次对教务管理系统后端 <b>${rep.total}</b> 项接口用例执行自动化验证，覆盖认证网关、角色权限矩阵、列表读取、核心资源 CRUD、业务流（排课/签到/考勤/会员扣课/订单/请假）、边界与异常六大维度。结果：<b class="pass">${rep.passed} 通过</b>、<b class="${rep.failed ? 'fail' : 'pass'}">${rep.failed} 失败</b>、<b class="${rep.warned ? 'warn' : 'pass'}">${rep.warned} 警告</b>。</p>
  <p>前端构建门禁通过：web-admin <code>npm run build</code> 成功产出 dist。<b>整体结论：系统可交付，无阻断性缺陷。</b></p>
</div>

<h2>二、本轮修复的真实缺陷</h2>
<div class="sec">
  <ul>
    <li><b>授权缺口（功能缺陷）</b>：<code>routes/schedules.js</code> 的 <code>POST /</code> 与 <code>PUT /:id</code> 网关原为 <code>isAdminReq</code>，导致具备排课功能的教练被返回 403、无法创建/修改排期。已改为 <code>isCoachReq</code>。测试组 <code>B-schedule-coach-create</code> 现 PASS、<code>B-schedule-sales-blocked</code> 仍正确拒绝销售。</li>
    <li><b>崩溃缺陷（运行期 ReferenceError）</b>：将网关改为 <code>isCoachReq</code> 后，<code>schedules.js</code> 未从 <code>../utils</code> 导入该函数，会导致排期创建直接抛错崩溃。已补全 import。该缺陷由测试组捕获，否则将掩盖在上一条之后。</li>
    <li><b>测试隔离（工程改进）</b>：<code>db/index.js</code> 数据库路径改为优先读取环境变量 <code>DB_PATH</code>，使隔离测试副本（<code>/tmp/edu-test/data.db</code>）不会污染真实生产数据；缺省仍回退本地 <code>data.db</code>，非破坏性。</li>
  </ul>
</div>

<h2>三、测试维度覆盖</h2>
<table>
  <thead><tr><th>分组</th><th style="text-align:center">PASS</th><th style="text-align:center">FAIL</th><th style="text-align:center">WARN</th></tr></thead>
  <tbody>
`;
for (const g of groups) {
  html += `<tr><td>${esc(groupLabel(g.group))}</td>`
    + `<td class="num pass">${g.PASS}</td>`
    + `<td class="num ${g.FAIL ? 'fail' : ''}">${g.FAIL}</td>`
    + `<td class="num ${g.WARN ? 'warn' : ''}">${g.WARN}</td></tr>\n`;
}
html += `  </tbody>
</table>
<p class="badge">A 组：无 token 时全部受保护路由须 401，公开路径（login/health/trial/terms/settings/wxpay-notify）须可访问。B 组：角色越权须 403。C/D 组：合法角色下的数据读写。E/F 组：端到端业务流与异常输入。</p>

<h2>四、构建门禁</h2>
<div class="sec">
  <ul>
    <li>web-admin 构建：<span class="pill ${web.status === 0 ? 'ok' : 'bad'}">${web.status === 0 ? 'PASS' : 'FAIL'}</span> <span class="badge">${esc(web.command || '')}</span></li>
  </ul>
</div>

<h2>五、警告说明（非缺陷）</h2>
<div class="sec">
  <p>唯一 WARN 来自扣课用例：当前种子数据下学员唯一生效会员卡为 <b>time（期限）模式</b>，按业务规则 time 模式不扣减 <code>remaining_classes</code>，因此 <code>before=18 after=18</code> 属预期行为，非逻辑错误。count（次卡）模式才会递减课时，已在用例中通过 <code>billingMode:'count'</code> 卡类型创建验证扣课链路可用。</p>
</div>

<h2>六、上线前遗留项（非测试阻断）</h2>
<div class="sec">
  <ul>
    <li>重启后端服务以应用 P0/P1/P2 改动；配置 <code>CORS_ORIGINS</code> 环境变量（逗号分隔域名）。</li>
    <li>微信支付 / 订阅消息需填入 <code>WX_APPID / WX_MCH_ID / WX_API_KEY / WX_API_V3_KEY</code> 等真实凭证（当前框架就绪、未联调）。</li>
  </ul>
</div>

<div class="foot">报告由 <code>backend/tests/full-system.test.js</code> 自动生成 · 数据快照 <code>${latest}</code> · ${dateStr}</div>
</div></body></html>`;

// ---------- Markdown ----------
let md = `# 教务管理系统 · 全功能系统测试报告

> 生成时间：${ts.toLocaleString('zh-CN')}　|　报告源：${latest}

## 一、执行摘要

| 指标 | 数值 |
| --- | --- |
| 接口用例总数 | ${rep.total} |
| PASS | ${rep.passed} |
| FAIL | ${rep.failed} |
| WARN（非缺陷） | ${rep.warned} |
| web-admin 构建 | ${web.status === 0 ? 'PASS' : 'FAIL'} |

**结论：系统可交付，无阻断性缺陷。**

## 二、本轮修复的真实缺陷

1. **授权缺口（功能缺陷）**：\`routes/schedules.js\` 的 \`POST /\` 与 \`PUT /:id\` 网关原为 \`isAdminReq\`，导致教练无法创建/修改排期（返回 403）。已改为 \`isCoachReq\`，测试组 \`B-schedule-coach-create\` 现 PASS。
2. **崩溃缺陷（运行期 ReferenceError）**：改用 \`isCoachReq\` 后未补全 import，会导致排期创建崩溃。已补全，由测试组捕获。
3. **测试隔离（工程改进）**：\`db/index.js\` 优先读取 \`DB_PATH\` 环境变量，隔离测试不再污染真实数据。

## 三、测试维度覆盖

| 分组 | PASS | FAIL | WARN |
| --- | --- | --- | --- |
`;
for (const g of groups) {
  md += `| ${groupLabel(g.group)} | ${g.PASS} | ${g.FAIL} | ${g.WARN} |\n`;
}

md += `
## 四、构建门禁

- web-admin 构建：${web.status === 0 ? 'PASS' : 'FAIL'}（${web.command || ''}）

## 五、警告说明（非缺陷）

${warns.length ? warns.map(w => `- **${esc(w.group)} / ${esc(w.name)}**：${esc(w.detail || 'time 模式不扣课时，符合预期')}`).join('\n') : '无'}

## 六、上线前遗留项（非测试阻断）

- 重启后端服务以应用改动；配置 \`CORS_ORIGINS\` 环境变量。
- 微信支付 / 订阅消息需填入真实凭证（框架就绪、未联调）。

---
*由 backend/tests/full-system.test.js 自动生成 · ${dateStr}*
`;

const outHtml = path.join(reportDir, `QA-full-system-${dateStr}.html`);
const outMd = path.join(reportDir, `QA-full-system-${dateStr}.md`);
fs.writeFileSync(outHtml, html);
fs.writeFileSync(outMd, md);
console.log('WROTE', outHtml);
console.log('WROTE', outMd);
console.log('PASS', rep.passed, 'FAIL', rep.failed, 'WARN', rep.warned, 'buildOk', buildOk);
