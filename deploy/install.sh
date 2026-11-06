#!/usr/bin/env bash
# Builds Live 911 View and installs it as a systemd service.
# Run as a normal user (not root) from the repository checkout; sudo is used only for the system steps.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE=live911view

if [[ $EUID -eq 0 ]]; then
  echo "Run this as a normal user, not root (the build must not run as root)." >&2
  exit 1
fi
case "$APP_DIR" in
  /home/*|/root/*)
    echo "The checkout is under $APP_DIR, which the hardened service cannot read (ProtectHome)." >&2
    echo "Clone it elsewhere, e.g.: sudo mkdir -p /opt/live911view && sudo chown \$USER /opt/live911view && git clone <repo> /opt/live911view" >&2
    exit 1 ;;
esac

NODE="$(command -v node || true)"
if [[ -z "$NODE" ]]; then echo "Node.js not found. Install Node 20+ first (see docs/DEPLOY-RASPBERRY.md)." >&2; exit 1; fi
NODE="$(readlink -f "$NODE")"
if (( $("$NODE" -p 'process.versions.node.split(".")[0]') < 20 )); then
  echo "Node 20+ required, found $("$NODE" -v)." >&2; exit 1
fi

cd "$APP_DIR"
echo "==> Installing dependencies"
npm ci
echo "==> Building web app and server"
npm run build

echo "==> Installing systemd unit"
sed -e "s#@APP_DIR@#$APP_DIR#g" -e "s#@NODE@#$NODE#g" deploy/live911view.service \
  | sudo tee "/etc/systemd/system/$SERVICE.service" >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now "$SERVICE"

sleep 2
if systemctl is-active --quiet "$SERVICE"; then
  IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  echo "==> Running. Open http://${IP:-<ip-del-pi>}:8787 from your local network."
else
  echo "Service failed to start. Logs: journalctl -u $SERVICE -n 50 --no-pager" >&2
  exit 1
fi
