param([string] $NodePath = (Get-Command node.exe -CommandType Application | Select-Object -First 1).Source)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runner = Join-Path $projectRoot 'tmp\market-live-archive-publisher'
$exportDir = Join-Path $projectRoot 'tmp\market-live-archive-export'
$branch = 'cursor/personal-dashboard-readme'
$remote = 'https://github.com/aksuit95/dashboard.git'
$git = (Get-Command git.exe -CommandType Application | Select-Object -First 1).Source

function Invoke-ArchiveGit {
  & $git -c ("safe.directory=" + $runner.Replace('\','/')) -C $runner @args
  if ($LASTEXITCODE -ne 0) { throw 'Market live archive Git operation failed.' }
}

Push-Location -LiteralPath $projectRoot
try {
  $file = & $NodePath --disable-warning=ExperimentalWarning --import tsx jobs/market-live-archive.ts --export $exportDir
  if ($LASTEXITCODE -ne 0) { throw 'Could not export the KRX sector archive.' }
} finally { Pop-Location }
if (-not $file) { exit 0 }
$file = Get-Item -LiteralPath $file
if ($file.Directory.FullName -ne $exportDir -or $file.Name -notmatch '^\d{4}-\d{2}-\d{2}\.json$') {
  throw 'Unexpected sector archive export path.'
}
$marker = Join-Path $exportDir ($file.BaseName + '.published')
$hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
if ((Test-Path -LiteralPath $marker -PathType Leaf) -and (Get-Content -LiteralPath $marker -Raw).Trim() -eq $hash) { exit 0 }

$relative = 'data/market-live-publication/' + $file.Name
if (-not (Test-Path -LiteralPath (Join-Path $runner '.git') -PathType Container)) {
  & $git clone --single-branch --branch $branch --depth 3 --filter=blob:none --sparse $remote $runner
  if ($LASTEXITCODE -ne 0) { throw 'Could not initialize the sector archive publisher.' }
}
if ((Invoke-ArchiveGit remote get-url origin) -ne $remote -or (Invoke-ArchiveGit branch --show-current) -ne $branch) {
  throw 'Unexpected remote or branch in the sector archive publisher.'
}
if (Invoke-ArchiveGit status --porcelain) { throw 'The sector archive publisher has uncommitted changes.' }
Invoke-ArchiveGit sparse-checkout set 'data/market-live-publication'
Invoke-ArchiveGit pull --rebase origin $branch
$destination = Join-Path $runner $relative
if (Test-Path -LiteralPath $destination -PathType Leaf) {
  if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -ne $hash) { throw 'A different archive for the same trading date is already published.' }
} else {
  New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
  Copy-Item -LiteralPath $file.FullName -Destination $destination
  Invoke-ArchiveGit add -- $relative
  if ((Invoke-ArchiveGit diff --cached --name-only) -ne $relative) { throw 'Unexpected files are staged for publication.' }
  Invoke-ArchiveGit -c 'user.name=Dashboard Collector' -c 'user.email=dashboard-collector@users.noreply.github.com' commit --author='aksuit95 <338998390+aksuit95@users.noreply.github.com>' -m 'chore(data): publish KRX sector replay'
}
Invoke-ArchiveGit push origin "HEAD:$branch"
Set-Content -LiteralPath $marker -Value $hash -Encoding ASCII
Write-Output "Published sector replay for $($file.BaseName)."
