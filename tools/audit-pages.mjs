import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 路径基于脚本位置解析，保证从任意目录运行都指向 miniprogram/pages
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../miniprogram');
const pagesDir = path.join(root, 'pages');
if (!fs.existsSync(pagesDir)) {
  console.error(`未找到小程序 pages 目录：${pagesDir}`);
  process.exit(1);
}
const pageDirs = fs.readdirSync(pagesDir).filter((d) => fs.existsSync(path.join(pagesDir, d, d + '.js')));
const pageSet = new Set(pageDirs.map((d) => '/pages/' + d + '/' + d));
console.log('pages:', pageDirs.length);

const issues = [];
const BIND_RE = /(?:bind|catch)[a-z-]*\s*=\s*"([A-Za-z_][A-Za-z0-9_]*)"/g;

for (const d of pageDirs) {
  const base = path.join(pagesDir, d, d);
  const js = fs.readFileSync(base + '.js', 'utf8');
  const wxml = fs.readFileSync(base + '.wxml', 'utf8');

  // 1. check bind events have handlers
  for (const m of wxml.matchAll(BIND_RE)) {
    const fn = m[1];
    const hasHandler =
      new RegExp('\\b' + fn + '\\s*\\(').test(js) || new RegExp('\\b' + fn + '\\s*:').test(js);
    if (!hasHandler) issues.push(`${d}: missing handler ${fn}`);
  }

  // 2. check usingComponents in json
  const json = JSON.parse(fs.readFileSync(base + '.json', 'utf8'));
  for (const [key, compPath] of Object.entries(json.usingComponents || {})) {
    // 组件路径：以 / 开头时相对小程序根目录，否则相对页面所在目录
    const resolved = compPath.startsWith('/')
      ? path.join(root, compPath.slice(1))
      : path.join(path.dirname(base + '.json'), compPath);
    if (!fs.existsSync(resolved + '.js') || !fs.existsSync(resolved + '.json')) {
      issues.push(`${d}: missing component ${key} at ${compPath}`);
    }
  }

  // 3. check template/import refs
  for (const m of wxml.matchAll(/import src="([^"]+)"/g)) {
    const p = path.resolve(path.dirname(base + '.wxml'), m[1]);
    if (!fs.existsSync(p)) issues.push(`${d}: missing import ${m[1]}`);
  }

  // 4. check navigation urls in wxml
  for (const m of wxml.matchAll(/(?:url|href)="(\/pages\/[^"]+)"/g)) {
    const u = m[1].split('?')[0];
    if (!pageSet.has(u)) issues.push(`${d}: missing nav target ${u}`);
  }

  // 5. check navigation urls in js
  for (const m of js.matchAll(/['"](\/pages\/[^'"]+)['"]/g)) {
    const u = m[1].split('?')[0];
    if (!pageSet.has(u)) issues.push(`${d}: js nav to missing ${u}`);
  }
}

console.log('--- issues ---');
console.log(issues.length ? issues.join('\n') : 'none');
