#!/bin/bash
# ========================================
#  星课 StarClass · 一键部署
#  适用：全新服务器 / 本机克隆后首次部署
#  用法：bash deploy.sh
#  说明：自动完成 依赖安装 → 数据库初始化+示例数据 → 管理端构建 → 服务启动
# ========================================

set -e

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}${CYAN}"
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║       星课 StarClass — 一键部署                ║"
echo "  ║       Node.js + Express + SQLite              ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo -e "${NC}"

cd "$(dirname "$0")"

# ─── 0. 环境检查 ───
if ! command -v node >/dev/null 2>&1; then
  echo -e "${YELLOW}✗ 未检测到 Node.js，请先安装（>= 18）：https://nodejs.org${NC}"
  exit 1
fi
NODE_MAJOR=$(node -e 'console.log(process.versions.node.split(".")[0])')
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo -e "${YELLOW}✗ 当前 Node $(node -v) 过低，better-sqlite3 要求 >= 18。请升级后重试：https://nodejs.org${NC}"
  echo -e "${YELLOW}  （macOS 可用 brew install node@20 或 nvm install 20）${NC}"
  exit 1
fi

# ─── 0.5 生产安全提示 ───
if [ -z "$JWT_SECRET" ]; then
  echo -e "${YELLOW}⚠ 未设置 JWT_SECRET。开发模式可用默认密钥；生产部署请先执行：${NC}"
  echo -e "${YELLOW}    export JWT_SECRET=\$(openssl rand -hex 32)${NC}"
  echo -e "${YELLOW}  （生产环境未设置时后端会拒绝启动）${NC}\n"
fi

# ─── 1. 安装依赖 ───
# 优先 npm ci（严格按 lock 复现构建，最快）；无 lock 或失败时回退 npm install
echo -e "\n${BOLD}━━━ [1/4] 安装依赖 ━━━${NC}"
(cd backend && { npm ci --omit=dev --no-audit --no-fund 2>/dev/null || npm install --omit=dev --no-audit --no-fund; })
(cd web-admin && { npm ci --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund; })
echo -e "${GREEN}✓ 依赖安装完成${NC}"

# ─── 2. 初始化数据库（已存在则跳过，绝不覆盖已有数据）───
echo -e "\n${BOLD}━━━ [2/4] 初始化数据库 ━━━${NC}"
if [ ! -f "backend/db/data.db" ]; then
  (cd backend && node db/init.js && node db/seed.js)
  echo -e "${GREEN}✓ 数据库已初始化 + 示例数据就绪${NC}"
else
  echo -e "${GREEN}✓ 检测到已有数据库，跳过初始化（数据不会被动）${NC}"
fi

# ─── 3. 构建管理端 ───
echo -e "\n${BOLD}━━━ [3/4] 构建管理端 ━━━${NC}"
(cd web-admin && npm run build)
echo -e "${GREEN}✓ 构建完成（由后端 :3001 托管，单入口）${NC}"

# ─── 4. 停旧进程 + 启动 ───
echo -e "\n${BOLD}━━━ [4/4] 启动服务 ━━━${NC}"
bash stop-all.sh >/dev/null 2>&1 || true
nohup node backend/server.js > backend.log 2>&1 &
echo $! > backend.pid

# 健康检查轮询（最多约 15 秒，兼容慢机器冷启动）
HEALTH="✗ 未通过，请查看日志：tail -50 backend.log"
for _ in $(seq 1 15); do
  if curl -sf http://localhost:3001/api/health >/dev/null 2>&1; then
    HEALTH="✓"
    break
  fi
  sleep 1
done

echo -e "\n${BOLD}${CYAN}"
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║  ✅ 部署完成！                                 ║"
echo "  ║                                               ║"
echo "  ║  🖥️  管理后台：http://localhost:3001           ║"
echo "  ║      账号 13800000001 / 123456（示例数据）     ║"
echo "  ║  ⚙️  后端 API：http://localhost:3001/api       ║"
echo "  ║                                               ║"
echo "  ║  📱 小程序：微信开发者工具导入 miniprogram/    ║"
echo "  ║      开发版自动连本机 :3001                    ║"
echo "  ║                                               ║"
echo "  ║  🛑 停止：bash stop-all.sh                     ║"
echo "  ║  📖 部署上线（域名/HTTPS/小程序发布）：         ║"
echo "  ║     见《部署上线说明.md》                       ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "健康检查：http://localhost:3001/api/health ${GREEN}${HEALTH}${NC}"
