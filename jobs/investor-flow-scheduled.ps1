$ErrorActionPreference = 'Stop'
$projectRoot = 'C:\dashboard'
$runnerRoot = 'C:\dashboard\tmp\investor-flow-runner'
$git = 'C:\Program Files\Git\cmd\git.exe'
$npm = 'C:\Program Files\nodejs\npm.cmd'
$logPath = 'C:\dashboard\tmp\investor-flow-scheduled.log'
Start-Transcript -LiteralPath $logPath -Append | Out-Null
$taskMutex = [System.Threading.Mutex]::new($false, 'Local\DashboardInvestorFlowCollector')
$locked = $false
try {
  $locked = $taskMutex.WaitOne(0)
  if (-not $locked) { Write-Output 'Another collector is running.'; exit 0 }
  foreach ($line in [System.IO.File]::ReadLines((Join-Path $projectRoot '.env'))) {
    if ($line -match '^\s*(KRX_API_KEY|TOSS_CLIENT_ID|TOSS_CLIENT_SECRET|toss_API_KEY|toss_API_SECRET)\s*=(.*)$') {
      [System.Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim(), 'Process')
    }
  }
  if (-not (Test-Path -LiteralPath (Join-Path $runnerRoot '.git'))) { throw 'Isolated collector checkout not installed.' }
  Push-Location -LiteralPath $runnerRoot
  try {
    & $git pull --rebase origin cursor/personal-dashboard-readme
    if ($LASTEXITCODE -ne 0) { throw 'Cannot update collector checkout.' }
    & $npm run investor-flow:export -- --retry-failed
    $collectExit = $LASTEXITCODE
    if (Test-Path -LiteralPath 'data/investor-flow/board.json') {
      & $git add -- data/investor-flow/board.json
      if ($LASTEXITCODE -ne 0) { throw 'Cannot stage snapshot.' }
      & $git diff --cached --quiet
      if ($LASTEXITCODE -eq 1) {
        & $git -c user.name='Dashboard Collector' -c user.email='dashboard-collector@users.noreply.github.com' commit -m 'chore(data): publish investor flow snapshots'
        if ($LASTEXITCODE -ne 0) { throw 'Cannot commit snapshot.' }
      } elseif ($LASTEXITCODE -ne 0) { throw 'Cannot inspect snapshot changes.' }
    }
    & $git pull --rebase origin cursor/personal-dashboard-readme
    if ($LASTEXITCODE -ne 0) { throw 'Cannot reconcile remote changes.' }
    & $git push origin HEAD:cursor/personal-dashboard-readme
    if ($LASTEXITCODE -ne 0) { throw 'Cannot publish snapshot.' }
    if ($collectExit -ne 0) { throw 'Collection incomplete; next scheduled attempt will retry failed tabs.' }
  } finally { Pop-Location }
} catch {
  Write-Error $_
  exit 1
} finally {
  if ($locked) { $taskMutex.ReleaseMutex() }
  $taskMutex.Dispose()
  Stop-Transcript | Out-Null
}
