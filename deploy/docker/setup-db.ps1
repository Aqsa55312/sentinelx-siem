# Local Postgres for SentinelX dev (isolated cluster on port 5544, trust auth on localhost only).
# Usage: powershell -ExecutionPolicy Bypass -File deploy\docker\setup-db.ps1
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Resolve-Path (Join-Path $here '..\\..')
$pg = Join-Path $root '.pgdata'
$bin = 'C:\\Program Files\\PostgreSQL\\16\\bin'
$port = 5544

if (!(Test-Path (Join-Path $pg 'PG_VERSION'))) {
  Write-Host "initdb $pg ..."
  New-Item -ItemType Directory -Force -Path $pg | Out-Null
  & "$bin\\initdb.exe" -D $pg -U sentinelx -A trust | Out-Null
  Add-Content "$pg\\postgresql.conf" "`nport = $port`nlisten_addresses = 'localhost'`n"
}
$running = & "$bin\\pg_ctl.exe" -D $pg status 2>&1 | Out-String
if ($running -notmatch 'is running') {
  & "$bin\\pg_ctl.exe" -D $pg -l "$pg\\logfile" start | Out-Null
  Start-Sleep 3
}
& "$bin\\psql.exe" -h localhost -p $port -U sentinelx -d postgres -c "CREATE DATABASE sentinelx;" 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "(database sentinelx may already exist)" }
& "$bin\\psql.exe" -h localhost -p $port -U sentinelx -d sentinelx -v ON_ERROR_STOP=1 -f (Join-Path $root 'database\\migrations\\001_init.sql')
& "$bin\\psql.exe" -h localhost -p $port -U sentinelx -d sentinelx -v ON_ERROR_STOP=1 -f (Join-Path $root 'database\\seeds\\seed.sql')
Write-Host ""
Write-Host 'OK. Export this for the API:'
Write-Host '$env:DATABASE_URL="postgres://sentinelx@localhost:5544/sentinelx?sslmode=disable"'
