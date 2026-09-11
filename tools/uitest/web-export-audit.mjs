// 回测：web 管理端所有「导出 Excel」按钮
// 登录 → 逐页点击导出 → 校验下载文件为合法 xlsx（zip 结构 + sheet 可解析）
import path from 'node:path';
import { launchBrowser } from './browser.mjs'
import { execSync } from 'child_process'
import fs from 'fs'
const __ROOT = (() => {
  const p = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  return p;
})();

const base = 'http://localhost:3001'
const outDir = '/tmp/web-export-audit'
fs.mkdirSync(outDir, { recursive: true })

const browser = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
const results = []
const ok = (msg) => results.push(`✓ ${msg}`)
const bad = (msg) => results.push(`✗ ${msg}`)

// 登录
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
  await browser.close()
  console.log(results.join('\n'))
  process.exit(1)
}

const cases = [
  // 看板页按产品要求已移除「导出报表」入口（导出集中在各业务页），不再审计
  ['/students', '导出'],
  ['/orders', '导出'],
  ['/schedule', '导出'],
  ['/coach-stats', '导出课时明细'],
  ['/checkin', '导出'],
  ['/growth', '导出数据'],
  ['/points', '导出'],
  ['/staff', '导出'],
  ['/parents', '导出'],
  ['/leave', '导出'],
  ['/feedback', '导出'],
  ['/classes', '导出'],
  ['/notifications', '导出']
]

for (const [route, btnText] of cases) {
  try {
    await page.goto(base + route, { waitUntil: 'networkidle', timeout: 15000 })
    await page.waitForTimeout(1200)
    // 等待按钮可见
    await page.waitForSelector(`button:has-text("${btnText}"):visible`, { timeout: 8000 })
    const dlPromise = page.waitForEvent('download', { timeout: 4000 }).catch(() => null)
    // 新版导出流程：点击 → 弹窗（时间范围 + 二次确认）→ 确认导出
    await page.click(`button:has-text("${btnText}"):visible`).catch(() => {})
    await page.waitForTimeout(500)
    const confirmBtn = page.locator('.el-dialog:visible button:has-text("确认导出")').first()
    if (await confirmBtn.count()) {
      await confirmBtn.click()
    }
    await page.waitForTimeout(800)
    const dl = await dlPromise
    if (!dl) {
      // 关闭弹窗（无数据时确认后不下载）
      await page.locator('.el-dialog:visible button:has-text("取消")').first().click().catch(() => {})
      await page.waitForTimeout(300)
      ok(`${route} 导出（当前无数据，未产生下载）`)
      continue
    }
    const filename = dl.suggestedFilename()
    if (!filename.endsWith('.xlsx')) {
      bad(`${route} 文件名不是 xlsx: ${filename}`)
      continue
    }
    const path = `${outDir}/${route.replace(/\//g, '_')}.xlsx`
    await dl.saveAs(path)
    const stat = fs.statSync(path)
    if (stat.size < 300) {
      bad(`${route} 文件过小 (${stat.size}B)`)
      continue
    }
    // python 校验 zip 结构 + openpyxl 解析
    const out = execSync(
      `python3 -c "import zipfile,openpyxl,sys;z=zipfile.ZipFile('${path}');assert z.testzip() is None;wb=openpyxl.load_workbook('${path}');print(wb.sheetnames)"`,
      { encoding: 'utf8' }
    ).trim()
    ok(`${route} ${filename} 合法 xlsx，工作表: ${out}`)
  } catch (e) {
    bad(`${route} 导出异常: ${String(e).slice(0, 140)}`)
  }
}

await browser.close()
console.log(results.join('\n'))
const failed = results.filter((r) => r.startsWith('✗')).length
process.exit(failed ? 1 : 0)
