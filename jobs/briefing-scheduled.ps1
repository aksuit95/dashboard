$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$projectRoot = 'C:\dashboard'
$node = 'C:\Program Files\nodejs\node.exe'
$env:BRIEFING_PYTHON = 'C:\Program Files\WindowsApps\OpenAI.CodexPrimaryRuntime.v26-1112-611-0_26.1112.611.0_x64__3k8sg7r9htsxt\dependencies\python\python.exe'
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
    & $node --import tsx jobs/briefing-auto.ts 2>&1 | Out-File -LiteralPath $logPath -Append -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw "Briefing generation failed with exit code $LASTEXITCODE" }
  } finally { Pop-Location }
} catch {
  "[$(Get-Date -Format o)] $($_.Exception.Message)" | Out-File -LiteralPath $logPath -Append -Encoding utf8
  exit 1
} finally {
  if ($locked) { $taskMutex.ReleaseMutex() }
  $taskMutex.Dispose()
}
