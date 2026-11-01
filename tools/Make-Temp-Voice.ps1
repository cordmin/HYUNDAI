# 팀 음원이 오기 전에 흐름을 시험하기 위한 임시 음성을 Windows 한국어 음성으로 만든다.
# voice/규칙-대본.csv에서 팀 음원이 없는 대사만 만들고, 끝나면 앱용 규칙 파일을 다시 만든다.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$root = Split-Path $PSScriptRoot -Parent
$target = Join-Path $root 'android\app\src\main\assets\voices\temp'
New-Item -ItemType Directory -Path $target -Force | Out-Null

$voice = New-Object System.Speech.Synthesis.SpeechSynthesizer
$korean = $voice.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq 'ko-KR' } | Select-Object -First 1
if (-not $korean) { throw 'Windows 한국어 음성이 없습니다.' }
$voice.SelectVoice($korean.VoiceInfo.Name)
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(22050, 'Sixteen', 'Mono')

$made = 0
foreach ($line in (Import-Csv -LiteralPath (Join-Path $root 'voice\규칙-대본.csv') -Encoding UTF8)) {
    if ($line.'상태' -eq '완성') { continue }
    $file = Join-Path $target "$($line.'음원 이름').wav"
    if (Test-Path -LiteralPath $file) { continue }
    $voice.SetOutputToWaveFile($file, $format)
    $voice.Speak($line.'대사')
    $voice.SetOutputToNull()
    $made++
}
$voice.Dispose()
Write-Output "임시 음성 $($made)개를 만들었습니다."
& node (Join-Path $PSScriptRoot 'build-rules.js')
