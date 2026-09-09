/**
 * 管理端页面事件处理器完整性检查
 * 扫描全部页面 WXML 中 bind/catch 事件引用的方法是否在对应 JS 中定义
 */
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

const root = join(process.cwd(), 'miniprogram', 'pages')
const pages = readdirSync(root)

let issues = 0
for (const p of pages) {
  const wxmlPath = join(root, p, p + '.wxml')
  const jsPath = join(root, p, p + '.js')
  if (!existsSync(wxmlPath) || !existsSync(jsPath)) continue
  const w = readFileSync(wxmlPath, 'utf8')
  const j = readFileSync(jsPath, 'utf8')
  const handlers = new Set()
  const re = /(?:bind|catch)(?:tap|change|input|confirm|touchstart|touchend|load|error)="([A-Za-z_][A-Za-z0-9_]*)"/g
  for (const m of w.matchAll(re)) handlers.add(m[1])
  for (const h of handlers) {
    const defined =
      new RegExp('\\n\\s*' + h + '\\s*\\(').test(j) ||
      new RegExp(h + '\\s*:\\s*function').test(j) ||
      new RegExp(h + '\\s*\\(').test(j)
    if (!defined) {
      console.log('✗ ' + p + ' → 事件 ' + h + ' 未在 JS 中定义')
      issues++
    }
  }
}

console.log(issues ? '发现 ' + issues + ' 个问题' : '✓ 所有管理页事件处理器均已定义')
process.exit(issues ? 1 : 0)
