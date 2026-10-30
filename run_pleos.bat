@echo off
title Hyundai Pleos Emulator - DAIT
cd /d "%~dp0"
echo Starting Hyundai Pleos Connect Emulator...
start "" "%LOCALAPPDATA%\Android\Sdk\emulator\emulator.exe" -avd DAIT_Pleos_2_1
