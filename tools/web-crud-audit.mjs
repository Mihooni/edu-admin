// 班级管理 + 员工管理 CRUD UI 实测
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
  catch (e) { results.push(`✗ ${name}: ${String(e).slice(0, 150)}`) }
}

await step('登录', async () => {
  await page.goto(base + '/login', { waitUntil: 'networkidle' })
  await page.fill('input[placeholder="请输入手机号"]', '13800000001')
  await page.click('text=管理员')
  await page.fill('input[placeholder="请输入登录密码"]', '123456')
  await page.click('button:has-text("登 录")')
  await page.waitForURL('**/dashboard', { timeout: 10000 })
})

// ===== 班级管理 =====
await step('班级管理-新增项目弹窗', async () => {
  await page.goto(base + '/classes', { waitUntil: 'networkidle' })
  await page.waitForSelector('.class-card, .class-grid', { timeout: 8000 })
  const btn = await page.locator('button:has-text("新建项目")').count()
  if (btn === 0) throw new Error('缺少新增按钮')
  await page.click('button:has-text("新建项目")')
  await page.waitForSelector('.el-dialog', { timeout: 5000 })
  const nameInput = await page.locator('.el-dialog input').first().count()
  if (nameInput === 0) throw new Error('弹窗缺少名称输入')
  await page.click('.el-dialog button:has-text("取消")')
})

// ===== 员工管理 =====
await step('员工管理-新增员工弹窗含手机号/密码提示', async () => {
  await page.goto(base + '/staff', { waitUntil: 'networkidle' })
  await page.waitForSelector('.el-table', { timeout: 8000 })
  const btn = await page.locator('button:has-text("新增员工"), button:has-text("添加员工"), button:has-text("新增")').first().count()
  if (btn === 0) throw new Error('缺少新增员工按钮')
  await page.locator('button:has-text("新增员工"), button:has-text("添加员工"), button:has-text("新增")').first().click()
  await page.waitForSelector('.el-dialog', { timeout: 5000 })
  const name = await page.locator('.el-dialog', { hasText: '姓名' }).count()
  const phone = await page.locator('.el-dialog', { hasText: '手机号' }).count()
  if (name === 0 || phone === 0) throw new Error('弹窗缺少姓名/手机号字段')
  await page.click('.el-dialog button:has-text("取消")')
})

await browser.close()
console.log(results.join('\n'))
