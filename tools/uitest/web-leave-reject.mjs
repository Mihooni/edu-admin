// 请假驳回 UI 实测
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

// 前置：创建明日测试排课 + 家长提交待驳回请假
let testScheduleId = ''
async function api(path, method = 'GET', body = null, openid = '') {
  const res = await fetch(base + '/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(openid ? { 'x-openid': openid } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

await step('前置-创建排课并提交请假', async () => {
  const admin = await api('/auth/login', 'POST', { phone: '13800000001', role: 'admin', password: '123456' })
  const parent = await api('/auth/login', 'POST', { phone: '13900000001', role: 'parent' })
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('sv-SE')
  const r = await api('/schedules', 'POST', {
    date: tomorrow,
    startTime: '18:00',
    endTime: '19:00',
    courseName: '驳回审计课',
    maxStudents: 0,
    remark: 'AUDIT-驳回测试',
  }, admin.data.openid)
  if (r.code !== 0) throw new Error('创建排课失败: ' + (r.message || ''))
  testScheduleId = r.data && (r.data.id || r.data.scheduleId)
  const lr = await api('/leave/apply', 'POST', { scheduleId: testScheduleId, reason: 'UI驳回测试请假' }, parent.data.openid)
  if (lr.code !== 0) throw new Error('提交请假失败: ' + (lr.message || ''))
})

await step('登录', async () => {
  await page.goto(base + '/login', { waitUntil: 'networkidle' })
  await page.fill('input[placeholder="请输入手机号"]', '13800000001')
  await page.click('text=管理员')
  await page.fill('input[placeholder="请输入登录密码"]', '123456')
  await page.click('button:has-text("登 录")')
  await page.waitForURL('**/dashboard', { timeout: 10000 })
})

await step('请假页驳回申请', async () => {
  await page.goto(base + '/leave', { waitUntil: 'networkidle' })
  await page.waitForSelector('.el-table', { timeout: 8000 })
  const row = await page.locator('.el-table__row', { hasText: 'UI驳回测试请假' }).count()
  if (row === 0) throw new Error('未找到测试请假申请')
  await page.locator('.el-table__row', { hasText: 'UI驳回测试请假' })
    .locator('button:has-text("驳回")').first().click()
  await page.waitForTimeout(500)
  // 驳回弹窗：填写原因并确认
  const input = await page.locator('.el-message-box input, .el-message-box textarea').first()
  await input.fill('排期冲突，无法批准')
  await page.waitForTimeout(200)
  const confirm = await page.locator('.el-message-box button:has-text("确认驳回")').first()
  if (await confirm.count() > 0) { await confirm.click(); await page.waitForTimeout(800) }
})

await step('驳回后状态为已驳回', async () => {
  await page.click('.el-radio-button:has-text("已驳回")')
  await page.waitForTimeout(800)
  await page.waitForSelector('.el-table', { timeout: 8000 })
  const row = await page.locator('.el-table__row', { hasText: 'UI驳回测试请假' }).count()
  if (row === 0) throw new Error('驳回后未在已驳回列表找到该申请')
  // 确认状态文本（StatusDot 渲染，非 el-tag）
  const tag = await page.locator('.el-table__row', { hasText: 'UI驳回测试请假' })
    .locator('.status-dot-label', { hasText: '已驳回' }).count()
  if (tag === 0) throw new Error('状态标签不是已驳回')
})

// 清理：删除测试排课与测试请假记录
await step('清理-删除测试数据', async () => {
  const { default: db } = await import('../backend/db/index.js')
  if (testScheduleId) {
    db.prepare('DELETE FROM attendances WHERE schedule_id = ?').run(testScheduleId)
    db.prepare('DELETE FROM leave_requests WHERE schedule_id = ?').run(testScheduleId)
    db.prepare('DELETE FROM enrollments WHERE schedule_id = ?').run(testScheduleId)
    db.prepare('DELETE FROM schedules WHERE id = ?').run(testScheduleId)
  }
  db.prepare("DELETE FROM leave_requests WHERE reason = 'UI驳回测试请假'").run()
})

await browser.close()
console.log(results.join('\n'))
process.exit(results.some((r) => r.startsWith('✗')) ? 1 : 0)
