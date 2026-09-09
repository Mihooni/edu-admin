#!/bin/bash
# ========================================
#  教务系统一键启动脚本（私有化部署）
# ========================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}${CYAN}"
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║       教务系统 — 一键启动                      ║"
echo "  ║       Node.js + Express + SQLite              ║"
echo "  ║       私有化部署 · 本地运行                    ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo -e "${NC}"

# ─── 第 1 步：检查 Node.js ───
echo -e "\n${BOLD}━━━ 1. 检查环境 ━━━${NC}"
if ! command -v node &> /dev/null; then
  echo -e "${RED}❌ Node.js 未安装！请先安装 Node.js >= 16${NC}"
  echo "   下载地址: https://nodejs.org"
  exit 1
fi
echo -e "${GREEN}✓ Node.js $(node -v)${NC}"

# ─── 第 2 步：安装后端依赖 ───
echo -e "\n${BOLD}━━━ 2. 安装后端依赖 ━━━${NC}"
cd "$(dirname "$0")"
if [ ! -d "backend/node_modules" ]; then
  echo "正在安装后端依赖（首次需要 1-2 分钟）..."
  cd backend && npm install && cd ..
  echo -e "${GREEN}✓ 后端依赖安装完成${NC}"
else
  echo -e "${GREEN}✓ 后端依赖已存在${NC}"
fi

# ─── 第 3 步：初始化数据库 ───
echo -e "\n${BOLD}━━━ 3. 初始化数据库 ━━━${NC}"
cd backend
node db/init.js
echo -e "${GREEN}✓ 数据库初始化完成${NC}"

# ─── 第 4 步：填充示例数据 ───
echo -e "\n${BOLD}━━━ 4. 填充示例数据 ━━━${NC}"
if [ -f "db/data.db" ] && [ "$1" != "--force-seed" ]; then
  echo -e "${CYAN}ℹ 数据库已存在，跳过示例数据填充${NC}"
  echo "  如需重新填充，运行: bash start.sh --force-seed"
else
  node db/seed.js
  echo -e "${GREEN}✓ 示例数据填充完成${NC}"
fi

# ─── 第 5 步：启动后端服务 ───
echo -e "\n${BOLD}━━━ 5. 启动后端服务 ━━━${NC}"
echo -e "${CYAN}🚀 后端服务将运行在 http://localhost:3001${NC}"

# 检查端口是否被占用
if lsof -i :3001 &> /dev/null; then
  echo -e "${CYAN}ℹ 端口 3001 已被占用，尝试重启...${NC}"
  lsof -ti :3001 | xargs kill -9 2>/dev/null || true
  sleep 1
fi

# 后台启动后端
nohup node server.js > ../backend.log 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > ../backend.pid
echo -e "${GREEN}✓ 后端服务已启动 (PID: $BACKEND_PID)${NC}"

# 等待服务就绪
sleep 2
if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
  echo -e "${GREEN}✓ 后端服务健康检查通过${NC}"
else
  echo -e "${RED}⚠ 后端服务可能未启动成功，请检查 backend.log${NC}"
fi

# ─── 第 6 步：提示下一步 ───
echo -e "\n${BOLD}${CYAN}"
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║  ✅ 后端服务已就绪！                           ║"
echo "  ║                                               ║"
echo "  ║  📱 小程序：                                   ║"
echo "  ║    打开微信开发者工具 → 导入 miniprogram/      ║"
echo "  ║                                               ║"
echo "  ║  🖥️ 管理端：                                   ║"
echo "  ║    cd web-admin && npm install && npm run dev  ║"
echo "  ║                                               ║"
echo "  ║  🛑 停止后端：                                 ║"
echo "  ║    kill $(cat backend.pid)                     ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo -e "${NC}"
