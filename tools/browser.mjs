// Web 审计套件共享的浏览器入口：自动解析 playwright（项目本地 → 全局常见路径），
// 浏览器可执行文件优先读环境变量 CHROMIUM_PATH，未设置时用 playwright 自带 Chromium。
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import path from 'node:path'

const require = createRequire(import.meta.url)

function tryLoad() {
  try { return require('playwright') } catch {}
  const candidates = []
  try {
    const root = execSync('npm root -g', { encoding: 'utf8' }).trim()
    candidates.push(path.join(root, 'playwright'))
  } catch {}
  candidates.push('/opt/homebrew/lib/node_modules/playwright', '/usr/local/lib/node_modules/playwright')
  for (const c of candidates) {
    try { return require(c) } catch {}
  }
  throw new Error('未找到 playwright。安装：npm install -g playwright && npx playwright install chromium')
}

const { chromium } = tryLoad()

export function launchBrowser(opts = {}) {
  return chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    ...opts,
  })
}

export { chromium }
