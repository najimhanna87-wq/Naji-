<#
.SYNOPSIS
    Enable SSH remote access (OpenSSH Server) on a Windows laptop.

.DESCRIPTION
    Installs the OpenSSH Server optional feature, starts the sshd service and
    sets it to start automatically, opens the Windows Firewall for TCP 22, and
    prints the command to connect from another machine.

.NOTES
    Run in an elevated PowerShell (Run as Administrator):
        .\scripts\enable-remote-windows.ps1
#>

#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }

Write-Step "Checking OpenSSH Server feature…"
$feature = Get-WindowsCapability -Online | Where-Object { $_.Name -like 'OpenSSH.Server*' }
if ($feature.State -ne 'Installed') {
    Write-Step "Installing OpenSSH Server (this can take a minute)…"
    Add-WindowsCapability -Online -Name $feature.Name | Out-Null
} else {
    Write-Step "OpenSSH Server already installed."
}

Write-Step "Starting the sshd service and setting it to start automatically…"
Start-Service sshd
Set-Service -Name sshd -StartupType 'Automatic'

Write-Step "Ensuring a firewall rule allows inbound TCP 22…"
if (-not (Get-NetFirewallRule -Name 'sshd' -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -Name 'sshd' -DisplayName 'OpenSSH Server (sshd)' `
        -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 | Out-Null
    Write-Step "Firewall rule created."
} else {
    Write-Step "Firewall rule already exists."
}

# Best-effort local IPv4 address (prefer a private, non-loopback address).
$ip = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike '169.254*' -and $_.IPAddress -ne '127.0.0.1' } |
    Select-Object -First 1 -ExpandProperty IPAddress)
if (-not $ip) { $ip = 'LAPTOP_IP' }
$user = $env:USERNAME

Write-Host ""
Write-Step "SSH is enabled. Connect from another machine on the same network with:"
Write-Host ""
Write-Host "    ssh $user@$ip"
Write-Host ""
Write-Host "Prefer the full graphical desktop? Turn on Remote Desktop:"
Write-Host "    Settings -> System -> Remote Desktop (Windows Pro/Enterprise only)."
Write-Host ""
Write-Host "To reach it from outside your home network, use Tailscale or a VPN"
Write-Host "(see README.md). Harden the server with docs/harden-ssh.md."
