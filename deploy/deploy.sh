#!/usr/bin/env bash
#
# 星课 StarClass — Docker 一键部署（公网服务器推荐）
#
# 用法：
#   ./deploy/deploy.sh [--no-https] [--port 3001] [--host 域名或IP]
#
# 默认（Docker 单容器 + Caddy 自动 HTTPS）：
#   HOST  = 服务器公网地址（自动探测，可用 --host 指定）
#   PORT  = 3001（容器内部端口，同端口暴露）
#
# 执行顺序：
#   1. 检查前置条件（git、docker、docker compose 插件、openssl）
#   2. 生成 JWT_SECRET 并写入 .env（含 NODE_ENV=production，.env 不入库）
#   3. 构建并启动单容器栈（后端 + 管理后台同一镜像）
#   4. 初始化数据库（幂等）并按需灌示例数据
#   5. 等待健康检查通过，打印访问地址与体验账号
#
# 加 --no-https 时以 http://HOST:PORT 提供服务，不启动 Caddy；
# 适合内网 / 局域网 / 无域名场景。
#
# 幂等：可重复执行。重跑会重建镜像，保留 SQLite 数据卷与 uploads，
# 除非加 --fresh-db，绝不重置数据库。
#
# 提示：与根目录 deploy.sh（免 Docker 的原生部署）互补 ——
#   本机/旧电脑快速跑起来用根目录的；正式上线服务器用本脚本。

set -euo pipefail

# ---- 选项 -------------------------------------------------------------------
HTTPS=1
PORT=3001
HOST=""
FRESH_DB=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-https)  HTTPS=0; shift ;;
    --port)      PORT="$2"; shift 2 ;;
    --host)      HOST="$2"; shift 2 ;;
    --fresh-db)  FRESH_DB=1; shift ;;
    *)           echo "未知参数：$1" >&2; exit 2 ;;
  esac
done

# ---- 定位仓库根目录 -----------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# ---- 前置检查 -----------------------------------------------------------------
command -v git >/dev/null 2>&1 || { echo "错误：需要 git" >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "错误：需要 docker" >&2; exit 1; }
docker compose version >/dev/null 2>&1 || {
  echo "错误：需要 docker compose v2 插件" >&2
  exit 1
}
command -v openssl >/dev/null 2>&1 || { echo "错误：需要 openssl" >&2; exit 1; }

# ---- 环境文件 -----------------------------------------------------------------
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "[env] 已从 .env.example 创建 .env"
else
  echo "[env] .env 已存在 —— 保持不动"
fi

# .env 里 JWT_SECRET 为空则生成一个强随机密钥
if ! grep -qE '^JWT_SECRET=.+' .env; then
  echo "[env] 生成随机 JWT_SECRET"
  if grep -q '^JWT_SECRET=' .env; then
    sed -i.bak "s|^JWT_SECRET=$|JWT_SECRET=$(openssl rand -hex 32)|" .env && rm -f .env.bak
  else
    echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env
  fi
fi
if ! grep -q '^NODE_ENV=production$' .env; then
  echo "NODE_ENV=production" >> .env
fi

# ---- 探测公网地址 ---------------------------------------------------------------
if [[ -z "$HOST" ]]; then
  HOST="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)"
  if [[ -z "$HOST" ]]; then
    HOST="$(hostname -I 2>/dev/null | awk '{print $1}' || echo localhost)"
  fi
  echo "[host] 探测到服务器地址：$HOST"
  echo "       （可用 --host your.domain.com 覆盖）"
fi

# ---- 构建 & 启动 ----------------------------------------------------------------
if [[ "$HTTPS" -eq 1 ]]; then
  echo "[docker] 启动 app + caddy（为 $HOST 自动签发 Let's Encrypt 证书）"
  DOMAIN="$HOST" docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d --build
else
  echo "[docker] 启动 app（http://${HOST}:${PORT}）"
  docker compose up -d --build
fi

# ---- 数据库引导 -------------------------------------------------------------------
if [[ "$FRESH_DB" -eq 1 ]]; then
  echo "[db] 重置数据库（--fresh-db）"
  docker compose exec -T app rm -f /data/data.db
fi
docker compose exec -T app node db/init.js
if [[ -z "${SKIP_SEED:-}" ]]; then
  docker compose exec -T app node db/seed.js || echo "[db] seed 跳过或数据已存在"
fi

# ---- 健康检查 -----------------------------------------------------------------------
echo "[health] 等待 API 就绪…"
for i in $(seq 1 30); do
  if docker compose exec -T app node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    break
  fi
  if [[ "$i" -eq 30 ]]; then
    echo "错误：API 30 秒内未通过健康检查" >&2
    docker compose logs --tail=50 app || true
    exit 1
  fi
  sleep 1
done

# ---- 汇总 ------------------------------------------------------------------------------
if [[ "$HTTPS" -eq 1 ]]; then
  BASE="https://$HOST"
else
  BASE="http://$HOST"
fi
cat <<EOF

✔ 星课 StarClass 已运行
  管理后台：  $BASE
  API 健康：  $BASE/api/health

  体验账号（如保留示例数据）：
    手机号    13800000001
    密码      123456

  常用容器命令：
    docker compose logs -f app
    docker compose restart app
    docker compose down          # 停止（数据卷保留）
    docker compose down -v       # 停止并删除数据卷（会丢数据，慎用）

EOF
