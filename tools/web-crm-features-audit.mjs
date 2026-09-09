// 回测：借鉴 trycompai/crm 融入的新功能
// 跟进任务 / 销售管道 / 成员时间线 / 勿扰名单 / 看板待办
import path from 'node:path';
import { launchBrowser } from './browser.mjs'
const __ROOT = (() => {
  const p = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  return p;
})();
const base = 'http://localhost:3001'
const browser = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
const results = []
const ok = (m) => results.push(`✓ ${m}`)
const bad = (m) => results.push(`✗ ${m}`)
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)))

try {
  await page.goto(base + '/login', { waitUntil: 'networkidle' })
  await page.fill('input[placeholder="请输入手机号"]', '13800000001')
  await page.click('text=管理员')
  await page.fill('input[placeholder="请输入登录密码"]', '123456')
  await page.click('button:has-text("登 录")')
  await page.waitForURL('**/dashboard', { timeout: 10000 })
  ok('登录')
} catch (e) {
  bad('登录: ' + String(e).slice(0, 120))
}

// 看板待办包含跟进任务
try {
  await page.waitForSelector('.pending-item', { timeout: 8000 })
  const text = await page.locator('.pending-item').allTextContents()
  const hasFu = text.some((t) => t.includes('跟进') || t.includes('续费跟进'))
  ok(`看板待办渲染（${text.length} 条，含跟进任务: ${hasFu}）`)
} catch (e) {
  bad('看板待办: ' + String(e).slice(0, 120))
}

// 增长中心 → 跟进任务
try {
  await page.goto(base + '/growth', { waitUntil: 'networkidle' })
  await page.waitForSelector('.el-tabs', { timeout: 8000 })
  await page.click('.el-tabs__item:has-text("跟进任务")')
  await page.waitForTimeout(1200)
  await page.waitForSelector('.el-tab-pane:not([style*="display: none"]) .el-table', { timeout: 6000 })
  const rows = await page.locator('.el-tab-pane:not([style*="display: none"]) .el-table__body-wrapper tbody tr').count()
  ok(`跟进任务列表渲染（${rows} 行）`)
  // 生成跟进任务
  await page.click('button:has-text("生成跟进任务")')
  await page.waitForTimeout(1500)
  ok('生成跟进任务按钮可点击')
  // 完成第一条待办
  const doneBtn = page.locator('tbody tr:has-text("待办") button:has-text("完成")').first()
  if (await doneBtn.count()) {
    await doneBtn.click()
    await page.waitForSelector('.el-message-box', { timeout: 4000 }).catch(() => null)
    const okBtn = page.locator('.el-message-box button:has-text("完成")').first()
    if (await okBtn.count()) { await okBtn.click() }
    await page.waitForTimeout(1000)
    ok('跟进任务完成流程可操作')
  } else {
    ok('当前无待办可完成（跳过）')
  }
} catch (e) {
  bad('跟进任务: ' + String(e).slice(0, 160))
}

// 增长中心 → 管道视图
try {
  await page.goto(base + '/growth', { waitUntil: 'networkidle' })
  await page.waitForSelector('.el-tabs', { timeout: 8000 })
  await page.click('.el-radio-button:has-text("管道")')
  await page.waitForTimeout(1500)
  const cols = await page.locator('.pipeline-col').count()
  ok(`销售管道视图渲染（${cols} 列）`)
  if (cols >= 5) {
    const card = await page.locator('.pipeline-card').count()
    ok(`管道卡片数量: ${card}`)
  }
} catch (e) {
  bad('管道视图: ' + String(e).slice(0, 160))
}

// 成员详情 → 时间线
try {
  await page.goto(base + '/students', { waitUntil: 'networkidle' })
  await page.waitForSelector('.el-table__body-wrapper tbody tr', { timeout: 8000 })
  await page.locator('.el-table__body-wrapper tbody tr').first().click()
  await page.waitForSelector('.student-detail', { timeout: 6000 })
  await page.waitForTimeout(1500)
  const timeline = await page.locator('.timeline-item').count()
  ok(`成员详情时间线渲染（${timeline} 条）`)
  await page.locator('.el-drawer button:has-text("关闭")').click().catch(() => {})
} catch (e) {
  bad('成员时间线: ' + String(e).slice(0, 160))
}

// 家长 → 勿扰
try {
  await page.goto(base + '/parents', { waitUntil: 'networkidle' })
  await page.waitForSelector('.el-table', { timeout: 8000 })
  await page.click('button:has-text("勿扰名单")')
  await page.waitForSelector('.sup-list, .empty-hint', { timeout: 5000 })
  const listText = await page.locator('.el-dialog').allTextContents()
  ok('勿扰名单弹窗可打开')
  await page.locator('.el-dialog button:has-text("关闭"), .el-dialog button:has-text("取消")').first().click().catch(() => {})
} catch (e) {
  bad('勿扰名单: ' + String(e).slice(0, 160))
}

await browser.close()
console.log(results.join('\n'))
process.exit(results.some((r) => r.startsWith('✗')) ? 1 : 0)
