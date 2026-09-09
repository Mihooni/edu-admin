// 小程序深度审计：页面注册 / 跳转目标存在性 / JS 语法
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
const __ROOT = (() => {
  const p = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  return p;
})();
const root = `${__ROOT}/miniprogram`
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
const pages = new Set(app.pages)
const tabPages = new Set((app.tabBar?.list || []).map((t) => t.pagePath))
const issues = []
const NAV_RE = /(?:wx\.(?:navigateTo|redirectTo|reLaunch|switchTab)\(\{\s*url:\s*['"])([^'"]+)/g
const NAV_RE2 = /(?:navigateTo|redirectTo|reLaunch|switchTab)\('([^']+)'/g

// 1) JS 语法检查
for (const p of app.pages) {
  const js = path.join(root, p + '.js')
  if (!fs.existsSync(js)) { issues.push(`缺 JS: ${p}`); continue }
  try { execSync(`node --check "${js}"`, { stdio: 'pipe' }) }
  catch (e) { issues.push(`语法错误: ${p}`) }
}

// 2) 跳转目标检查
for (const p of app.pages) {
  const js = path.join(root, p + '.js')
  if (!fs.existsSync(js)) continue
  const src = fs.readFileSync(js, 'utf8')
  let m
  const re = new RegExp('(wx\\.(?:navigateTo|redirectTo|reLaunch|switchTab)\\(\\{\\s*url:\\s*[\'"`])([^\'"`]+)', 'g')
  while ((m = re.exec(src))) {
    let url = m[2].split('?')[0].replace(/^\//, '')
    if (pages.has(url) || tabPages.has(url)) continue
    // 相对路径（../ 或 ./）跳过
    if (url.startsWith('..') || url.startsWith('./')) continue
    issues.push(`${p} → 目标页面不存在: ${m[2]}`)
  }
}

// 3) tabBar 页面必须在 pages 中
for (const t of tabPages) {
  if (!pages.has(t)) issues.push(`tabBar 页面未注册: ${t}`)
}

// 3.5) 页面方法自调用检查：`this._xxx(` / `this.xxx(` 必须能在当前 Page 对象中找到定义
// （防止“调用不存在的方法”在真实数据路径上运行时抛 TypeError，静态结构检查无法发现）
for (const p of app.pages) {
  const js = path.join(root, p + '.js')
  if (!fs.existsSync(js)) continue
  const src = fs.readFileSync(js, 'utf8')
  const pageBlock = src.match(/Page\(\{([\s\S]*?)\n\}\)/)
  if (!pageBlock) continue
  const defined = new Set()
  for (const dm of pageBlock[1].matchAll(/^\s{2}(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/gm)) defined.add(dm[1])
  const calls = new Set()
  for (const cm of pageBlock[1].matchAll(/this\.([A-Za-z_$][\w$]*)\s*\(/g)) {
    // 忽略 Promise/内置方法（非本页定义的方法调用）
    if (['setData', 'getTabBar', 'selectComponent', 'createSelectorQuery'].includes(cm[1])) continue
    calls.add(cm[1])
  }
  for (const c of calls) {
    if (!defined.has(c) && !['_stopPropagation'].includes(c)) {
      // 跳过可能来自父类/全局注入的常见方法
      if (!['stopPullDownRefresh', 'navigateBack', 'switchTab', 'navigateTo'].includes(c)) {
        issues.push(`${p}: 调用了未定义方法 this.${c}()`)
      }
    }
  }
}

// 4) emoji 残留检查（用户要求界面无 emoji，统一使用 svg 图标）
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/u
for (const dir of ['pages', 'components', 'custom-tab-bar']) {
  const base = path.join(root, dir)
  if (!fs.existsSync(base)) continue
  const walk = (d) => {
    for (const name of fs.readdirSync(d)) {
      const full = path.join(d, name)
      const st = fs.statSync(full)
      if (st.isDirectory()) walk(full)
      else if (/\.(wxml|js)$/.test(name)) {
        const src = fs.readFileSync(full, 'utf8')
        if (EMOJI_RE.test(src)) issues.push(`emoji 残留: ${full.replace(root + '/', '')}`)
      }
    }
  }
  walk(base)
}

console.log('pages:', pages.size, 'tabBar:', tabPages.size)
console.log(issues.length ? '--- issues ---\n' + issues.join('\n') : '--- issues: none ---')
