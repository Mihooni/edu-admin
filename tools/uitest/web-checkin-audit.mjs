// 签到管理页交互实测
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

// 前置：为今天创建一节测试排课（签到页需要当日课程才能操作）
let testScheduleId = ''
async function api(path, method = 'GET', body = null, openid = '') {
  const res = await fetch(base + '/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(openid ? { 'x-openid': openid } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

await step('前置-创建今日测试排课', async () => {
  const login = await api('/auth/login', 'POST', { phone: '13800000001', role: 'admin', password: '123456' })
  const oid = login.data.openid
  const today = new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD（本地时区）
  const r = await api('/schedules', 'POST', {
    date: today,
    startTime: '20:00',
    endTime: '21:00',
    courseName: '签到测试课',
    maxStudents: 0,
    remark: 'AUDIT-签到测试',
  }, oid)
  if (r.code !== 0) throw new Error('创建排课失败: ' + (r.message || ''))
  testScheduleId = r.data && (r.data.id || r.data.scheduleId)
  if (!testScheduleId) throw new Error('未返回排课 ID')
})

await step('登录', async () => {
  await page.goto(base + '/login', { waitUntil: 'networkidle' })
  await page.fill('input[placeholder="请输入手机号"]', '13800000001')
  await page.click('text=管理员')
  await page.fill('input[placeholder="请输入登录密码"]', '123456')
  await page.click('button:has-text("登 录")')
  await page.waitForURL('**/dashboard', { timeout: 10000 })
})

await step('签到页渲染', async () => {
  await page.goto(base + '/checkin', { waitUntil: 'networkidle' })
  await page.waitForSelector('.el-table, [class*="course"], [class*="day"]', { timeout: 8000 })
})

await step('一键全到按钮存在', async () => {
  await page.waitForSelector('.course-card', { timeout: 8000 })
  await page.click('.course-card')
  await page.waitForTimeout(500)
  const c = await page.locator('button:has-text("一键全到")').count()
  if (c === 0) throw new Error('缺少一键全到按钮')
})

await step('确认到场按钮存在', async () => {
  const c = await page.locator('button:has-text("确认到场")').count()
  if (c === 0) throw new Error('缺少确认到场按钮')
})

await step('一键全到并确认到场', async () => {
  await page.click('button:has-text("一键全到")')
  await page.waitForTimeout(300)
  await page.click('button:has-text("确认到场")')
  await page.waitForTimeout(1000)
  // 确认后出现成功提示或列表刷新
  const toast = await page.locator('.el-message--success').count()
  results.push(`  成功提示: ${toast > 0 ? '有' : '无(可能已自动消失)'}`)
})

// 清理：删除测试排课
await step('清理-删除测试排课', async () => {
  if (!testScheduleId) return
  const login = await api('/auth/login', 'POST', { phone: '13800000001', role: 'admin', password: '123456' })
  const oid = login.data.openid
  const r = await api('/schedules/' + testScheduleId, 'DELETE', null, oid)
  if (r.code !== 0) throw new Error('删除测试排课失败: ' + (r.message || ''))
})

await browser.close()
console.log(results.join('\n'))
process.exit(results.some((r) => r.startsWith('✗')) ? 1 : 0)
