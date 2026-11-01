# Creates the release signing key once. The key and its password stay on this PC and are never committed.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$properties = Join-Path $root 'android\keystore.properties'
if (Test-Path -LiteralPath $properties) { throw 'android/keystore.properties already exists. Keep the existing key.' }

$folder = Join-Path $env:USERPROFILE '.dait'
New-Item -ItemType Directory -Path $folder -Force | Out-Null
$keystore = Join-Path $folder 'dait-release.jks'
if (Test-Path -LiteralPath $keystore) { throw "A key already exists at $keystore." }

$bytes = New-Object byte[] 24
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$password = ([Convert]::ToBase64String($bytes)) -replace '[+/=]', 'x'
$keytool = Join-Path $env:USERPROFILE '.jdks\jbr-21.0.11\bin\keytool.exe'
# keytool writes progress to stderr, which Windows PowerShell would treat as a failure under 'Stop'.
$ErrorActionPreference = 'Continue'
& $keytool -genkeypair -keystore $keystore -alias dait -keyalg RSA -keysize 2048 -validity 10000 -storepass $password -keypass $password -dname 'CN=DAIT' *> $null
$ErrorActionPreference = 'Stop'
if ($LASTEXITCODE -ne 0) { throw 'keytool failed.' }

@(
    "storeFile=$($keystore.Replace('\', '/'))"
    "storePassword=$password"
    'keyAlias=dait'
    "keyPassword=$password"
) | Set-Content -LiteralPath $properties -Encoding ascii
Write-Output "Release key created at $keystore"
