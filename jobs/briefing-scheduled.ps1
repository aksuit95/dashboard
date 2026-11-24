$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$projectRoot = 'C:\dashboard'
$node = 'C:\Program Files\nodejs\node.exe'
$logPath = Join-Path $projectRoot 'logs\briefing-auto.log'
New-Item -ItemType Directory -Path (Split-Path $logPath) -Force | Out-Null
$taskMutex = [System.Threading.Mutex]::new($false, 'Local\DashboardBriefingAuto')
$locked = $false
try {
  $locked = $taskMutex.WaitOne(0)
  if (-not $locked) { exit 0 }
  Push-Location -LiteralPath $projectRoot
  try {
    "[$(Get-Date -Format o)] Checking briefing data" | Out-File -LiteralPath $logPath -Append -Encoding utf8
    $ErrorActionPreference = 'Continue'
    try {
      & $node --use-system-ca --env-file-if-exists=.env --env-file-if-exists=.env.local --import tsx jobs/briefing-auto.ts 2>&1 | Out-File -LiteralPath $logPath -Append -Encoding utf8
      $generationExit = $LASTEXITCODE
      & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $projectRoot 'jobs\briefing-publish.ps1') 2>&1 | Out-File -LiteralPath $logPath -Append -Encoding utf8
      $publicationExit = $LASTEXITCODE
    } finally { $ErrorActionPreference = 'Stop' }
    if ($generationExit -ne 0 -or $publicationExit -ne 0) { throw "Briefing generation exit $generationExit; publication exit $publicationExit" }
  } finally { Pop-Location }
} catch {
  "[$(Get-Date -Format o)] $($_.Exception.Message)" | Out-File -LiteralPath $logPath -Append -Encoding utf8
  exit 1
} finally {
  if ($locked) { $taskMutex.ReleaseMutex() }
  $taskMutex.Dispose()
}
