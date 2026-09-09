#!/usr/bin/env bash
# 在部署服务器上以 root 运行（由 Deploy 工作流 scp 上传后调用，
# 参数经 ssh 命令行传入，使本脚本保持为可直接测试的纯 shell 文件）。
#
#   REPO       本仓库完整克隆地址（github.com/Mihooni/edu-admin）
#   SERVER     该服务器的公网主机名（IP 或域名）
#   SKIP_SEED  非空则跳过示例数据
#   ARGS       deploy/deploy.sh 的额外参数（如 --no-https）
#
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

command -v git >/dev/null 2>&1 || { apt-get update -qq; apt-get install -y -qq git; }
command -v docker >/dev/null 2>&1 || curl -fsSL https://get.docker.com | sh

rm -rf /opt/edu-admin
git clone --depth 1 "$REPO" /opt/edu-admin
cd /opt/edu-admin
chmod +x deploy/deploy.sh
SKIP_SEED="$SKIP_SEED" ./deploy/deploy.sh --host "$SERVER" $ARGS
