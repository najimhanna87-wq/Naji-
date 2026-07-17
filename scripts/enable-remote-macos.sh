#!/usr/bin/env bash
#
# enable-remote-macos.sh — Enable SSH ("Remote Login") on a macOS laptop.
#
# Turns on Remote Login and prints the command to connect from another machine.
# Optionally reminds you how to enable Screen Sharing for a graphical desktop.
#
# Usage:  ./scripts/enable-remote-macos.sh
#         (you will be prompted for your password by sudo)

set -euo pipefail

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This script is for macOS. On Linux use enable-remote-linux.sh." >&2
  exit 1
fi

log "Enabling Remote Login (SSH)…"
sudo systemsetup -setremotelogin on

status="$(sudo systemsetup -getremotelogin 2>/dev/null || true)"
log "Status: ${status:-unknown}"

ip="$(ipconfig getifaddr en0 2>/dev/null || true)"
[[ -z "$ip" ]] && ip="$(ipconfig getifaddr en1 2>/dev/null || true)"
user="$(id -un)"

echo
log "SSH is enabled. Connect from another machine on the same network with:"
echo
printf '    ssh %s@%s\n' "$user" "${ip:-LAPTOP_IP}"
echo
echo "Want the full graphical desktop too?"
echo "  System Settings → General → Sharing → Screen Sharing (toggle on),"
echo "  then connect with  vnc://${ip:-LAPTOP_IP}"
echo
echo "To reach it from outside your home network, use Tailscale or a VPN"
echo "(see README.md). Harden the server with docs/harden-ssh.md."
