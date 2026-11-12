$ErrorActionPreference = 'Stop'
$projectRoot = 'C:\dashboard'
$runnerRoot = 'C:\dashboard\tmp\short-selling-runner'
$git = 'C:\Program Files\Git\cmd\git.exe'
$python = 'C:\dashboard\tmp\short-selling-python\Scripts\python.exe'
$branch = 'cursor/personal-dashboard-readme'
function Update-Lending {
  $targets = @((Join-Path $runnerRoot 'data'), (Join-Path $runnerRoot 'data\short-selling-kosdaq150'))
  Push-Location -LiteralPath $projectRoot
  try {
    foreach ($target in $targets) {
      if (-not (Test-Path -LiteralPath (Join-Path $target 'summary.json'))) { Write-Output "No dataset yet: $target"; continue }
      & $python -m scripts.short_selling.toss_lending --output $target
      if ($LASTEXITCODE -ne 0) { throw "Toss lending collection failed: $target" }
    }
  } finally { Pop-Location }
}
Start-Transcript -LiteralPath 'C:\dashboard\tmp\short-selling-lending-scheduled.log' -Append | Out-Null
$mutex = [System.Threading.Mutex]::new($false, 'Local\DashboardShortSellingLending')
$locked = $false
try {
  $locked = $mutex.WaitOne(0)
  if (-not $locked) { Write-Output 'Another lending collector is running.'; exit 0 }
  Push-Location -LiteralPath $runnerRoot
  try {
    & $git -c "safe.directory=$runnerRoot" pull --rebase origin $branch
    if ($LASTEXITCODE -ne 0) { throw 'Cannot update collector checkout.' }
    $env:PYTHONPATH = $projectRoot
    Update-Lending
    # The GitHub collector may publish the same files during this request.
    # Rebuild lending on its latest generation rather than merging JSON lines.
    for ($attempt = 1; $attempt -le 3; $attempt++) {
      & $git -c "safe.directory=$runnerRoot" fetch origin $branch
      if ($LASTEXITCODE -ne 0) { throw 'Cannot check latest remote data.' }
      $localHead = & $git -c "safe.directory=$runnerRoot" rev-parse HEAD
      $remoteHead = & $git -c "safe.directory=$runnerRoot" rev-parse "origin/$branch"
      if ($localHead -eq $remoteHead) { break }
      $dataPaths = @('data/summary.json', 'data/stocks.json', 'data/market_history.json', 'data/constituents.json', 'data/history')
      if (Test-Path -LiteralPath (Join-Path $runnerRoot 'data\short-selling-kosdaq150')) { $dataPaths += 'data/short-selling-kosdaq150' }
      & $git -c "safe.directory=$runnerRoot" -c user.name='Dashboard Collector' -c user.email='dashboard-collector@users.noreply.github.com' stash push --include-untracked -m 'lending pre-refresh' -- $dataPaths
      if ($LASTEXITCODE -ne 0) { throw 'Cannot preserve collected lending data.' }
      & $git -c "safe.directory=$runnerRoot" merge --ff-only "origin/$branch"
      if ($LASTEXITCODE -ne 0) { throw 'Cannot update to latest short-selling data.' }
      Update-Lending
      if ($attempt -eq 3) {
        & $git -c "safe.directory=$runnerRoot" fetch origin $branch
        if ($LASTEXITCODE -ne 0) { throw 'Cannot check latest remote data.' }
        $localHead = & $git -c "safe.directory=$runnerRoot" rev-parse HEAD
        $remoteHead = & $git -c "safe.directory=$runnerRoot" rev-parse "origin/$branch"
        if ($localHead -ne $remoteHead) { throw 'Remote changed repeatedly; no files published.' }
      }
    }
    & $git -c "safe.directory=$runnerRoot" add -- data/summary.json data/stocks.json data/market_history.json data/constituents.json data/history
    if ($LASTEXITCODE -ne 0) { throw 'Cannot stage data.' }
    if (Test-Path -LiteralPath (Join-Path $runnerRoot 'data\short-selling-kosdaq150')) {
      & $git -c "safe.directory=$runnerRoot" add -- data/short-selling-kosdaq150
      if ($LASTEXITCODE -ne 0) { throw 'Cannot stage KOSDAQ lending data.' }
    }
    & $git -c "safe.directory=$runnerRoot" diff --cached --quiet
    if ($LASTEXITCODE -eq 1) {
      & $git -c "safe.directory=$runnerRoot" -c user.name='Dashboard Collector' -c user.email='dashboard-collector@users.noreply.github.com' commit -m 'chore(data): update lending balances'
      if ($LASTEXITCODE -ne 0) { throw 'Cannot commit data.' }
    } elseif ($LASTEXITCODE -ne 0) { throw 'Cannot inspect changes.' }
    # A final concurrent push is rejected rather than overwriting data.
    & $git -c "safe.directory=$runnerRoot" push origin "HEAD:$branch"
    if ($LASTEXITCODE -ne 0) { throw 'Cannot publish data.' }
  } finally { Pop-Location }
} catch { Write-Error $_; exit 1 }
finally {
  if ($locked) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
  Stop-Transcript | Out-Null
}
