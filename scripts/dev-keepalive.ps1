# Starts Ollama and Phibe on http://127.0.0.1:8080 (the backend also serves the built UI),
# detached from any terminal or preview manager, and starts it again if it exits. Safe to run twice: a port already
# in use is left alone. Stop everything with: scripts\dev-keepalive.ps1 -Stop
# After changing the frontend, run with -Build and reload the page (hard refresh).
param([switch]$Stop, [switch]$Build)

$root = Split-Path -Parent $PSScriptRoot
$logs = Join-Path $env:USERPROFILE '.phibe\logs'
New-Item -ItemType Directory -Force $logs | Out-Null

function Test-Port($port) { [bool](Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) }

if ($Stop) {
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
    Where-Object { $_.CommandLine -like '*phibe-keepalive*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  foreach ($port in 8080) {
    Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue |
      ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  }
  return
}

# Ollama must be up before the backend, or the backend exits.
if (-not (Test-Port 11434)) {
  Start-Process ollama -ArgumentList 'serve' -WindowStyle Hidden
  for ($i = 0; $i -lt 20 -and -not (Test-Port 11434); $i++) { Start-Sleep 1 }
}

function Start-Kept($name, $port, $workdir, $command) {
  if (Test-Port $port) { return }
  $loop = "# phibe-keepalive $name`nwhile (`$true) { $command *>> '$logs\$name.log'; Start-Sleep 3 }"
  Start-Process powershell -WindowStyle Hidden -WorkingDirectory $workdir `
    -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $loop
}

if ($Build) { Push-Location "$root\frontend"; npm run build; Pop-Location }
Start-Kept 'backend' 8080 $root "& '$root\.venv\Scripts\phibe.exe' serve --host 127.0.0.1 --port 8080"
