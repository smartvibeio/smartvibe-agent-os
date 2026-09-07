param([ValidateSet('install','start','check')][string]$Action = 'start', [switch]$NoLaunch)
$ErrorActionPreference = 'Stop'
$projectDir = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectDir
$runtimeDir = Join-Path $projectDir '.runtime'
$nodeDir = Join-Path $runtimeDir 'node-v24.13.0-win-x64'
$nodeExe = Join-Path $nodeDir 'node.exe'

try {
  if (-not [Environment]::Is64BitOperatingSystem -or [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne 'X64') {
    throw '当前Windows安装入口支持x64；Mac请使用.command入口。'
  }
  New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
  if ($Action -eq 'install' -and -not (Test-Path -LiteralPath $nodeExe)) {
    Write-Host '正在下载Node.js 24.13.0（只安装在项目内）...'
    $archive = Join-Path $runtimeDir 'node-v24.13.0-win-x64.zip'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -UseBasicParsing 'https://nodejs.org/dist/v24.13.0/node-v24.13.0-win-x64.zip' -OutFile $archive
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne 'CA2742695BE8DE44027D71B3F53A4BDB36009B95575FE1AE6F7F0B5CE091CB88') {
      throw 'Node下载校验失败，请重试。'
    }
    Expand-Archive -LiteralPath $archive -DestinationPath $runtimeDir -Force
  }
  if (-not (Test-Path -LiteralPath $nodeExe)) { throw '尚未安装运行环境，请先双击「首次安装」。' }
  $arguments = @('scripts/runtime.mjs', $Action)
  if ($NoLaunch) { $arguments += '--no-launch' }
  & $nodeExe @arguments
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} catch {
  Write-Host "未完成：$($_.Exception.Message)" -ForegroundColor Red
  Write-Host '不会清除已有档案。联网失败时请检查网络或系统代理，再重新运行。'
  exit 1
}

