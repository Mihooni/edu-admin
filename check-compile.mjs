/**
 * 小程序编译校验（使用微信开发者工具官方编译器 wcsc / wcc）
 * 用法：node check-compile.mjs
 * 作用：本地即可验证 WXSS/WXML 能否通过微信编译器，不必每次打开 DevTools
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, dirname, resolve } from 'path'
import { execFileSync } from 'child_process'

const root = join(process.cwd(), 'miniprogram')
const devtoolsApps = [
  '/Applications/wechatwebdevtools.app/Contents/Resources/app.asar.unpacked/node_modules/wcc-exec/wcsc',
  '/Applications/微信开发者工具.app/Contents/Resources/app.asar.unpacked/node_modules/wcc-exec/wcsc',
]

const wcsc = devtoolsApps.find((p) => existsSync(p))
const wcc = wcsc ? wcsc.replace(/wcsc$/, 'wcc') : null

if (!wcsc || !existsSync(wcc)) {
  console.error('未找到微信开发者工具编译器（wcsc/wcc），请先安装微信开发者工具')
  process.exit(1)
}

let failed = 0

// 1. WXSS：编译所有 wxss（含各自的 @import 依赖）
const wxssFiles = []
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (p.endsWith('.wxss')) wxssFiles.push(p)
  }
}
walk(root)

for (const f of wxssFiles) {
  const src = readFileSync(f, 'utf8')
  const imports = [...src.matchAll(/@import\s+['"]([^'"]+)['"]/g)]
    .map((m) => resolve(dirname(f), m[1]))
  try {
    execFileSync(wcsc, ['-o', '/dev/null', f, ...imports], { stdio: 'pipe' })
  } catch (e) {
    failed++
    const out = (e.stdout?.toString() || '') + (e.stderr?.toString() || '')
    console.log('WXSS 编译失败:', f.replace(root + '/', ''))
    console.log(out.split('\n').slice(0, 6).join('\n'))
  }
}

// 2. WXML：编译整个小程序（读 app.json 全部页面）
try {
  const appJson = join(root, 'app.json')
  const out = '/tmp/miniprogram-wxml-check.js'
  execFileSync(wcc, ['-o', out, appJson], { stdio: 'pipe' })
} catch (e) {
  failed++
  const out = (e.stdout?.toString() || '') + (e.stderr?.toString() || '')
  console.log('WXML 编译失败:')
  console.log(out.split('\n').slice(0, 8).join('\n'))
}

if (failed) {
  console.log(`\n共 ${failed} 处编译失败`)
  process.exit(1)
}
console.log(`编译校验通过：${wxssFiles.length} 个 wxss + 全部页面 WXML`)
