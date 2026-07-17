#!/usr/bin/env bash
#
# setup-tailscale-linux.sh — Install Tailscale so the laptop is reachable from
# anywhere (no router config, no exposed ports), then bring it online.
#
# After this runs and you sign in, connect from any other device on your
# tailnet with:  ssh YourUsername@<this-machine's-tailscale-name>
#
# Usage:  sudo ./scripts/setup-tailscale-linux.sh

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "This script needs root. Re-run with: sudo $0" >&2
  exit 1
fi

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }

if command -v tailscale >/dev/null 2>&1; then
  log "Tailscale already installed."
else
  log "Installing Tailscale via the official install script…"
  curl -fsSL https://tailscale.com/install.sh | sh
fi

log "Bringing Tailscale up. A browser link will appear — open it to sign in."
# --ssh lets you SSH over Tailscale using its built-in, key-managed SSH.
tailscale up --ssh

echo
log "Tailscale is up. This machine's tailnet address / name:"
tailscale ip -4 2>/dev/null || true
tailscale status 2>/dev/null | head -n 1 || true

echo
echo "Connect from another device on your tailnet with:"
echo "    ssh $(logname 2>/dev/null || echo YourUsername)@$(hostname)"
echo
echo "Manage devices at https://login.tailscale.com/admin/machines"
