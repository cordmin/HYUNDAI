param([switch]$AcceptPleosLicense)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$sdkRoot = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$archivePath = Join-Path $taskRoot 'downloads\pleos-connect-2.1.0.zip'
$imagePath = Join-Path $sdkRoot 'system-images\android-34\pleos_car_emulator\x86_64'
$avdName = 'DAIT_Pleos_2_1'

if (-not $AcceptPleosLicense) {
    throw 'Read research/PLEOS-SDK-LICENSE.txt. Run with -AcceptPleosLicense only after the user explicitly agrees.'
}
if ((Get-FileHash -LiteralPath $archivePath -Algorithm SHA1).Hash -ne 'b4f858d5bcc6c71506d7edfc872bcb9e5a11acaa') {
    throw 'Official Pleos archive checksum mismatch.'
}
if (Test-Path -LiteralPath $imagePath) { throw 'Image path already exists; inspect the existing installation instead of overwriting it.' }
if (Test-Path -LiteralPath (Join-Path $env:USERPROFILE ".android\avd\$avdName.ini")) { throw 'AVD already exists; preserve it.' }

# Install the verified official archive without downloading it a second time.
New-Item -ItemType Directory -Path $imagePath -Force | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($archivePath)
try {
    $prefix = 'crp_avd_out_x86_64/'
    foreach ($entry in $archive.Entries) {
        if (-not $entry.FullName.StartsWith($prefix)) { throw 'Unexpected archive root.' }
        $relative = $entry.FullName.Substring($prefix.Length)
        if (-not $relative) { continue }
        $target = [IO.Path]::GetFullPath((Join-Path $imagePath $relative))
        $allowedPrefix = [IO.Path]::GetFullPath($imagePath) + [IO.Path]::DirectorySeparatorChar
        if (-not $target.StartsWith($allowedPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe archive path.' }
        if ($entry.FullName.EndsWith('/')) { New-Item -ItemType Directory -Path $target -Force | Out-Null; continue }
        New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force | Out-Null
        [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $false)
    }
} finally { $archive.Dispose() }

# Android SDK local package metadata mirrors the official repository entry.
$manifest = [xml](Get-Content -LiteralPath (Join-Path $taskRoot 'research\pleos-system-image.xml') -Raw)
$officialPackage = $manifest.SelectSingleNode('//*[local-name()="remotePackage"]')
$licenseNode = $manifest.SelectSingleNode('//*[local-name()="license"]')
$localXml = [xml]'<?xml version="1.0" encoding="UTF-8"?><repo:repository xmlns:repo="http://schemas.android.com/repository/android/common/02" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:sys-img="http://schemas.android.com/sdk/android/repo/sys-img2/03"/>'
$rootNode = $localXml.DocumentElement
$localLicense = $localXml.CreateElement('license')
$localLicense.SetAttribute('id', $licenseNode.id)
$localLicense.SetAttribute('type', 'text')
$localLicense.InnerText = $licenseNode.InnerText
[void]$rootNode.AppendChild($localLicense)
$localPackage = $localXml.CreateElement('localPackage')
$localPackage.SetAttribute('path', $officialPackage.path)
$localPackage.SetAttribute('obsolete', 'false')
foreach ($name in @('type-details', 'revision', 'display-name', 'uses-license', 'dependencies')) {
    $node = $officialPackage.SelectSingleNode("*[local-name()='$name']")
    if ($node) { [void]$localPackage.AppendChild($localXml.ImportNode($node, $true)) }
}
[void]$rootNode.AppendChild($localPackage)
$localXml.Save((Join-Path $imagePath 'package.xml'))

$env:JAVA_HOME = Join-Path $env:USERPROFILE '.jdks\jbr-21.0.11'
$avdmanager = Join-Path $sdkRoot 'cmdline-tools\latest\bin\avdmanager.bat'
'no' | & $avdmanager create avd --name $avdName --package 'system-images;android-34;pleos_car_emulator;x86_64' --device 'Pleos_Connect_v2_0'
if ($LASTEXITCODE -ne 0) { throw 'AVD creation failed. Image preserved for inspection.' }
$configPath = Join-Path $env:USERPROFILE ".android\avd\$avdName.avd\config.ini"
$config = Get-Content -LiteralPath $configPath
$settings = [ordered]@{'hw.ramSize'='4096'; 'hw.gpu.enabled'='yes'; 'hw.gpu.mode'='host'; 'fastboot.forceColdBoot'='yes'; 'fastboot.forceFastBoot'='no'}
foreach ($key in $settings.Keys) {
    $pattern = '^' + [regex]::Escape($key) + '='
    $config = @($config | Where-Object {$_ -notmatch $pattern}) + "$key=$($settings[$key])"
}
$config | Set-Content -LiteralPath $configPath -Encoding ascii
& (Join-Path $sdkRoot 'emulator\emulator.exe') -list-avds
Write-Output "Installed $avdName. RAM=4096MB; cold boot enabled."
