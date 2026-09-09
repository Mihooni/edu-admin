#!/usr/bin/env bash
# 教务系统一键备份脚本
# 用法：bash tools/backup.sh [备份目录]（默认 ./backups）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${1:-$ROOT/backups}"
DB="$ROOT/backend/db/data.db"
mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$OUT_DIR/edu-admin-backup-$STAMP.db"

# 使用 sqlite3 在线备份（WAL 模式一致性快照）
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB" ".backup '$DEST'"
else
  # 兜底：复制主库与 WAL 文件
  cp "$DB" "$DEST"
  [ -f "$DB-wal" ] && cp "$DB-wal" "$DEST-wal"
  [ -f "$DB-shm" ] && cp "$DB-shm" "$DEST-shm"
fi

echo "✅ 备份完成：$DEST"
echo "   大小：$(du -h "$DEST" | cut -f1)"
echo "   恢复：停止服务后，用该文件替换 backend/db/data.db 并删除 data.db-wal / data.db-shm 后重启"
