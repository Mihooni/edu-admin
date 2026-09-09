# 贡献指南（Contributing）

感谢参与！项目是教培/健身机构一体化管理系统
（Express + SQLite 后端、Vue 3 + Element Plus 管理后台、微信原生小程序）。
本指南让贡献保持一致、可审查。

## 基本规则

- **后端**：Node.js >= 18，CommonJS，Express + `better-sqlite3`。
  优先沿用 `backend/utils/` 既有辅助函数与路由结构，不新增平行模式。
- **Web 管理端**：Vue 3 + Element Plus + Pinia，ESM，Vite 5 构建。
  组件写法跟随 `web-admin/src/views` 现有约定。
- **小程序**：微信原生（无框架依赖），页面四件套 + `app.json` 注册；
  新页面必须可被 `node check-mp.mjs` 校验。
- **数据库**：schema 变更一律走 `backend/migrations/` 新增编号迁移
  （见 `backend/migrations/runner.js`），绝不手改 `data.db`。
- **不提交凭证**：`.env`、真实 AppID、商户密钥、生产数据库文件一律禁止；
  只放占位符。CI 有敏感值门禁会拦截。
- **测试**：测试保持自隔离 —— `DB_PATH` 指向临时文件，绝不依赖已种子化的
  `backend/db/data.db`。

## 开始

1. Fork 本仓库。
2. `git clone` 你的 fork 并 `cd` 进入。
3. `npm run install:all` 安装后端与管理端依赖。
4. `npm run init:db && npm run seed` 建库并灌示例数据。
5. `bash start-all.sh` 一键起服务（或 `npm run start:backend` +
   另一终端 `npm run dev:web`）。
6. 开分支：`git checkout -b feat/your-change`。

## 提交改动

- 每个 PR 聚焦一件事，无关改动请拆分。
- 推送前跑隔离回归：`npm run test:backend`（256 项，自建临时库，不动你的数据）。
- 改了 web-admin 代码：`npm run build:web` 确认可构建。
- 改了小程序：`node check-mp.mjs` 通过。
- 改了环境变量：同一个 PR 里更新 `.env.example` 与 README 的相关说明。
- PR 描述写清楚：改了什么、为什么、如何验证。

## 报告问题

开 Issue 请附：

- 复现步骤（含你设置的环境变量与端口）
- 期望 vs 实际行为
- Node 版本（`node --version`）与操作系统
- 相关日志（注意打码任何密钥）

## 许可证

提交贡献即表示同意你的贡献以 [MIT License](LICENSE) 授权。
