# Remote desktop (the full graphical screen)

SSH gives you a terminal. If you want to *see and use the desktop* — mouse,
keyboard, and screen — use one of the options below for your laptop's OS.

> ⚠️ **Never expose RDP or VNC directly to the internet.** Both are heavily
> scanned and attacked. Reach them only over your local network, a VPN, or
> **Tailscale** (see the setup scripts in `scripts/`). Over Tailscale you just
> point your client at the machine's Tailscale name.

---

## Windows — Remote Desktop (RDP)

Built in, and the smoothest option. Requires **Windows Pro or Enterprise**
(Home edition can't host RDP — use a VNC server like TightVNC instead).

**On the laptop:**
1. Settings → System → **Remote Desktop** → turn **On**.
2. Note the PC name shown on that page.
3. Ensure the account you'll use has a password.

**Connect from:**
- **Windows:** open **Remote Desktop Connection** (`mstsc`), enter the PC name or
  IP (or Tailscale name).
- **macOS / iOS / Android:** install **Microsoft Remote Desktop** (Windows App).
- **Linux:** use a client such as **Remmina** (RDP protocol) or `xfreerdp`:
  ```bash
  xfreerdp /u:YourUsername /v:LAPTOP_IP
  ```

---

## macOS — Screen Sharing (VNC)

**On the laptop:**
1. System Settings → General → **Sharing** → turn on **Screen Sharing**.
2. (Optional) Click the ⓘ to set who may connect and a VNC password.

**Connect from:**
- **Another Mac:** Finder → Go → **Connect to Server** → `vnc://LAPTOP_IP`
  (or `vnc://laptop-tailscale-name`).
- **Windows / Linux:** any VNC client — **RealVNC Viewer**, **TigerVNC**,
  **Remmina** (VNC protocol).

---

## Linux — RDP or VNC

Modern GNOME (Ubuntu 22.04+, Fedora) has a built-in server:

1. Settings → **Sharing** → **Remote Desktop** → turn on.
2. Choose **Remote Desktop** (RDP) and/or **Remote Control**, and set a
   username/password there.
3. Connect with an **RDP** client (Windows `mstsc`, `xfreerdp`, Remmina).

For other desktops, install a VNC server such as **TigerVNC** or **x11vnc**:

```bash
# Example: share the current X session with x11vnc
sudo apt install -y x11vnc          # Debian/Ubuntu
x11vnc -display :0 -usepw -forever
```

Then connect with any VNC viewer.

---

## Recommended: tunnel it over Tailscale

1. Run the Tailscale setup script for your OS (in `scripts/`).
2. Sign in on both the laptop and the device you're connecting from.
3. Point your RDP/VNC client at the laptop's **Tailscale name** instead of a
   local IP. It now works from anywhere, encrypted, with nothing exposed to the
   public internet.
