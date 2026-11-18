param([switch] $Preview)

$ErrorActionPreference = 'Stop'
$taskName = 'Dashboard Market Live Sector Archive'
$description = 'Records KRX sector snapshots without an open dashboard tab.'
if ((Get-TimeZone).Id -ne 'Korea Standard Time') {
  throw 'This installation requires the Windows time zone Korea Standard Time (UTC+09:00).'
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$wrapper = Join-Path $PSScriptRoot 'market-live-archive-scheduled.ps1'
$node = (Get-Command node.exe -CommandType Application | Select-Object -First 1).Source
$powershell = (Get-Command powershell.exe -CommandType Application | Select-Object -First 1).Source
$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$startBoundary = (Get-Date).ToString("yyyy-MM-dd'T'08:58:00", [System.Globalization.CultureInfo]::InvariantCulture)
$arguments = "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$wrapper`" -NodePath `"$node`""
$definition = @"
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>$description</Description></RegistrationInfo>
  <Triggers>
    <CalendarTrigger>
      <Repetition>
        <Interval>PT5M</Interval>
        <Duration>PT7H38M</Duration>
        <StopAtDurationEnd>false</StopAtDurationEnd>
      </Repetition>
      <StartBoundary>$startBoundary</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByWeek>
        <DaysOfWeek><Monday /><Tuesday /><Wednesday /><Thursday /><Friday /></DaysOfWeek>
        <WeeksInterval>1</WeeksInterval>
      </ScheduleByWeek>
    </CalendarTrigger>
  </Triggers>
  <Principals>
    <Principal id="DashboardUser">
      <UserId>$userId</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT8H</ExecutionTimeLimit>
  </Settings>
  <Actions Context="DashboardUser">
    <Exec>
      <Command>$( [System.Security.SecurityElement]::Escape($powershell) )</Command>
      <Arguments>$( [System.Security.SecurityElement]::Escape($arguments) )</Arguments>
      <WorkingDirectory>$( [System.Security.SecurityElement]::Escape($projectRoot) )</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"@

if ($Preview) { $definition; return }

if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'market-live-archive.ts') -PathType Leaf)) {
  throw 'The market live archive collector script is missing.'
}
$existing = Get-ScheduledTask -TaskPath '\' -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing -and $existing.Description -ne $description) {
  throw "A different task already uses the name '$taskName'."
}
Register-ScheduledTask -TaskPath '\' -TaskName $taskName -Xml $definition -Force | Select-Object TaskName, State
