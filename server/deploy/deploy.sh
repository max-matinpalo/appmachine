#!/bin/sh
# Builds the OTA server and GUI from this checkout (the main copy), installs them to /opt/maxapp and restarts.
# Run as a normal user with sudo rights, after setup.sh.
set -eu
export PATH="/usr/local/bin:$HOME/.bun/bin:$PATH"
cd "$(dirname "$0")/.."

# 1. Build as this user
npm ci --silent && npm run build --silent
(cd gui && npm ci --silent && npm run build --silent)

# 2. Install and restart
sudo rm -rf /opt/maxapp/dist /opt/maxapp/gui
sudo mkdir -p /opt/maxapp/gui
sudo cp -r dist /opt/maxapp/
sudo cp -r gui/dist /opt/maxapp/gui/
sudo cp deploy/app.env /opt/maxapp/app.env
sudo systemctl restart maxapp
