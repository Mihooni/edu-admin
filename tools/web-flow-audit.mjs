// web 管理端交互流程实测
import path from 'node:path';
import { launchBrowser } from './browser.mjs'
const __ROOT = (() => {
  const p = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  return p;
})();

// 后端 Express 已内置托管 web-admin 构建产物（SPA 回退），无需单独启动静态服务
const base = 'http://localhost:3001'
const browser = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const results = []

async function step(name, fn) {
  try {
    await fn()
    results.push(`✓ ${name}`)
  } catch (e) {
    results.push(`✗ ${name}: ${String(e).slice(0, 120)}`)
  }
}

// 登录
await step('登录', async () => {
  await page.goto(base + '/login', { waitUntil: 'networkidle' })
  await page.fill('input[placeholder="请输入手机号"]', '13800000001')
  await page.click('text=管理员')
  await page.fill('input[placeholder="请输入登录密码"]', '123456')
  await page.click('button:has-text("登 录")')
  await page.waitForURL('**/dashboard', { timeout: 10000 })
})

// 看板
await step('看板渲染统计卡', async () => {
  await page.waitForSelector('.stat-card, .stat-number, [class*="stat"]', { timeout: 8000 })
})

// 成员管理：字段设置含新字段
await step('成员管理-字段设置含新列', async () => {
  await page.goto(base + '/students', { waitUntil: 'networkidle' })
  await page.waitForSelector('.el-table', { timeout: 8000 })
  await page.click('button:has-text("字段设置")')
  await page.waitForSelector('.column-list', { timeout: 5000 })
  await page.waitForTimeout(300)
  for (const label of ['年龄', '训练级别', '购买次数', '新购日期', '开始日期']) {
    const el = await page.locator('.column-item', { hasText: label }).count()
    if (el === 0) throw new Error(`缺少字段选项: ${label}`)
  }
  await page.click('.column-settings-pop button:has-text("取消")')
})

// 成员管理：新增成员弹窗含训练级别
await step('成员管理-新增弹窗含训练级别', async () => {
  await page.click('button:has-text("新建成员")')
  await page.waitForSelector('.el-dialog', { timeout: 5000 })
  await page.click('.more-toggle')
  await page.waitForTimeout(200)
  const level = await page.locator('.el-dialog', { hasText: '训练级别' }).count()
  if (level === 0) throw new Error('新增弹窗缺少训练级别字段')
  await page.click('.el-dialog button:has-text("取消")')
})

// 销售管理：新建销售单弹窗
await step('销售管理-新建销售单弹窗', async () => {
  await page.goto(base + '/orders', { waitUntil: 'networkidle' })
  await page.waitForSelector('.el-table', { timeout: 8000 })
  await page.click('button:has-text("新建销售单"), button:has-text("新增销售")')
  await page.waitForSelector('.el-dialog', { timeout: 5000 })
  const ok = await page.locator('.el-dialog', { hasText: '产品服务' }).count()
  if (ok === 0) throw new Error('销售弹窗缺少产品选择')
  await page.click('.el-dialog button:has-text("取消")')
})

// 排期管理：重复规则选项
await step('排期管理-重复规则选项', async () => {
  await page.goto(base + '/schedule', { waitUntil: 'networkidle' })
  await page.waitForSelector('.el-table, .week-view', { timeout: 8000 })
  await page.click('button:has-text("新增排期"), button:has-text("新建排期"), button:has-text("新增活动")')
  await page.waitForSelector('.el-dialog', { timeout: 5000 })
  await page.click('.el-dialog .el-select')
  await page.waitForTimeout(400)
  for (const opt of ['不重复', '每天', '每周（选择星期）', '按天数间隔']) {
    const c = await page.locator('.el-select-dropdown__item', { hasText: opt }).count()
    if (c === 0) throw new Error(`缺少重复选项: ${opt}`)
  }
  await page.keyboard.press('Escape')
  await page.click('.el-dialog button:has-text("取消")')
})

// 设置：账号安全 tab
await step('系统设置-账号安全修改密码表单', async () => {
  await page.goto(base + '/settings', { waitUntil: 'networkidle' })
  await page.waitForSelector('.settings-nav', { timeout: 8000 })
  await page.click('.nav-item:has-text("账号安全")')
  await page.waitForSelector('input[placeholder="请输入原密码"]', { timeout: 5000 })
  const ok = await page.locator('input[placeholder="6-20 位新密码"]').count()
  if (ok === 0) throw new Error('缺少新密码输入框')
})

await browser.close()
console.log(results.join('\n'))
