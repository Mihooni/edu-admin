// Web 端控制台错误审计：登录管理员，遍历全部页面，收集 console error / 页面报错 / 失败请求
import path from 'node:path';
import { launchBrowser } from './browser.mjs'
const __ROOT = (() => {
  const p = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  return p;
})();

const base = 'http://localhost:3001'
const browser = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

const issues = []
const seen = new Set()
page.on('console', (msg) => {
  const t = msg.type()
  if (t === 'error' || t === 'warning') {
    const text = msg.text().slice(0, 220)
    const key = text
    if (!seen.has(key)) { seen.add(key); issues.push(`[console.${t}] ${text}`) }
  }
})
page.on('pageerror', (err) => issues.push(`[pageerror] ${String(err).slice(0, 220)}`))
page.on('requestfailed', (req) => issues.push(`[requestfailed] ${req.method()} ${req.url().slice(0, 140)} ${req.failure()?.errorText || ''}`))
page.on('response', (res) => {
  if (res.status() >= 400) issues.push(`[http ${res.status()}] ${res.url().slice(0, 140)}`)
})

// 登录
await page.goto(base + '/login', { waitUntil: 'networkidle' })
await page.fill('input[placeholder="请输入手机号"]', '13800000001')
await page.click('text=管理员')
await page.fill('input[placeholder="请输入登录密码"]', '123456')
await page.click('button:has-text("登 录")')
await page.waitForTimeout(1500)

const routes = [
  '/', '/dashboard', '/schedule', '/checkin', '/leave', '/students', '/parents', '/feedback',
  '/classes', '/orders', '/staff', '/settings',
]
const visited = []
for (const r of routes) {
  const before = issues.length
  try {
    await page.goto(base + r, { waitUntil: 'networkidle', timeout: 15000 })
    await page.waitForTimeout(600)
  } catch (e) {
    issues.push(`[nav] ${r}: ${String(e).slice(0, 120)}`)
  }
  const newIssues = issues.length - before
  visited.push(`${r}${newIssues ? ` (${newIssues} 个新问题)` : ''}`)
}

console.log('=== 访问页面 ===')
console.log(visited.join('\n'))
console.log('\n=== 问题汇总 ===')
if (issues.length === 0) {
  console.log('✓ 无控制台错误、页面错误或失败请求')
} else {
  const counts = {}
  for (const i of issues) {
    const kind = i.split(']')[0] + ']'
    counts[kind] = (counts[kind] || 0) + 1
  }
  console.log('按类型统计:', JSON.stringify(counts))
  console.log('--- 去重后的明细 ---')
  console.log(issues.slice(0, 40).join('\n'))
}
await browser.close()
