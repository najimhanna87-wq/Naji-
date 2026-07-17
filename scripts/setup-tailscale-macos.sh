#!/usr/bin/env bash
#
# setup-tailscale-macos.sh — Install Tailscale on macOS so the laptop is
# reachable from anywhere (no router config, no exposed ports).
#
# Usage:  ./scripts/setup-tailscale-macos.sh

set -euo pipefail

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This script is for macOS. On Linux use setup-tailscale-linux.sh." >&2
  exit 1
fi

if command -v tailscale >/dev/null 2>&1; then
  log "Tailscale CLI already installed."
elif command -v brew >/dev/null 2>&1; then
  log "Installing Tailscale via Homebrew…"
  brew install tailscale
  log "Starting the Tailscale service…"
  sudo brew services start tailscale
else
  echo "Homebrew not found."
  echo "Install the Tailscale app from the Mac App Store or"
  echo "https://tailscale.com/download/mac , then sign in and re-run this script."
  exit 1
fi

log "Bringing Tailscale up. A browser link will appear — open it to sign in."
sudo tailscale up --ssh

echo
log "Tailscale is up. This machine's tailnet address / name:"
tailscale ip -4 2>/dev/null || true
tailscale status 2>/dev/null | head -n 1 || true

echo
echo "Connect from another device on your tailnet with:"
echo "    ssh $(id -un)@$(hostname)"
echo
echo "Manage devices at https://login.tailscale.com/admin/machines"
