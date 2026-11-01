@echo off
title Hyundai Pleos Emulator - DAIT
cd /d "%~dp0"
echo Starting Hyundai Pleos Connect Emulator...
powershell -ExecutionPolicy Bypass -File "%~dp0tools\Start-Pleos.ps1"
