# Hyundai Pleos Emulator Launcher
$emulator = Join-Path $env:LOCALAPPDATA 'Android\Sdk\emulator\emulator.exe'
if (-not (Test-Path $emulator)) { $emulator = 'D:\Android\Sdk\emulator\emulator.exe' }
if (-not (Test-Path $emulator)) {
    throw "Emulator not found at: $emulator"
}
Write-Host "현대 Pleos Connect 에뮬레이터를 실행합니다..." -ForegroundColor Cyan
$avds = & $emulator -list-avds
$avd = @('DAIT_Pleos_2_1', 'Automotive_1408p_landscape') | Where-Object { $avds -contains $_ } | Select-Object -First 1
if (-not $avd) { throw "Pleos virtual device not found. Installed: $avds" }
Start-Process -FilePath $emulator -ArgumentList "-avd", $avd
