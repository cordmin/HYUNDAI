@echo off
title Hyundai Pleos Emulator - DAIT
cd /d "%~dp0"
echo Starting Hyundai Pleos Connect Emulator...
set "SDK=%LOCALAPPDATA%\Android\Sdk"
if not exist "%SDK%\emulator\emulator.exe" set "SDK=D:\Android\Sdk"
start "" "%SDK%\emulator\emulator.exe" -avd DAIT_Pleos_2_1
