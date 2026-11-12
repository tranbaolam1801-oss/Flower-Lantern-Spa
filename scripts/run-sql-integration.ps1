# Runs the SQL Server integration suite against the dedicated TEST database only.
# Reads backend/.env.test.local (git-ignored). Never prints values. Does nothing unless every safety check passes.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root 'backend'
$envFile = Join-Path $backend '.env.test.local'

if (-not (Test-Path -LiteralPath $envFile)) {
  Write-Host 'REFUSED: backend/.env.test.local does not exist.'
  exit 2
}

foreach ($line in Get-Content -LiteralPath $envFile) {
  $t = $line.Trim()
  if ($t -eq '' -or $t.StartsWith('#')) { continue }
  $i = $t.IndexOf('=')
  if ($i -lt 1) { continue }
  $name = $t.Substring(0, $i).Trim()
  $value = $t.Substring($i + 1).Trim().Trim('"').Trim("'")
  [Environment]::SetEnvironmentVariable($name, $value, 'Process')
}

if ($env:DB_NAME -ne 'FlowerLanternSpa_Test') { Write-Host 'REFUSED: DB_NAME must be exactly FlowerLanternSpa_Test.'; exit 2 }
if ($env:DB_AUTH -eq 'windows') { Write-Host 'REFUSED: DB_AUTH must not be windows (use SQL authentication).'; exit 2 }
if ([string]::IsNullOrWhiteSpace($env:DB_USER)) { Write-Host 'REFUSED: DB_USER is not set.'; exit 2 }

$env:RUN_SQL_INTEGRATION = '1'
Push-Location $backend
try {
  & npx jest --runInBand *> $null
  $code = $LASTEXITCODE
} finally {
  Pop-Location
}

if ($code -eq 0) { Write-Host 'SQL integration: PASS' } else { Write-Host "SQL integration: FAIL (jest exit code $code). Re-run 'npx jest --runInBand' manually from backend/ with the same env to see details."; }
exit $code
