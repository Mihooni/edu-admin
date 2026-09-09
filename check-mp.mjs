/**
 * 小程序静态校验（无外部依赖，可在任意 CI / 机器运行）
 * 用法：node check-mp.mjs
 * 作用：
 *   1. app.json 可解析，pages 声明的每个页面四件套（js/wxml/json/wxss）齐全
 *   2. 所有 .js 通过语法解析（new Function 仅解析不执行）
 *   3. 所有 .json 可解析
 * 说明：WXSS/WXML 的深度编译校验需要微信开发者工具（node check-compile.mjs），
 *       本脚本是跨环境的最小可用门禁。
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join } from 'path'

const root = join(process.cwd(), 'miniprogram')
let failures = 0
const fail = (msg) => { failures++; console.error('✗', msg) }

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

// 1. app.json pages 四件套
let app
try {
  app = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8'))
} catch (e) {
  fail(`app.json 解析失败：${e.message}`)
  console.error('无法继续，退出。')
  process.exit(1)
}
const pages = app.pages || []
for (const page of pages) {
  for (const ext of ['.js', '.wxml', '.json', '.wxss']) {
    if (!existsSync(join(root, page + ext))) fail(`页面缺文件：miniprogram/${page}${ext}`)
  }
}
console.log(`✓ app.json 声明 ${pages.length} 个页面，四件套齐全`)

// 2. 所有 JS 语法解析
const files = walk(root)
let jsCount = 0
for (const f of files) {
  if (f.endsWith('.js')) {
    jsCount++
    try { new Function(readFileSync(f, 'utf8')) }
    catch (e) { fail(`JS 语法错误：${f}\n  ${e.message}`) }
  } else if (f.endsWith('.json')) {
    try { JSON.parse(readFileSync(f, 'utf8')) }
    catch (e) { fail(`JSON 解析失败：${f}\n  ${e.message}`) }
  }
}
console.log(`✓ ${jsCount} 个 .js 语法通过，全部 .json 可解析`)

if (failures) {
  console.error(`\n✗ 小程序校验失败：${failures} 个问题`)
  process.exit(1)
}
console.log('\n✔ 小程序静态校验通过')
