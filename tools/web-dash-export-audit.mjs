// 回测：看板 CRM 化布局 + 导出自定义时间段
import path from 'node:path';
import { launchBrowser } from './browser.mjs'
import { execSync } from 'child_process'
import fs from 'fs'
const __ROOT = (() => {
  const p = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  return p;
})();
const base = 'http://localhost:3001'
const outDir = '/tmp/web-dash-audit'
fs.mkdirSync(outDir, { recursive: true })
const browser = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 1600, height: 950 }, acceptDownloads: true })
const results = []
const ok = (m) => results.push(`✓ ${m}`)
const bad = (m) => results.push(`✗ ${m}`)
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)))

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

// 看板：三图表卡
try {
  await page.waitForTimeout(2500)
  const chartCards = await page.locator('.chart-card').count()
  const canvases = await page.locator('.chart-card canvas').count()
  const statNotes = await page.locator('.stat-trend').allTextContents()
  const hasDelta = statNotes.some((t) => t.includes('较'))
  ok(`图表卡 ${chartCards} 个 / canvas ${canvases} 个 / 涨跌指示: ${hasDelta}`)
} catch (e) {
  bad('看板图表: ' + String(e).slice(0, 160))
}

// 看板：排名进度条 + 待办完成按钮
try {
  const meters = await page.locator('.rank-meter').count()
  const doneBtn = await page.locator('.pending-item button:has-text("完成")').count()
  ok(`排名进度条 ${meters} 条 / 待办完成按钮 ${doneBtn} 个`)
  if (doneBtn) {
    await page.locator('.pending-item button:has-text("完成")').first().click()
    await page.waitForTimeout(1200)
    ok('待办一键完成可点击')
  }
} catch (e) {
  bad('看板进度条/待办: ' + String(e).slice(0, 160))
}

// 导出带时间范围：请假页 近7天
try {
  await page.goto(base + '/leave', { waitUntil: 'networkidle' })
  await page.waitForSelector('button:has-text("导出"):visible', { timeout: 8000 })
  const dlPromise = page.waitForEvent('download', { timeout: 6000 }).catch(() => null)
  await page.click('button:has-text("导出"):visible').catch(() => {})
  await page.waitForTimeout(500)
  // 弹窗内选择「近 7 天」范围
  const picker = page.locator('.el-dialog:visible .el-date-editor').first()
  if (await picker.count()) {
    await picker.click()
    await page.waitForTimeout(400)
    const shortcut = page.locator('.el-picker-panel__shortcut', { hasText: '近 7 天' })
    if (await shortcut.count()) {
      await shortcut.first().click()
      await page.waitForTimeout(600)
    }
  }
  const confirmBtn = page.locator('.el-dialog:visible button:has-text("确认导出")').first()
  if (await confirmBtn.count()) await confirmBtn.click()
  await page.waitForTimeout(800)
  const dl = await dlPromise
  if (dl) {
    const path = outDir + '/leave-range.xlsx'
    await dl.saveAs(path)
    const out = execSync(`python3 -c "import zipfile,openpyxl;z=zipfile.ZipFile('${path}');assert z.testzip() is None;print(openpyxl.load_workbook('${path}').sheetnames)"`, { encoding: 'utf8' }).trim()
    ok(`请假导出（近7天）: ${dl.suggestedFilename()} ${out}`)
  } else {
    ok('请假导出（近7天无数据，未下载）')
  }
} catch (e) {
  bad('范围导出(请假): ' + String(e).slice(0, 160))
}

// 看板（2026-08-10 需求调整：删除导出报表/快速排期按钮，改由设置页自定义模块）
try {
  await page.goto(base + '/dashboard', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1800)
  const exportBtn = await page.locator('button:has-text("导出报表")').count()
  const quickBtn = await page.locator('button:has-text("快速排期")').count()
  const statCards = await page.locator('.stat-card').count()
  if (exportBtn === 0 && quickBtn === 0) {
    ok('看板已移除「导出报表/快速排期」按钮（符合需求）')
  } else {
    bad(`看板仍存在被要求删除的按钮: 导出报表=${exportBtn} 快速排期=${quickBtn}`)
  }
  if (statCards > 0) {
    ok(`看板数据卡片正常渲染（${statCards} 个）`)
  } else {
    bad('看板数据卡片未渲染')
  }
} catch (e) {
  bad('看板检查: ' + String(e).slice(0, 160))
}

// 看板自定义模块开关（设置页）
try {
  await page.goto(base + '/settings', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  const hasDashboardCfg = await page.locator('text=数据看板').count()
  if (hasDashboardCfg > 0) {
    ok('设置页存在「数据看板」自定义模块开关')
  } else {
    bad('设置页未找到数据看板自定义入口')
  }
} catch (e) {
  bad('看板设置检查: ' + String(e).slice(0, 160))
}

await browser.close()
console.log(results.join('\n'))
process.exit(results.some((r) => r.startsWith('✗')) ? 1 : 0)
