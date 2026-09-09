// Web 端角色权限实测：管理员全菜单 / 教练受限菜单 / 家长被拒
// 使用后端托管的构建产物（3001，与 web-flow-audit 一致），避免与其它占用 3000 的服务冲突
import path from 'node:path';
import { launchBrowser } from './browser.mjs'
const __ROOT = (() => {
  const p = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  return p;
})();

const base = 'http://localhost:3001'
const browser = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const results = []

async function step(name, fn) {
  try { await fn(); results.push(`✓ ${name}`) }
  catch (e) { results.push(`✗ ${name}: ${String(e).slice(0, 140)}`) }
}

async function login(phone, roleLabel, password) {
  await page.goto(base + '/login', { waitUntil: 'networkidle' })
  await page.fill('input[placeholder="请输入手机号"]', phone)
  await page.click(`text=${roleLabel}`)
  await page.fill('input[placeholder="请输入登录密码"]', password || '123456')
  await page.click('button:has-text("登 录")')
}

// 1. 登录页无"家长"选项
await step('登录页仅管理员/教练选项', async () => {
  await page.goto(base + '/login', { waitUntil: 'networkidle' })
  const parentOpt = await page.locator('.role-chip', { hasText: '家长' }).count()
  if (parentOpt > 0) throw new Error('登录页仍显示家长选项')
  const adminOpt = await page.locator('.role-chip', { hasText: '管理员' }).count()
  const coachOpt = await page.locator('.role-chip', { hasText: '教练' }).count()
  if (adminOpt === 0 || coachOpt === 0) throw new Error('缺少管理员/教练选项')
})

// 2. 管理员登录：全部菜单
await step('管理员登录-全菜单', async () => {
  await login('13800000001', '管理员')
  await page.waitForURL('**/dashboard', { timeout: 10000 })
  await page.waitForSelector('.sidebar-menu .el-menu-item', { timeout: 8000 })
  const count = await page.locator('.sidebar-menu .el-menu-item').count()
  if (count < 10) throw new Error(`管理员菜单项过少: ${count}`)
  // 验证用户下拉含"系统设置"入口（仅管理员）
  await page.click('.user-trigger')
  await page.waitForTimeout(500)
  const settingsEntry = await page.locator('.el-dropdown-menu__item', { hasText: '系统设置' }).count()
  if (settingsEntry === 0) throw new Error('管理员缺少系统设置入口')
  await page.keyboard.press('Escape')
})

// 3. 教练登录：受限菜单 + 首页跳排期
await step('教练登录-受限菜单', async () => {
  await login('13800000011', '教练')
  await page.waitForURL('**/schedule', { timeout: 10000 })
  await page.waitForSelector('.sidebar-menu .el-menu-item', { timeout: 8000 })
  const items = await page.locator('.sidebar-menu .el-menu-item').allTextContents()
  const hasSchedule = items.some((t) => t.includes('排期'))
  const hasSettings = items.some((t) => t.includes('系统设置'))
  const hasOrders = items.some((t) => t.includes('销售'))
  if (!hasSchedule) throw new Error('教练缺少排期菜单')
  if (hasSettings || hasOrders) throw new Error(`教练菜单越权: ${items.join(',')}`)
})

// 4. 教练访问 /settings 被重定向
await step('教练访问系统设置被拦截', async () => {
  await page.goto(base + '/settings', { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  const url = page.url()
  if (!url.includes('/schedule')) throw new Error(`未重定向，当前: ${url}`)
})

// 5. 家长登录被拒
await step('家长登录被拒', async () => {
  await page.goto(base + '/login', { waitUntil: 'networkidle' })
  await page.fill('input[placeholder="请输入手机号"]', '13900000001')
  await page.click('text=管理员')
  await page.fill('input[placeholder="请输入登录密码"]', '123456')
  await page.click('button:has-text("登 录")')
  await page.waitForTimeout(1000)
  const err = await page.locator('.el-message--error').count()
  if (err === 0) throw new Error('家长登录未提示错误')
})

await browser.close()
console.log(results.join('\n'))
