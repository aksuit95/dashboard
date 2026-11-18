$ErrorActionPreference = 'Stop'
$projectRoot = 'C:\dashboard'
$runnerRoot = 'C:\dashboard\tmp\events-dart-runner'
$git = 'C:\Program Files\Git\cmd\git.exe'
$npm = 'C:\Program Files\nodejs\npm.cmd'
$branch = 'cursor/personal-dashboard-readme'
Start-Transcript -LiteralPath 'C:\dashboard\tmp\events-dart-scheduled.log' -Append | Out-Null
$mutex = [System.Threading.Mutex]::new($false, 'Local\DashboardDartCalendarCollector')
$locked = $false
try {
  $locked = $mutex.WaitOne(0)
  if (-not $locked) { Write-Output 'DART collector already running.'; exit 0 }
  foreach ($envFile in @((Join-Path $projectRoot '.env.local'), (Join-Path $projectRoot '.env'))) {
    if (-not (Test-Path -LiteralPath $envFile)) { continue }
    foreach ($line in [System.IO.File]::ReadLines($envFile)) {
      if ($line -match '^\s*(DART_API_KEY|KRX_ID|KRX_PW)\s*=(.*)$' -and -not [System.Environment]::GetEnvironmentVariable($Matches[1], 'Process')) {
        [System.Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim(), 'Process')
      }
    }
  }
  Push-Location -LiteralPath $runnerRoot
  try {
    & $git -c "safe.directory=$runnerRoot" pull --ff-only origin $branch
    if ($LASTEXITCODE -ne 0) { throw 'Cannot update isolated DART checkout.' }
    & $npm exec -- tsx jobs/events-dart-export.ts
    if ($LASTEXITCODE -ne 0) { throw 'DART collection failed; published data unchanged.' }
    & $git -c "safe.directory=$runnerRoot" diff --quiet -- data/events/board.json
    if ($LASTEXITCODE -eq 0) { Write-Output 'DART data already current.'; exit 0 }
    if ($LASTEXITCODE -ne 1) { throw 'Cannot inspect calendar changes.' }
    $snapshot = Join-Path $runnerRoot 'tmp\events-dart-snapshot.json'
    New-Item -ItemType Directory -Path (Split-Path -Parent $snapshot) -Force | Out-Null
    Copy-Item -LiteralPath 'data/events/board.json' -Destination $snapshot -Force
    & $git -c "safe.directory=$runnerRoot" restore -- data/events/board.json
    if ($LASTEXITCODE -ne 0) { throw 'Cannot prepare calendar update.' }
    & $git -c "safe.directory=$runnerRoot" pull --ff-only origin $branch
    if ($LASTEXITCODE -ne 0) { throw 'Cannot reconcile latest calendar.' }
    & $npm exec -- tsx jobs/events-dart-merge.ts $snapshot
    if ($LASTEXITCODE -ne 0) { throw 'Cannot merge DART feed.' }
    & $git -c "safe.directory=$runnerRoot" add -- data/events/board.json
    if ($LASTEXITCODE -ne 0) { throw 'Cannot stage calendar.' }
    & $git -c "safe.directory=$runnerRoot" diff --cached --quiet
    if ($LASTEXITCODE -eq 0) { Write-Output 'Newer DART data already published.'; exit 0 }
    if ($LASTEXITCODE -ne 1) { throw 'Cannot inspect staged calendar.' }
    & $git -c "safe.directory=$runnerRoot" -c user.name='Dashboard Collector' -c user.email='dashboard-collector@users.noreply.github.com' commit -m 'chore(data): refresh DART calendar from PC'
    if ($LASTEXITCODE -ne 0) { throw 'Cannot commit calendar.' }
    & $git -c "safe.directory=$runnerRoot" push origin "HEAD:$branch"
    if ($LASTEXITCODE -ne 0) { throw 'Cannot publish calendar; no remote data overwritten.' }
  } finally { Pop-Location }
} catch { Write-Error $_; exit 1 }
finally {
  if ($locked) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
  Stop-Transcript | Out-Null
}
