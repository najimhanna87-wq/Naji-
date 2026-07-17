# Naji- — Remote Laptop Access

A practical, copy-paste guide (plus helper scripts) for **enabling remote access
to your laptop**, whether it runs Windows, macOS, or Linux.

> ⚠️ **Security first.** Remote access opens a door into your machine. Read the
> [Security checklist](#security-checklist) before exposing anything to the
> internet. When in doubt, use a VPN or a zero-config tunnel (Tailscale) instead
> of forwarding ports on your router.

---

## What "remote access" means here

There are two things people usually want:

| Goal | Use this | Gives you |
|------|----------|-----------|
| A terminal / command line on the laptop | **SSH** | Text shell, file copy (`scp`/`sftp`), port forwarding |
| The full graphical desktop | **Remote Desktop / VNC** | Mouse + keyboard + screen |

You can enable one or both. SSH is lighter, safer, and scriptable; a remote
desktop is heavier but lets you use apps visually.

---

## Quick start

Clone or copy this repo onto the laptop you want to reach, then run the helper
script for its operating system:

```bash
# Linux
sudo ./scripts/enable-remote-linux.sh

# macOS
./scripts/enable-remote-macos.sh
```

```powershell
# Windows (run PowerShell as Administrator)
.\scripts\enable-remote-windows.ps1
```

Each script enables SSH, tells you the machine's IP address and username, and
prints the exact command to connect from another computer. See per-OS details
below.

---

## Windows

### Option A — SSH (recommended for a terminal)

1. **Settings → System → Optional features → Add a feature →
   "OpenSSH Server" → Install.**
2. Start the service and set it to auto-start (PowerShell as Administrator):
   ```powershell
   Start-Service sshd
   Set-Service -Name sshd -StartupType 'Automatic'
   New-NetFirewallRule -Name sshd -DisplayName 'OpenSSH Server (sshd)' `
     -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22
   ```
3. Connect from another machine:
   ```bash
   ssh YourWindowsUsername@LAPTOP_IP
   ```

The script `scripts/enable-remote-windows.ps1` does all of this for you.

### Option B — Remote Desktop (full graphical desktop)

Available on **Windows Pro/Enterprise** (not Home).

1. **Settings → System → Remote Desktop → turn On.**
2. Note the PC name shown there.
3. From another Windows machine open **Remote Desktop Connection** (`mstsc`) and
   enter the laptop's name or IP. From macOS/Linux use the
   **Microsoft Remote Desktop** app or any RDP client.

---

## macOS

### Option A — SSH ("Remote Login")

```bash
sudo systemsetup -setremotelogin on     # enable
systemsetup -getremotelogin             # verify
```

Or via **System Settings → General → Sharing → Remote Login** (toggle on).
Then connect with:

```bash
ssh YourMacUsername@LAPTOP_IP
```

### Option B — Screen sharing (graphical desktop)

**System Settings → General → Sharing → Screen Sharing** (toggle on). Connect
from another Mac via **Finder → Go → Connect to Server → `vnc://LAPTOP_IP`**, or
from any platform with a VNC client.

The script `scripts/enable-remote-macos.sh` enables Remote Login and prints your
connection details.

---

## Linux

### Option A — SSH (OpenSSH server)

```bash
# Debian / Ubuntu
sudo apt update && sudo apt install -y openssh-server
sudo systemctl enable --now ssh

# Fedora / RHEL
sudo dnf install -y openssh-server
sudo systemctl enable --now sshd

# Arch
sudo pacman -S --noconfirm openssh
sudo systemctl enable --now sshd
```

Open the firewall if one is active:

```bash
sudo ufw allow ssh          # Ubuntu/Debian (ufw)
sudo firewall-cmd --add-service=ssh --permanent && sudo firewall-cmd --reload  # firewalld
```

Connect:

```bash
ssh YourLinuxUsername@LAPTOP_IP
```

The script `scripts/enable-remote-linux.sh` auto-detects your distro, installs
and enables OpenSSH, opens the firewall, and prints connection details.

### Option B — Remote desktop

Most desktop environments include a VNC/RDP server (e.g. GNOME's built-in
Remote Desktop under **Settings → Sharing**). Enable it there, then connect with
an RDP or VNC client depending on which protocol it exposes.

---

## Connecting from outside your home network

Your `LAPTOP_IP` (something like `192.168.x.x`) only works on the same local
network. To reach the laptop from anywhere, pick **one**:

1. **Tailscale (easiest & safest).** Install on both machines, sign in, and they
   get private, encrypted addresses — no router changes, no exposed ports.
   <https://tailscale.com/download>
2. **VPN into your home network** (many routers have a built-in WireGuard/OpenVPN
   server).
3. **Port forwarding** on your router (advanced, riskiest). Only with key-based
   SSH auth and, ideally, a non-default port. Never expose RDP/VNC directly.

---

## Security checklist

- ✅ **Use SSH keys, not passwords.** Generate with `ssh-keygen -t ed25519`, copy
  the public key to the laptop, then disable password login.
- ✅ **Keep the OS and SSH server updated.**
- ✅ **Prefer Tailscale/VPN** over forwarding ports to the open internet.
- ✅ **Never expose RDP or VNC directly** to the internet — tunnel them over SSH
  or a VPN.
- ✅ **Use a strong account password** and enable full-disk encryption.
- ✅ Turn remote access **off** when you no longer need it.

See [`docs/harden-ssh.md`](docs/harden-ssh.md) for step-by-step SSH hardening.

---

## Repository layout

```
.
├── README.md
├── docs/
│   └── harden-ssh.md              # SSH key setup + hardening
└── scripts/
    ├── enable-remote-linux.sh     # Enable SSH on Linux
    ├── enable-remote-macos.sh     # Enable Remote Login on macOS
    └── enable-remote-windows.ps1  # Enable OpenSSH Server on Windows
```
