# 팀이 만든 수업 음원의 실제 길이를 재어 lessons/음원길이.csv에 남기고 앱용 수업 파일을 다시 만든다.
# 음원은 voice/수업-대본.csv의 이름대로 assets/voices/lesson/ 폴더에 m4a로 넣는다.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$lengths = New-Object System.Collections.Generic.List[string]
$lengths.Add('음원,초')
foreach ($file in Get-ChildItem (Join-Path $root 'android\app\src\main\assets\voices\lesson') -Filter '*.m4a') {
    $seconds = (& ffprobe -v error -show_entries format=duration -of csv=p=0 $file.FullName).Trim()
    $lengths.Add("lesson/$($file.BaseName),$([math]::Round([double]$seconds, 1))")
}
Set-Content -LiteralPath (Join-Path $root 'lessons\음원길이.csv') -Value $lengths -Encoding UTF8
& node (Join-Path $PSScriptRoot 'build-lessons.js')
Write-Output "수업 음원 $($lengths.Count - 1)개의 길이를 쟀습니다."
