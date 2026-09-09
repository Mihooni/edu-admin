// 小程序全页面 × 全角色运行认证矩阵
// 用法：node tools/certify.mjs（需后端 :3001 运行中）
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sim = path.join(root, 'tools', 'sim-real.mjs')
const BASE = 'http://localhost:3001/api'

const matrix = {
  parent: ['index', 'schedule', 'schedule-detail', 'membership', 'points', 'points-log', 'profile', 'checkin-record', 'leave', 'feedback', 'order', 'login', 'student-bind', 'notification', 'notification-detail', 'notification-manage'],
  coach: ['index', 'schedule', 'schedule-detail', 'points', 'profile', 'notification', 'admin-checkin'],
  admin: ['index', 'schedule', 'points', 'profile', 'notification', 'notification-manage', 'membership', 'admin-growth'],
}

let pass = 0
const fails = []
// 每角色仅登录一次，缓存 openid 供全部页面复用
const openidByRole = {}
for (const role of Object.keys(matrix)) {
  const login = {
    parent: { phone: '13900000001', role: 'parent' },
    coach: { phone: '13800000011', role: 'coach', password: '123456' },
    admin: { phone: '13800000001', role: 'admin', password: '123456' },
  }[role]
  const res = await fetch(BASE + '/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(login),
  }).then((r) => r.json())
  if (res.code !== 0) {
    console.log(`角色 ${role} 登录失败: ${res.message}`)
    process.exit(1)
  }
  openidByRole[role] = res.data.openid
}

for (const [role, pages] of Object.entries(matrix)) {
  for (const page of pages) {
    try {
      const out = execFileSync('node', [sim, role, page], {
        encoding: 'utf8',
        timeout: 15000,
        env: { ...process.env, SIM_OPENID: openidByRole[role] },
      })
      if (out.includes('[OK]')) pass++
      else fails.push(`${role}/${page}: 未通过`)
    } catch (e) {
      fails.push(`${role}/${page}: ${String(e.message).slice(0, 80)}`)
    }
  }
}

console.log(`认证矩阵：${pass} 通过, ${fails.length} 失败`)
if (fails.length) {
  console.log(fails.join('\n'))
  process.exit(1)
}
