#!/bin/bash
# 停止所有服务
echo "正在停止所有服务..."

if [ -f "backend.pid" ]; then
  kill $(cat backend.pid) 2>/dev/null && echo "✓ 后端已停止"
  rm backend.pid
fi

if [ -f "webadmin.pid" ]; then
  kill $(cat webadmin.pid) 2>/dev/null && echo "✓ 管理端已停止"
  rm webadmin.pid
fi

# 清理残留进程
lsof -ti :3001 | xargs kill -9 2>/dev/null
lsof -ti :3000 | xargs kill -9 2>/dev/null

echo "✅ 全部服务已停止"
