/**
 * 前端 API 调用与后端路由匹配审计
 * 从 backend/server.js 解析资源挂载映射（/api/<resource> → 路由文件），
 * 扫描小程序 request(resource, action) 调用，确认每个调用都能命中后端路由。
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const root = process.cwd()

// 1. 解析 server.js 挂载映射
const server = readFileSync(join(root, 'backend', 'server.js'), 'utf8')
const mountMap = {}
for (const m of server.matchAll(/app\.use\('\/api\/([a-z-]+)',\s*([A-Za-z]+)Routes\)/g)) {
  mountMap[m[1]] = m[2]
}

// 2. 收集每个路由文件的实际路由
const routes = {}
for (const [resource, file] of Object.entries(mountMap)) {
  // 挂载变量名（如 studentRoutes）→ 实际文件（student.js / students.js）
  const base = file.toLowerCase()
  const candidates = [base + '.js', base + 's.js']
  let src = ''
  for (const c of candidates) {
    try {
      src = readFileSync(join(root, 'backend', 'routes', c), 'utf8')
      break
    } catch (e) { /* 尝试下一个 */ }
  }
  if (!src) {
    console.log('⚠ 未找到路由文件: ' + file + ' (' + resource + ')')
    continue
  }
  routes[resource] = new Set()
  for (const m of src.matchAll(/router\.(?:get|post|put|delete)\('([^']+)'/g)) {
    routes[resource].add(m[1])
  }
}

// 3. 扫描小程序全部 request 调用
const files = []
;(function walk(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n)
    if (statSync(p).isDirectory()) walk(p)
    else if (p.endsWith('.js')) files.push(p)
  }
})('miniprogram')

const calls = {}
for (const f of files) {
  const s = readFileSync(f, 'utf8')
  for (const m of s.matchAll(/request\(\s*'([^']+)'\s*,\s*'([^']*)'/g)) {
    const key = m[1] + '/' + (m[2] || '')
    calls[key] = calls[key] || []
    if (!calls[key].includes(f)) calls[key].push(f)
  }
}

let issues = 0
for (const key of Object.keys(calls).sort()) {
  const slash = key.indexOf('/')
  const res = key.slice(0, slash)
  const act = key.slice(slash + 1)
  const from = calls[key][0]
  if (!routes[res]) {
    console.log('✗ 资源不存在: ' + key + ' <- ' + from)
    issues++
    continue
  }
  if (!act) {
    if (!routes[res].has('/') && !routes[res].has('')) {
      console.log('✗ 基础路由不存在: ' + key + ' <- ' + from)
      issues++
    }
    continue
  }
  const routeSet = routes[res]
  const exact = routeSet.has('/' + act) || routeSet.has(act)
  // 动态拼接（如 'teachers/' + id）：前缀命中 /xxx/:id 或 /xxx/ 模式即视为有效
  const dynamicPrefix = act.endsWith('/') ? act.slice(0, -1) : ''
  const dynamic =
    !!dynamicPrefix &&
    ([...routeSet].some((r) => r === '/' + dynamicPrefix || r.startsWith('/' + dynamicPrefix + '/:')))
  if (!exact && !dynamic) {
    console.log('✗ 动作不存在: ' + key + ' <- ' + from)
    issues++
  }
}

console.log(issues ? '发现 ' + issues + ' 个问题' : '✓ 前端 ' + Object.keys(calls).length + ' 个 API 调用全部命中后端路由')
process.exit(issues ? 1 : 0)
