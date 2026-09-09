#!/usr/bin/env node
/**
 * wxss Token 化脚本
 * 将裸 px 字号/圆角映射到 variables.wxss 中的设计 token。
 * 用法: node tools/tokenize-wxss.mjs [--check]
 *   --check 仅报告不修改
 */
import fs from 'fs';
import path from 'path';

const CHECK = process.argv.includes('--check');
const BASE = path.resolve('miniprogram/pages');

// 字号映射（裸值 -> token）
const FONT_MAP = {
  28: 'var(--font-hero)',
  20: 'var(--font-display)',
  17: 'var(--font-title)',
  16: 'var(--font-subtitle)',
  15: 'var(--font-body)',
  14: 'var(--font-body)',
  13: 'var(--font-caption)',
  12: 'var(--font-tag)',
  11: 'var(--font-tag)',
  10: 'var(--font-micro)',
};

// 圆角映射
const RADIUS_MAP = {
  8: 'var(--r-sm)',
  10: 'var(--r-md)',
  12: 'var(--r-lg)',
  16: 'var(--r-xl)',
  9999: 'var(--r-full)',
  999: 'var(--r-full)',
};

function tokenize(rel) {
  const abs = path.join(BASE, rel);
  if (!fs.existsSync(abs)) return;
  let src = fs.readFileSync(abs, 'utf8');
  let changes = 0;

  // 字号：font-size: Npx  ->  var(--font-*)
  src = src.replace(/font-size:\s*(\d+)px/g, (m, n) => {
    const t = FONT_MAP[n];
    if (t) { changes++; return `font-size: ${t}`; }
    return m;
  });

  // 圆角：border-radius: Npx -> var(--r-*)
  src = src.replace(/border-radius:\s*(\d+)px/g, (m, n) => {
    const t = RADIUS_MAP[n];
    if (t) { changes++; return `border-radius: ${t}`; }
    return m;
  });

  if (changes > 0) {
    if (CHECK) {
      console.log(`[check] ${rel}: ${changes} 处可映射`);
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
    else if (name.endsWith('.wxss')) {
      tokenize(path.relative(BASE, p));
    }
  }
}

walk(BASE);
console.log(CHECK ? '--- 检查完成 ---' : '--- 转换完成 ---');
