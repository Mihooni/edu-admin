// 请假审批 UI 实测：登录 → 请假管理 → 通过待审批申请
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

// 前置：创建明日测试排课 + 家长提交待审批请假
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
    courseName: '请假审计课',
    maxStudents: 0,
    remark: 'AUDIT-请假测试',
  }, admin.data.openid)
  if (r.code !== 0) throw new Error('创建排课失败: ' + (r.message || ''))
  testScheduleId = r.data && (r.data.id || r.data.scheduleId)
  const lr = await api('/leave/apply', 'POST', { scheduleId: testScheduleId, reason: 'UI审批测试请假' }, parent.data.openid)
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

await step('请假管理页渲染', async () => {
  await page.goto(base + '/leave', { waitUntil: 'networkidle' })
  await page.waitForSelector('.el-table', { timeout: 8000 })
})

await step('找到待审批申请并点击通过', async () => {
  const row = await page.locator('.el-table__row', { hasText: 'UI审批测试请假' }).count()
  if (row === 0) throw new Error('未找到测试请假申请')
  const approve = await page.locator('.el-table__row', { hasText: 'UI审批测试请假' })
    .locator('button:has-text("通过"), button:has-text("同意"), button:has-text("批准")').first()
  const approveCount = await approve.count()
  if (approveCount === 0) {
    // 尝试点击行内的其他操作按钮（如"处理"）
    await page.locator('.el-table__row', { hasText: 'UI审批测试请假' })
      .locator('button').first().click()
    await page.waitForTimeout(600)
  } else {
    await approve.click()
    await page.waitForTimeout(600)
  }
  // 确认弹窗
  const confirmBtn = await page.locator('.el-message-box button:has-text("批准")').count()
  if (confirmBtn > 0) await page.locator('.el-message-box button:has-text("批准")').first().click()
  await page.waitForTimeout(1000)
})

await step('审批后状态为已批准', async () => {
  await page.goto(base + '/leave?status=approved', { waitUntil: 'networkidle' })
  await page.waitForSelector('.el-table', { timeout: 8000 })
  const row = await page.locator('.el-table__row', { hasText: 'UI审批测试请假' }).count()
  if (row === 0) throw new Error('批准后未在已批准列表找到该申请')
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
  db.prepare("DELETE FROM leave_requests WHERE reason = 'UI审批测试请假'").run()
})

await browser.close()
console.log(results.join('\n'))
process.exit(results.some((r) => r.startsWith('✗')) ? 1 : 0)
