param([switch]$Install, [switch]$DeviceChecks, [switch]$Release, [string]$TeamName = 'DAIT')
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$env:JAVA_HOME = Join-Path $env:USERPROFILE '.jdks\jbr-21.0.11'
$buildRoot = Join-Path $env:LOCALAPPDATA 'DAIT\build'
# The SDK may live on another drive, so use the first folder that exists.
$sdkHome = @($env:ANDROID_HOME, (Join-Path $env:LOCALAPPDATA 'Android\Sdk'), 'D:\Android\Sdk') |
    Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if (-not $sdkHome) { throw 'Android SDK folder not found.' }
# Windows AF_UNIX connects fail on this host. A nonexistent socket directory lets
# the JDK use its normal TCP loopback fallback, scoped only to this process tree.
$socketFallback = Join-Path $env:LOCALAPPDATA 'DAIT\no-unix-sockets'
if (Test-Path -LiteralPath $socketFallback) { throw 'Expected the fallback socket directory to be absent.' }
$env:JAVA_TOOL_OPTIONS = "-Djdk.net.unixdomain.tmpdir=$socketFallback"
& node (Join-Path $PSScriptRoot 'build-rules.js')
if ($LASTEXITCODE -ne 0) { throw 'Teacher rule table has a problem.' }
& node (Join-Path $PSScriptRoot 'build-lessons.js')
if ($LASTEXITCODE -ne 0) { throw 'Lesson script table has a problem.' }
# Debug builds run silently without lesson audio. A release must not.
if ($Release) {
    & node (Join-Path $PSScriptRoot 'check-lesson-voices.js')
    if ($LASTEXITCODE -ne 0) { throw 'Release stopped: some lesson pieces have no audio yet. See the list above.' }
}
Push-Location (Join-Path $taskRoot 'android')
try {
    $sdkRoot = $sdkHome.Replace('\', '/')
    "sdk.dir=$sdkRoot" | Set-Content -LiteralPath 'local.properties' -Encoding ascii
    & '.\gradlew.bat' ':app:assembleDebug' ':app:testDebugUnitTest' ':app:lintDebug' "-PdaitBuildRoot=$($buildRoot.Replace('\','/'))" '--no-daemon' '--console' 'plain'
    if ($LASTEXITCODE -ne 0) { throw 'Build or checks failed.' }
    & node --test 'app\src\test\js\journey.test.js' 'app\src\test\js\lesson.test.js'
    if ($LASTEXITCODE -ne 0) { throw 'Journey rule tests failed.' }
    if (-not (Test-Path -LiteralPath 'app\src\main\assets\model-ko\uuid')) { Write-Warning 'Speech model is missing: the app builds, but answers work by touch only. Run tools\Setup-Voice-Model.py.' }
    $apk =Join-Path $taskRoot 'apk\DAIT-dialogue-debug.apk'
    New-Item -ItemType Directory -Path (Split-Path $apk -Parent) -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $buildRoot 'app\outputs\apk\debug\app-debug.apk') -Destination $apk -Force
    if ($Install) {
        $adb = Join-Path $sdkHome 'platform-tools\adb.exe'
        $avd = & $adb '-s' 'emulator-5554' 'emu' 'avd' 'name'
        if (-not ($avd | Where-Object { $_ -in 'DAIT_Pleos_2_1', 'Automotive_1408p_landscape' })) { throw 'Expected a Pleos emulator on emulator-5554.' }
        & $adb '-s' 'emulator-5554' 'install' '-r' $apk
        if ($LASTEXITCODE -ne 0) { throw 'Install failed.' }
        & $adb '-s' 'emulator-5554' 'shell' 'am' 'start' '-W' '-n' 'io.dait.app/.MainActivity'
        if ($LASTEXITCODE -ne 0) { throw 'Launch failed.' }
    }
    if ($Release) {
        if (-not (Test-Path -LiteralPath 'keystore.properties')) { throw 'android/keystore.properties is missing. Run tools\Make-Release-Key.ps1 once.' }
        & '.\gradlew.bat' ':app:assembleRelease' "-PdaitBuildRoot=$($buildRoot.Replace('\','/'))" '--no-daemon' '--console' 'plain'
        if ($LASTEXITCODE -ne 0) { throw 'Release build failed.' }
        # The contest wants team_app_release.apk. The app name is written by code point to keep this script ASCII.
        $appName = "$([char]0xB2E4)$([char]0xC787)"
        $releaseApk = Join-Path $taskRoot "apk\$($TeamName)_$($appName)_release.apk"
        Copy-Item -LiteralPath (Join-Path $buildRoot 'app\outputs\apk\release\app-release.apk') -Destination $releaseApk -Force
        Write-Output $releaseApk
    }
    if ($DeviceChecks) {
        $adb = Join-Path $sdkHome 'platform-tools\adb.exe'
        & '.\gradlew.bat' ':app:assembleDebugAndroidTest' "-PdaitBuildRoot=$($buildRoot.Replace('\','/'))" '--no-daemon' '--console' 'plain'
        if ($LASTEXITCODE -ne 0) { throw 'Device check build failed.' }
        & $adb '-s' 'emulator-5554' 'install' '-r' (Join-Path $buildRoot 'app\outputs\apk\androidTest\debug\app-debug-androidTest.apk')
        if ($LASTEXITCODE -ne 0) { throw 'Device check install failed.' }
        & $adb '-s' 'emulator-5554' 'shell' 'am' 'instrument' '-w' 'io.dait.app.test/io.dait.app.OfflineVoiceCheck'
        & $adb '-s' 'emulator-5554' 'shell' 'am' 'instrument' '-w' '-e' 'check' 'focus' 'io.dait.app.test/io.dait.app.OfflineVoiceCheck'
    }
    Write-Output $apk
} finally { Pop-Location }
