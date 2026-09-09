// Web 全页面深度扫描：console 错误 / 页面报错 / HTTP≥400 / 可见溢出
import path from 'node:path';
import { launchBrowser } from './browser.mjs'
const __ROOT = (() => {
  const p = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  return p;
})();
const base = 'http://localhost:3001'
const ROUTES = ['/dashboard', '/students', '/orders', '/schedule', '/checkin', '/leave', '/parents', '/feedback', '/classes', '/growth', '/points', '/coach-stats', '/notifications', '/staff', '/settings']
const browser = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } })
const issues = []
const perPage = {}
page.on('pageerror', (e) => { issues.push(`[pageerror] ${String(e).slice(0, 160)}`) })
page.on('console', (m) => { if (m.type() === 'error') issues.push(`[console] ${m.text().slice(0, 160)}`) })
page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/api/')) issues.push(`[http ${r.status()}] ${r.url().split('?')[0]}`) })

await page.goto(base + '/login', { waitUntil: 'networkidle' })
await page.fill('input[placeholder="请输入手机号"]', '13800000001')
await page.click('text=管理员')
await page.fill('input[placeholder="请输入登录密码"]', '123456')
await page.click('button:has-text("登 录")')
await page.waitForURL('**/dashboard')

for (const route of ROUTES) {
  issues.length = 0
  await page.goto(base + route, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(2000)
  // 可见溢出检测（排除表格滚动容器内部）
  const overflow = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const inScrollable = (el) => {
      let p = el.parentElement
      while (p) {
        const s = getComputedStyle(p)
        if ((s.overflowX === 'auto' || s.overflowX === 'scroll' || s.overflowY === 'auto' || s.overflowY === 'scroll') && (p.scrollWidth > p.clientWidth + 4 || p.scrollHeight > p.clientHeight + 4)) return true
        p = p.parentElement
      }
      return false
    }
    return [...document.querySelectorAll('body *')].filter((el) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.right > vw + 2 && el.offsetParent !== null && !inScrollable(el)
    }).slice(0, 5).map((el) => (el.className?.toString?.() || el.tagName).slice(0, 60))
  })
  const tag = overflow.length ? ' 溢出:' + overflow.join('|') : ''
  if (issues.length || overflow.length) {
    console.log(`✗ ${route}${tag}`)
    for (const i of issues.slice(0, 4)) console.log(`    ${i}`)
  } else {
    console.log(`✓ ${route}`)
  }
}
await browser.close()
