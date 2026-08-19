#!/bin/bash
set -euo pipefail

curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
dnf install -y nodejs git
npm install -g tsx

mkdir -p /opt/oracle-proxy
chown opc:opc /opt/oracle-proxy

firewall-cmd --permanent --add-port=80/tcp
firewall-cmd --permanent --add-port=8788/tcp
firewall-cmd --permanent --add-masquerade
firewall-cmd --permanent --add-forward-port=port=80:proto=tcp:toport=8788
firewall-cmd --reload

cat >/etc/systemd/system/oracle-proxy.service <<'UNIT'
[Unit]
Description=Oracle DB proxy for aiagents-hub
After=network.target

[Service]
Type=simple
User=opc
WorkingDirectory=/opt/oracle-proxy/services/oracle-proxy
EnvironmentFile=/opt/oracle-proxy/.env
ExecStart=/usr/bin/npx tsx src/index.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
