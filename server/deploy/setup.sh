#!/bin/sh
# One-time setup of the OTA server's machine (Debian, as root): Bun, cloudflared, user, folders, services.
# Needs MAXAPP_TUNNEL_TOKEN (MaxAgents secret). Safe to run again.
set -eu

# 1. Bun
[ -x /usr/local/bin/bun ] || curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash

# 2. cloudflared from Cloudflare's apt repo
if ! command -v cloudflared >/dev/null; then
	curl -fsSL https://pkg.cloudflare.com/cloudflare-public-v2.gpg -o /usr/share/keyrings/cloudflare-public-v2.gpg
	echo 'deb [signed-by=/usr/share/keyrings/cloudflare-public-v2.gpg] https://pkg.cloudflare.com/cloudflared any main' > /etc/apt/sources.list.d/cloudflared.list
	apt-get update -qq && apt-get install -y -qq cloudflared
fi

# 3. User and folders
id maxapp >/dev/null 2>&1 || useradd --system --home-dir /var/lib/maxapp --shell /usr/sbin/nologin maxapp
install -d -o maxapp -g maxapp -m 700 /var/lib/maxapp
install -d /opt/maxapp

# 4. OTA server service
cat > /etc/systemd/system/maxapp.service <<'UNIT'
[Unit]
Description=maxapp OTA server
After=network-online.target

[Service]
User=maxapp
WorkingDirectory=/opt/maxapp
EnvironmentFile=/opt/maxapp/app.env
ExecStart=/usr/local/bin/bun dist/bundle.js
Restart=always

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable maxapp

# 5. Tunnel service
systemctl is-enabled cloudflared >/dev/null 2>&1 || cloudflared service install "$MAXAPP_TUNNEL_TOKEN"
