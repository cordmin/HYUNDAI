param([switch]$Install)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$env:JAVA_HOME = Join-Path $env:USERPROFILE '.jdks\jbr-21.0.11'
$buildRoot = Join-Path $env:LOCALAPPDATA 'DAIT\build'
# Windows AF_UNIX connects fail on this host. A nonexistent socket directory lets
# the JDK use its normal TCP loopback fallback, scoped only to this process tree.
$socketFallback = Join-Path $env:LOCALAPPDATA 'DAIT\no-unix-sockets'
if (Test-Path -LiteralPath $socketFallback) { throw 'Expected the fallback socket directory to be absent.' }
$env:JAVA_TOOL_OPTIONS = "-Djdk.net.unixdomain.tmpdir=$socketFallback"
Push-Location (Join-Path $taskRoot 'android')
try {
    $sdkRoot = (Join-Path $env:LOCALAPPDATA 'Android\Sdk').Replace('\', '/')
    "sdk.dir=$sdkRoot" | Set-Content -LiteralPath 'local.properties' -Encoding ascii
    & '.\gradlew.bat' ':app:assembleDebug' ':app:testDebugUnitTest' ':app:lintDebug' "-PdaitBuildRoot=$($buildRoot.Replace('\','/'))" '--no-daemon' '--console' 'plain'
    if ($LASTEXITCODE -ne 0) { throw 'Build or checks failed.' }
    $apk = Join-Path $taskRoot 'apk\DAIT-dialogue-debug.apk'
    New-Item -ItemType Directory -Path (Split-Path $apk -Parent) -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $buildRoot 'app\outputs\apk\debug\app-debug.apk') -Destination $apk -Force
    if ($Install) {
        $adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
        $avd = & $adb '-s' 'emulator-5554' 'emu' 'avd' 'name'
        if ($avd -notcontains 'DAIT_Pleos_2_1') { throw 'Expected the DAIT Pleos emulator on emulator-5554.' }
        & $adb '-s' 'emulator-5554' 'install' '-r' $apk
        if ($LASTEXITCODE -ne 0) { throw 'Install failed.' }
        & $adb '-s' 'emulator-5554' 'shell' 'am' 'start' '-W' '-n' 'io.dait.app/.MainActivity'
        if ($LASTEXITCODE -ne 0) { throw 'Launch failed.' }
    }
    Write-Output $apk
} finally { Pop-Location }
