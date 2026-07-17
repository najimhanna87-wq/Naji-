# Hardening SSH access

Enabling SSH is step one. These steps make it safe to leave on. Do them from the
computer you'll connect *from* (your "client"), reaching into the laptop (the
"server").

## 1. Use key-based authentication

On the **client** machine, generate a key pair (skip if you already have one):

```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
```

Copy the **public** key to the laptop:

```bash
# macOS / Linux client:
ssh-copy-id YourUsername@LAPTOP_IP

# Windows client (PowerShell), if ssh-copy-id is unavailable:
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh YourUsername@LAPTOP_IP `
  "mkdir -p .ssh && cat >> .ssh/authorized_keys"
```

Test that you can log in **without** a password:

```bash
ssh YourUsername@LAPTOP_IP
```

## 2. Disable password login (after keys work!)

On the **laptop**, edit the SSH daemon config (`/etc/ssh/sshd_config` on
Linux/macOS; `C:\ProgramData\ssh\sshd_config` on Windows) and set:

```
PasswordAuthentication no
PermitRootLogin no
ChallengeResponseAuthentication no
```

Then restart SSH:

```bash
sudo systemctl restart ssh      # Debian/Ubuntu
sudo systemctl restart sshd     # Fedora/RHEL/Arch
```
```powershell
Restart-Service sshd            # Windows
```

> ⚠️ Keep your current session open and test a new connection in a second
> terminal before closing it — that way a mistake can't lock you out.

## 3. Optional extras

- **Change the port** (reduces automated scan noise, not real security):
  set `Port 2222` in `sshd_config`, open that port in the firewall, and connect
  with `ssh -p 2222 …`.
- **Limit who can log in:** `AllowUsers YourUsername` in `sshd_config`.
- **Install fail2ban** (Linux) to auto-ban repeated failed attempts.
- **Prefer Tailscale / a VPN** over exposing SSH to the public internet at all.

## 4. Connecting from anywhere, safely

Instead of forwarding a port on your router, install
[Tailscale](https://tailscale.com/download) on both the laptop and the client.
They get private encrypted addresses and you connect with:

```bash
ssh YourUsername@laptop-tailscale-name
```

No open ports, no dynamic-DNS, and traffic is end-to-end encrypted.
