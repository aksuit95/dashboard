$ErrorActionPreference = 'Stop'
$runner = 'C:\dashboard\tmp\us-sector-runner'
$git = 'C:\Program Files\Git\cmd\git.exe'
$python = 'C:\Users\CHECK\AppData\Local\Programs\Python\Python312\python.exe'
$branch = 'cursor/personal-dashboard-readme'
Start-Transcript -LiteralPath 'C:\dashboard\tmp\us-sector-backup.log' -Append | Out-Null
$mutex = [System.Threading.Mutex]::new($false, 'Local\DashboardUsSectorBackup')
$locked = $false
try {
  $locked = $mutex.WaitOne(0)
  if (-not $locked) { Write-Output 'US sector backup already running.'; exit 0 }
  Push-Location -LiteralPath $runner
  try {
    & $git -c "safe.directory=$runner" pull --rebase origin $branch
    if ($LASTEXITCODE -ne 0) { throw 'Cannot update isolated collector checkout.' }
    $env:SKIP_IF_CURRENT = 'true'
    & $python scripts/us-sectors/collect.py
    if ($LASTEXITCODE -ne 0) { throw 'US sector collection failed; existing data remains unchanged.' }
    & $git -c "safe.directory=$runner" add -- data/us-sectors/board.json
    if ($LASTEXITCODE -ne 0) { throw 'Cannot stage US sector data.' }
    & $git -c "safe.directory=$runner" diff --cached --quiet
    if ($LASTEXITCODE -eq 0) { Write-Output 'Latest session already published; nothing to do.'; exit 0 }
    if ($LASTEXITCODE -ne 1) { throw 'Cannot inspect data changes.' }
    & $git -c "safe.directory=$runner" -c user.name='Dashboard Collector' -c user.email='dashboard-collector@users.noreply.github.com' commit --author='aksuit95 <338998390+aksuit95@users.noreply.github.com>' -m 'chore(data): back up US sector collection'
    if ($LASTEXITCODE -ne 0) { throw 'Cannot commit data.' }
    & $git -c "safe.directory=$runner" pull --rebase origin $branch
    if ($LASTEXITCODE -ne 0) { throw 'Remote changed during collection; publication stopped for inspection.' }
    & $git -c "safe.directory=$runner" push origin "HEAD:$branch"
    if ($LASTEXITCODE -ne 0) { throw 'Publication failed; local commit was preserved.' }
    Write-Output 'US sector backup published.'
  } finally { Pop-Location }
} catch { Write-Error $_; exit 1 }
finally {
  if ($locked) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
  Stop-Transcript | Out-Null
}
