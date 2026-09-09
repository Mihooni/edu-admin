#!/bin/bash
# 停止后端服务
echo "正在停止后端服务..."

if [ -f "backend.pid" ]; then
  kill "$(cat backend.pid)" 2>/dev/null && echo "✓ 后端已停止"
  rm -f backend.pid
else
  echo "未找到 backend.pid，尝试按端口清理..."
fi

# 清理残留进程
lsof -ti :3001 | xargs kill -9 2>/dev/null || true
echo "✅ 后端服务已停止"
