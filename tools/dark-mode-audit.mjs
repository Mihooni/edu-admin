// 暗黑模式花白审计：以 colorScheme=dark 遍历全部路由，
// 对每页取主内容区截图并量化亮色像素占比，同时收集 console 错误。
// 用法：node tools/dark-mode-audit.mjs [--theme dark|light]（默认 dark）
//  --theme light 用于浅色模式回归验证：预期亮色像素占比高、无 console 错误。
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { launchBrowser } from './browser.mjs'

const themeIdx = process.argv.indexOf('--theme')
const THEME = themeIdx >= 0 && ['dark', 'light'].includes(process.argv[themeIdx + 1])
  ? process.argv[themeIdx + 1] : 'dark'

const __ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const BASE = process.env.API_BASE || 'http://localhost:3001'
const OUT = path.join(__ROOT, `tools/uitest/dark-audit${THEME === 'light' ? '-light' : ''}`)
mkdirSync(OUT, { recursive: true })

const ROUTES = [
  ['/login', '登录', false],
  ['/dashboard', '数据看板', true],
  ['/operations?tab=schedule', '排课', true],
  ['/operations?tab=checkin', '签到', true],
  ['/operations?tab=leave', '请假', true],
  ['/operations?tab=classes', '班级', true],
  ['/students', '成员', true],
  ['/students?tab=points', '积分', true],
  ['/sales?tab=orders', '订单', true],
  ['/sales?tab=growth', '增长', true],
  ['/parents?tab=notifications', '通知', true],
  ['/parents?tab=feedback', '反馈', true],
  ['/staff', '员工', true],
  ['/staff?tab=coachstats', '教练课时', true],
  ['/settings', '设置', true],
]

// 从截图 PNG 的原始字节无法直接分析像素；改用页面内 canvas 采样：
// 对整个视口做 elementFromPoint 网格取 computed background，统计亮色占比。
const SAMPLE_FN = `(() => {
  const grid = [];
  const W = innerWidth, H = innerHeight;
  for (let y = 60; y < H; y += Math.floor(H/18)) {
    for (let x = 40; x < W; x += Math.floor(W/30)) {
      const el = document.elementFromPoint(x, y);
      if (!el) continue;
      let node = el, bg = 'rgba(0, 0, 0, 0)';
      while (node && node !== document.documentElement) {
        const c = getComputedStyle(node).backgroundColor;
        if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') { bg = c; break }
        node = node.parentElement;
      }
      const m = bg.match(/\\d+/g);
      if (!m) continue;
      const [r, g, b] = m.map(Number);
      const lum = 0.2126*r + 0.7152*g + 0.0722*b;
      grid.push(lum > 200 ? 1 : 0);
    }
  }
  const lightPct = grid.reduce((a,b)=>a+b,0) / grid.length;
  return { lightPct, colorSchemeUA: getComputedStyle(document.documentElement).colorScheme };
})()`

const browser = await launchBrowser({ args: THEME === 'dark' ? ['--force-dark-mode'] : [] })
const ctx = await browser.newContext({ colorScheme: THEME, viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const consoleErrors = []
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(`${msg.url()} :: ${msg.text().slice(0,160)}`) })
page.on('pageerror', (e) => consoleErrors.push('pageerror :: ' + String(e.message).slice(0,160)))

// 登录
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.fill('input[type="tel"], input[placeholder*="手机"]', '13800000001')
const pwd = page.locator('input[type="password"]')
if (await pwd.count()) await pwd.fill('123456')
// 可能有身份选择（管理员）
const adminBtn = page.locator('text=管理员').first()
if (await adminBtn.count()) await adminBtn.click().catch(() => {})
await page.click('button:has-text("登 录"), button:has-text("登录")').catch(async () => {
  await page.keyboard.press('Enter')
})
await page.waitForURL(u => !u.pathname.includes('login'), { timeout: 15000 }).catch(() => console.log('⚠ 登录后未跳转，继续'))

const report = []
for (const [route, name, needAuth] of ROUTES) {
  if (!needAuth && route === '/login') {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  } else {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  }
  await page.waitForTimeout(1200) // 等动画/表格渲染
  const shot = path.join(OUT, `${name}.png`)
  await page.screenshot({ path: shot })
  const sample = await page.evaluate(SAMPLE_FN)
  report.push({ route, name, lightPct: +(sample.lightPct * 100).toFixed(1), colorSchemeUA: sample.colorSchemeUA, shot })
  console.log(`${(sample.lightPct * 100).toFixed(1).padStart(5)}% 亮色  ${name.padEnd(6)} ${route}  [UA color-scheme: ${sample.colorSchemeUA}]`)
}

writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ theme: THEME, report, consoleErrors: [...new Set(consoleErrors)] }, null, 2))
console.log(`\n== console 错误（去重）==  [theme=${THEME}]`)
;[...new Set(consoleErrors)].slice(0, 20).forEach(e => console.log(' -', e))
console.log(`\n报告：${OUT}/report.json  截图：${report.length} 张`)
await browser.close()
