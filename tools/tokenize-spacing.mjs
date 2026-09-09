#!/usr/bin/env node
/**
 * 间距 Token 化脚本
 * 将 margin/padding/gap 的裸 px 映射到 variables.wxss 的间距 token。
 * 映射规则（仅精确等价，避免视觉回归）：
 *   4px → var(--s1)
 *   8px → var(--s2)
 *   12px→ var(--s3)
 *   16px→ var(--s4)
 *   20px→ var(--s5)
 *   24px→ var(--s6)
 * 其余中间值（2/3/5/6/10/14/18/22px 等）保留原值，它们是刻意微调
 */
import fs from 'fs';
import path from 'path';

const CHECK = process.argv.includes('--check');
const BASE = path.resolve('miniprogram/pages');

function nearest(n) {
  const map = { 4: 'var(--s1)', 8: 'var(--s2)', 12: 'var(--s3)', 16: 'var(--s4)', 20: 'var(--s5)', 24: 'var(--s6)' };
  return map[n] || null;
}

function tokenize(rel) {
  const abs = path.join(BASE, rel);
  if (!fs.existsSync(abs)) return;
  let src = fs.readFileSync(abs, 'utf8');
  let changes = 0;

  // 匹配 margin/padding/gap: Npx 或 margin-top: Npx 等
  src = src.replace(/(margin|padding|gap)(?:-(top|bottom|left|right))?:\s*(\d+)px/g, (m, prop, dir, n) => {
    const v = parseInt(n, 10);
    // 仅精确等价映射；其余值保留
    const t = nearest(v);
    if (!t) return m;
    changes++;
    return `${prop}${dir ? '-' + dir : ''}: ${t}`;
  });

  if (changes > 0) {
    if (CHECK) {
      console.log(`[check] ${rel}: ${changes} 处`);
    } else {
      fs.writeFileSync(abs, src);
      console.log(`[fixed] ${rel}: ${changes} 处`);
    }
  }
}

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.wxss')) tokenize(path.relative(BASE, p));
  }
}

walk(BASE);
console.log(CHECK ? '--- 检查完成 ---' : '--- 转换完成 ---');
