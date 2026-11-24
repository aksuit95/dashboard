param(
  [string]$ProjectRoot = 'C:\dashboard',
  [string]$RunnerRoot = 'C:\dashboard\tmp\briefing-publisher',
  [string]$GitExe = 'C:\Program Files\Git\cmd\git.exe',
  [string]$Branch = 'cursor/personal-dashboard-readme'
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$root = $ProjectRoot
$runner = $RunnerRoot
$source = Join-Path $root 'output\briefing-auto'
$git = $GitExe
$branch = $Branch
if (-not (Test-Path -LiteralPath (Join-Path $runner '.git'))) { throw '브리핑 게시 전용 작업 공간이 없습니다.' }
if (-not (Test-Path -LiteralPath $source)) { Write-Output '게시할 브리핑이 없습니다.'; exit 0 }
Push-Location -LiteralPath $runner
try {
  & $git -c "safe.directory=$runner" pull --rebase origin $branch
  if ($LASTEXITCODE -ne 0) { throw '공유 저장소 갱신에 실패했습니다. 기존 자료를 유지하고 다음 실행 때 재시도합니다.' }
  $archive = Join-Path $runner 'public\data\briefing-archive'
  New-Item -ItemType Directory -Force -Path $archive | Out-Null
  $restored = @{}
  foreach ($marker in (Get-ChildItem -LiteralPath $source -File -Filter 'deleted-*.json')) {
    if ($marker.Name -cnotmatch '^deleted-((daily|weekly)-\d{4}-\d{2}-\d{2})\.json$') { continue }
    $id = $Matches[1]
    $state = Get-Content -LiteralPath $marker.FullName -Raw -Encoding utf8 | ConvertFrom-Json
    if ($state.id -ceq $id -and $state.restored -eq $true) {
      $restored[$id] = $true
      continue
    }
    $destination = Join-Path $archive $marker.Name
    if (-not (Test-Path -LiteralPath $destination)) { Copy-Item -LiteralPath $marker.FullName -Destination $destination }
    foreach ($extension in @('json', 'pdf')) {
      $removed = Join-Path $archive "$id.$extension"
      if (Test-Path -LiteralPath $removed -PathType Leaf) { Remove-Item -LiteralPath $removed }
    }
  }
  foreach ($item in (Get-ChildItem -LiteralPath $source -File -Filter '*.json')) {
    $id = [System.IO.Path]::GetFileNameWithoutExtension($item.Name)
    if ($id -notmatch '^(daily|weekly)-\d{4}-\d{2}-\d{2}$') { continue }
    $deletedPath = Join-Path $archive "deleted-$id.json"
    $hasDeletion = Test-Path -LiteralPath $deletedPath
    if ($hasDeletion -and -not $restored.ContainsKey($id)) { continue }
    $pdf = Join-Path $source "$id.pdf"
    if (-not (Test-Path -LiteralPath $pdf -PathType Leaf)) { continue }
    $report = Get-Content -LiteralPath $item.FullName -Raw -Encoding utf8 | ConvertFrom-Json
    $date = $id.Substring($id.IndexOf('-') + 1)
    if ($report.type -ne $id.Split('-')[0] -or $report.period.end -ne $date -or $null -eq $report.indices -or $null -eq $report.sectors -or $null -eq $report.flows) { throw "잘못된 브리핑 스냅샷: $id" }
    $reader = [System.IO.File]::OpenRead($pdf)
    try { $header = New-Object byte[] 5; if ($reader.Read($header, 0, 5) -ne 5 -or [System.Text.Encoding]::ASCII.GetString($header) -ne '%PDF-') { throw "잘못된 PDF: $id" } } finally { $reader.Dispose() }
    $entries = @(@($item.FullName, "$id.json"), @($pdf, "$id.pdf"))
    $mismatch = $false
    foreach ($entry in $entries) {
      $destination = Join-Path $archive $entry[1]
      if ((Test-Path -LiteralPath $destination) -and (Get-FileHash -LiteralPath $entry[0] -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash) { $mismatch = $true; break }
    }
    if ($mismatch) { Write-Warning "Keeping existing published briefing: $id"; continue }
    foreach ($entry in $entries) {
      $destination = Join-Path $archive $entry[1]
      if (-not (Test-Path -LiteralPath $destination)) { Copy-Item -LiteralPath $entry[0] -Destination $destination }
    }
    if ($hasDeletion) { Remove-Item -LiteralPath $deletedPath }
  }
  & $git -c "safe.directory=$runner" add -- public/data/briefing-archive
  if ($LASTEXITCODE -ne 0) { throw '브리핑 게시 파일을 준비하지 못했습니다.' }
  $staged = & $git -c "safe.directory=$runner" diff --cached --name-only
  if ($LASTEXITCODE -ne 0 -or @($staged | Where-Object { $_ -and -not $_.StartsWith('public/data/briefing-archive/') }).Count -gt 0) { throw '게시 전용 작업 공간에 다른 스테이징 파일이 있어 중단합니다.' }
  & $git -c "safe.directory=$runner" diff --cached --quiet
  if ($LASTEXITCODE -eq 1) {
    & $git -c "safe.directory=$runner" -c user.name='Dashboard Collector' -c user.email='dashboard-collector@users.noreply.github.com' commit -m 'chore(data): publish market briefings'
    if ($LASTEXITCODE -ne 0) { throw '브리핑 게시 커밋에 실패했습니다.' }
  } elseif ($LASTEXITCODE -ne 0) { throw '브리핑 게시 상태 확인에 실패했습니다.' }
  & $git -c "safe.directory=$runner" push origin "HEAD:$branch"
  if ($LASTEXITCODE -ne 0) { throw '브리핑 게시 실패. 다음 예약 실행에서 재시도합니다.' }
  Write-Output '공유 저장소에 브리핑을 게시했습니다.'
} finally { Pop-Location }
