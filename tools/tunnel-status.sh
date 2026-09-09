#!/bin/bash
# 远程调试隧道管理（macOS / Linux）：启动 cloudflared 隧道 / 自动同步小程序 local-config.js
# 前置：安装 cloudflared（macOS: brew install cloudflared）
# 用法：bash tools/tunnel-status.sh
set -u

PROJECT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$PROJECT/tunnel.log"
LOCAL_CONFIG="$PROJECT/miniprogram/local-config.js"

echo "== 1/4 检查后端 =="
if curl -s --max-time 3 http://localhost:3001/api/health >/dev/null 2>&1; then
  echo "后端运行中 ✓"
else
  echo "后端未运行，请先执行 bash start-all.sh"
  exit 1
fi

echo "== 2/4 检查 cloudflared =="
if ! command -v cloudflared >/dev/null 2>&1; then
  echo "未安装 cloudflared：macOS 执行 brew install cloudflared，其他平台见 https://github.com/cloudflare/cloudflared/releases"
  exit 1
fi
if pgrep -f "cloudflared.*--url http://localhost:3001" >/dev/null 2>&1; then
  echo "隧道运行中 ✓"
else
  echo "隧道未运行，正在启动…"
  nohup cloudflared tunnel --url http://localhost:3001 --no-autoupdate > "$LOG" 2>&1 &
  sleep 6
fi

echo "== 3/4 获取公网地址 =="
URL=""
for _ in $(seq 1 20); do
  URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" 2>/dev/null | tail -1)
  [ -n "$URL" ] && break
  sleep 2
done
if [ -z "$URL" ]; then
  echo "未能获取隧道地址，请查看日志：$LOG"
  exit 1
fi
echo "公网地址：$URL"

echo "== 4/4 同步小程序配置 =="
if [ -f "$LOCAL_CONFIG" ] && grep -q "$URL" "$LOCAL_CONFIG"; then
  echo "local-config.js 已指向该地址 ✓"
else
  cat > "$LOCAL_CONFIG" << EOF
// 本文件由 tools/tunnel-status.sh 自动生成，请勿手动编辑
// 隧道地址变更后重新运行 tunnel-status.sh 即可自动更新
module.exports = {
  LAN_HOST: '$URL',
};
EOF
  echo "已更新 local-config.js → $URL（请回到开发者工具重新编译）"
fi

echo
echo "公网健康检查："
curl -s --max-time 10 "$URL/api/health" && echo
echo
echo "手机操作：微信开发者工具 →「真机调试」（确认已勾选『不校验合法域名』）→ 扫码登录即可远程测试"
