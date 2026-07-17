#!/usr/bin/env bash
#
# enable-remote-linux.sh — Enable SSH remote access on a Linux laptop.
#
# Detects the distro's package manager, installs OpenSSH server, enables and
# starts the service, opens the firewall (if one is active), and prints the
# command you use to connect from another machine.
#
# Usage:  sudo ./scripts/enable-remote-linux.sh

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "This script needs root. Re-run with: sudo $0" >&2
  exit 1
fi

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }

install_openssh() {
  if command -v apt-get >/dev/null 2>&1; then
    log "Detected Debian/Ubuntu (apt)"
    apt-get update
    apt-get install -y openssh-server
    SERVICE="ssh"
  elif command -v dnf >/dev/null 2>&1; then
    log "Detected Fedora/RHEL (dnf)"
    dnf install -y openssh-server
    SERVICE="sshd"
  elif command -v yum >/dev/null 2>&1; then
    log "Detected RHEL/CentOS (yum)"
    yum install -y openssh-server
    SERVICE="sshd"
  elif command -v pacman >/dev/null 2>&1; then
    log "Detected Arch (pacman)"
    pacman -S --noconfirm openssh
    SERVICE="sshd"
  elif command -v zypper >/dev/null 2>&1; then
    log "Detected openSUSE (zypper)"
    zypper install -y openssh
    SERVICE="sshd"
  else
    echo "Could not detect a supported package manager." >&2
    echo "Install the OpenSSH server manually, then re-run." >&2
    exit 1
  fi
}

enable_service() {
  log "Enabling and starting the SSH service ($SERVICE)"
  if command -v systemctl >/dev/null 2>&1; then
    systemctl enable --now "$SERVICE"
  elif command -v service >/dev/null 2>&1; then
    service "$SERVICE" start
  else
    echo "No systemctl/service found; start the SSH daemon manually." >&2
  fi
}

open_firewall() {
  if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
    log "Opening SSH in ufw firewall"
    ufw allow ssh || true
  elif command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
    log "Opening SSH in firewalld"
    firewall-cmd --add-service=ssh --permanent || true
    firewall-cmd --reload || true
  else
    log "No active ufw/firewalld detected — skipping firewall step"
  fi
}

print_details() {
  local ip user
  # Prefer the primary route's source IP; fall back to hostname -I.
  ip="$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}')"
  [[ -z "${ip:-}" ]] && ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  user="${SUDO_USER:-$(logname 2>/dev/null || echo "$USER")}"

  echo
  log "SSH is enabled. Connect from another machine on the same network with:"
  echo
  printf '    ssh %s@%s\n' "$user" "${ip:-LAPTOP_IP}"
  echo
  echo "To reach it from outside your home network, use Tailscale or a VPN"
  echo "(see README.md). Harden the server with docs/harden-ssh.md."
}

install_openssh
enable_service
open_firewall
print_details
