param(
  [string] $NodePath = (Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source,
  [switch] $Once
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$projectRoot = Split-Path -Parent $PSScriptRoot
$logPath = Join-Path $projectRoot 'tmp\market-live-archive.log'
New-Item -ItemType Directory -Path (Split-Path -Parent $logPath) -Force | Out-Null

$mutex = [System.Threading.Mutex]::new($false, 'Local\DashboardMarketLiveSectorArchive')
$locked = $false
try {
  try { $locked = $mutex.WaitOne(0) }
  catch [System.Threading.AbandonedMutexException] { $locked = $true }
  if (-not $locked) { exit 0 }

  $nodeArgs = @('--disable-warning=ExperimentalWarning', '--env-file-if-exists=.env', '--import', 'tsx', 'jobs/market-live-archive.ts')
  if (-not $Once) { $nodeArgs += '--watch' }
  Push-Location -LiteralPath $projectRoot
  try {
    $ErrorActionPreference = 'Continue'
    & $NodePath @nodeArgs 2>&1 | Out-File -LiteralPath $logPath -Append -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw "Market live archive collector exited $LASTEXITCODE." }
    if (-not $Once) {
      $publisher = Join-Path $PSScriptRoot 'market-live-archive-publish.ps1'
      & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $publisher -NodePath $NodePath 2>&1 | Out-File -LiteralPath $logPath -Append -Encoding utf8
      if ($LASTEXITCODE -ne 0) { throw "Market live archive publication exited $LASTEXITCODE." }
    }
  } finally {
    $ErrorActionPreference = 'Stop'
    Pop-Location
  }
} catch {
  "[$(Get-Date -Format o)] $($_.Exception.Message)" | Out-File -LiteralPath $logPath -Append -Encoding utf8
  exit 1
} finally {
  if ($locked) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
