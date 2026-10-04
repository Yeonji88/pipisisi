param(
  [string]$ToolRoot = (Join-Path $env:TEMP 'nyam-android-tools')
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
if (!(Test-Path (Join-Path $ToolRoot 'java')) -or !(Test-Path (Join-Path $ToolRoot 'sdk'))) {
  throw 'Java/SDK 도구 폴더를 찾지 못했습니다. -ToolRoot로 빌드 도구 위치를 지정해주세요.'
}
$env:JAVA_HOME = (Get-ChildItem (Join-Path $ToolRoot 'java') -Directory | Select-Object -First 1).FullName
$env:ANDROID_HOME = Join-Path $ToolRoot 'sdk'
$env:GRADLE_USER_HOME = Join-Path $ToolRoot 'gradle-cache'
# Force the Java pipe implementation to fall back to TCP on this Windows host.
$socketPath = Join-Path $ToolRoot 'tcp-only-no-directory'
if (Test-Path $socketPath) { throw '소켓 우회 경로가 이미 존재합니다. 다른 ToolRoot를 사용해주세요.' }
$env:JAVA_TOOL_OPTIONS = '-Djdk.net.unixdomain.tmpdir=' + $socketPath
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
Push-Location $projectRoot
try {
  & npm.cmd --cache .npm-cache run android:sync
  if ($LASTEXITCODE -ne 0) { throw '웹 코드 빌드 실패' }
  & .\android\gradlew.bat -p android assembleDebug --no-daemon --console=plain '-Pandroid.overridePathCheck=true'
  if ($LASTEXITCODE -ne 0) { throw 'APK 빌드 실패' }
  New-Item -ItemType Directory -Force -Path 'dist' | Out-Null
  Copy-Item -LiteralPath 'android\app\build\outputs\apk\debug\app-debug.apk' -Destination 'dist\nyam-recipe-book.apk' -Force
  Write-Output (Join-Path $projectRoot 'dist\nyam-recipe-book.apk')
} finally {
  Pop-Location
}
