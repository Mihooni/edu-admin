/**
 * 自动定时数据库备份模块
 *
 * 使用 better-sqlite3 的 backup API 创建一致性快照，
 * 按配置保留最近 N 份备份，超出自动清理最旧的。
 *
 * 备份文件存放于 backend/backups/ 目录，文件名格式：
 *   backup_YYYY-MM-DD_HHmmss.db
 */

const fs = require('fs');
const path = require('path');
const db = require('../db');

const BACKUP_DIR = path.join(__dirname, '..', 'backups');

// 确保备份目录存在
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

/**
 * 获取备份配置（从 settings 表读取，带默认值）
 */
function getBackupConfig() {
  const defaults = {
    enabled: true,
    frequency: 'daily',   // daily | every12h | every6h
    retention: 30,         // 保留最近 30 份备份
  };
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'backup_config'").get();
    if (row && row.value) {
      return { ...defaults, ...JSON.parse(row.value) };
    }
  } catch (e) { /* 使用默认值 */ }
  return defaults;
}

/**
 * 执行一次数据库备份
 * @returns {{ success: boolean, filename?: string, size?: number, error?: string }}
 */
async function createBackup() {
  try {
    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    const filename = `backup_${ts}.db`;
    const filepath = path.join(BACKUP_DIR, filename);

    // 使用 better-sqlite3 v11+ 的 backup API（在线热备份，不阻塞读写，返回 Promise）
    await db.backup(filepath);

    const stat = fs.statSync(filepath);
    console.log(`[Backup] 数据库备份完成: ${filename} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);

    // 清理旧备份
    cleanOldBackups();

    return { success: true, filename, size: stat.size };
  } catch (err) {
    console.error('[Backup] 备份失败:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * 清理超出保留数量的旧备份
 */
function cleanOldBackups() {
  const config = getBackupConfig();
  const retention = Math.max(1, config.retention || 30);

  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('backup_') && f.endsWith('.db'))
    .map(f => ({
      name: f,
      path: path.join(BACKUP_DIR, f),
      mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime(),
    }))
    .sort((a, b) => b.mtime - a.mtime); // 新→旧

  if (files.length > retention) {
    const toDelete = files.slice(retention);
    for (const f of toDelete) {
      try {
        fs.unlinkSync(f.path);
        console.log(`[Backup] 清理旧备份: ${f.name}`);
      } catch (e) { /* 忽略删除失败 */ }
    }
  }
}

/**
 * 列出所有备份
 */
function listBackups() {
  const dir = BACKUP_DIR;
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.startsWith('backup_') && f.endsWith('.db'))
    .map(f => {
      const stat = fs.statSync(path.join(dir, f));
      return {
        filename: f,
        size: stat.size,
        createdAt: stat.mtime.getTime(),
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * 删除指定备份
 */
function deleteBackup(filename) {
  const filepath = path.join(BACKUP_DIR, filename);
  if (!filepath.startsWith(BACKUP_DIR)) throw new Error('非法路径');
  if (!fs.existsSync(filepath)) throw new Error('备份文件不存在');
  fs.unlinkSync(filepath);
  return true;
}

/**
 * 启动定时备份调度
 * 根据配置的频率自动执行备份
 */
function startScheduledBackup() {
  const config = getBackupConfig();
  if (!config.enabled) {
    console.log('[Backup] 自动备份已禁用');
    return;
  }

  // 计算备份间隔（毫秒）
  const intervals = {
    daily: 24 * 60 * 60 * 1000,
    every12h: 12 * 60 * 60 * 1000,
    every6h: 6 * 60 * 60 * 1000,
  };
  const interval = intervals[config.frequency] || intervals.daily;

  // 计算到下次执行的时间（默认每天凌晨 2:00 执行）
  function scheduleNext() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(2, 0, 0, 0); // 凌晨 2 点
    if (config.frequency === 'every12h') {
      next.setHours(now.getHours() < 2 || now.getHours() >= 14 ? 2 : 14, 0, 0, 0);
    } else if (config.frequency === 'every6h') {
      const nextHour = Math.ceil(now.getHours() / 6) * 6;
      next.setHours(nextHour >= 24 ? 0 : nextHour, 0, 0, 0);
    }
    if (next <= now) next.setTime(next.getTime() + interval);

    const delay = next.getTime() - now.getTime();
    console.log(`[Backup] 下次备份: ${next.toLocaleString('zh-CN')}（${Math.round(delay / 1000 / 60)}分钟后）`);

    setTimeout(() => {
      const cfg = getBackupConfig();
      if (cfg.enabled) {
        createBackup();
      }
      scheduleNext();
    }, delay);
  }

  // 启动时延迟 60 秒执行一次初始备份（确保服务完全启动）
  setTimeout(() => {
    const cfg = getBackupConfig();
    if (cfg.enabled) {
      console.log('[Backup] 执行启动备份...');
      createBackup();
    }
  }, 60 * 1000);

  scheduleNext();
}

module.exports = {
  getBackupConfig,
  createBackup,
  listBackups,
  deleteBackup,
  startScheduledBackup,
  BACKUP_DIR,
};
