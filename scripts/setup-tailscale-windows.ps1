<#
.SYNOPSIS
    Install Tailscale on Windows so the laptop is reachable from anywhere.

.DESCRIPTION
    Installs Tailscale (via winget if available, otherwise points you to the
    installer), then brings the connection up so you can sign in. Once online,
    connect from any device on your tailnet over SSH or Remote Desktop using the
    machine's Tailscale name — no router changes and no exposed ports.

.NOTES
    Run in an elevated PowerShell (Run as Administrator):
        .\scripts\setup-tailscale-windows.ps1
#>

#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }

if (Get-Command tailscale -ErrorAction SilentlyContinue) {
    Write-Step "Tailscale already installed."
} elseif (Get-Command winget -ErrorAction SilentlyContinue) {
    Write-Step "Installing Tailscale via winget…"
    winget install --id tailscale.tailscale -e --accept-source-agreements --accept-package-agreements
} else {
    Write-Host "winget not found."
    Write-Host "Download and run the installer from https://tailscale.com/download/windows ,"
    Write-Host "then re-run this script (or just sign in from the Tailscale tray icon)."
    exit 1
}

Write-Step "Bringing Tailscale up. A browser window will open — sign in there."
tailscale up

Write-Host ""
Write-Step "Tailscale is up. This machine's tailnet address:"
tailscale ip -4
Write-Host ""
Write-Host "Connect from another device on your tailnet with:"
Write-Host "    ssh $env:USERNAME@$env:COMPUTERNAME"
Write-Host "…or point Remote Desktop at the machine's Tailscale name."
Write-Host ""
Write-Host "Manage devices at https://login.tailscale.com/admin/machines"
