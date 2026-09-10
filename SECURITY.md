# 安全策略（Security Policy）

## 报告漏洞

发现安全问题请**不要开公开 Issue**，私下报告以便在披露前修复。
报告请包含：

- 漏洞简述
- 受影响组件（后端 API、Web 管理端、认证、支付、限流……）
- 复现步骤与最小触发环境
- 影响评估（数据泄露、提权、可用性……）

我们会确认收到、展开调查，并同步修复与发布进度。

## 安全模型

- **认证**：除公开的少数端点（`/api/auth/login`、`/api/auth/wx-login`、
  `/api/auth/phone-login`、`/api/health`、`/api/trial/apply`、`/api/wxpay/notify`、
  `/api/terms`、`GET /api/settings`）外，所有 `/api/*` 均需后端签发的 JWT。
  `x-openid` 请求头永不作为身份来源被信任。
- **密钥**：`JWT_SECRET` 默认值是一个明确无效的占位符，生产模式
  （`NODE_ENV=production`）未设置真实密钥会直接拒绝启动。JWT 签名密钥与
  微信凭证（`WX_APPID` / `WX_SECRET` / `WX_MCH_ID` / `WX_MCH_KEY`）一律
  通过环境变量注入 —— 绝不提交进仓库。
- **限流**：`backend/server.js` 内置全局按 IP 限流（`RATE_MAX`，默认
  600 次/分钟）与登录按 IP 限流（`LOGIN_RATE_LIMIT`，默认 500 次/15 分钟）。
  公网部署建议收紧。
- **CORS**：`NODE_ENV=production` 下仅放行 `CORS_ORIGINS` 列出的来源。
- **数据库**：SQLite 文件位于 `backend/db/`，已被 git 忽略；
  生产数据库永不出现在仓库中。数据完全归属部署者本机，系统无任何云依赖。

## 范围

支持目标为最新 release tag 与 `main` 分支。三端微信小程序为可选付费扩展、
不在本仓库内——小程序端安全问题请联系扩展授权方单独报告，与后端相关的问题
（如接口越权影响小程序数据）仍按本流程报告。
