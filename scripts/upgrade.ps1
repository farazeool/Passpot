# Rebuilds the Passpot contract and replaces the code on testnet, keeping every
# circle and record (no init call). Then checks the new code answers.
# Usage (PowerShell, from the project folder):
#   .\scripts\upgrade.ps1 -Account fatneek-committee.testnet

param(
    [Parameter(Mandatory = $true)][string]$Account,
    [string]$AppName = "cmt"
)

$RealNear = Join-Path $env:APPDATA "npm\node_modules\near-cli-rs\node_modules\.bin_real\near.exe"
if (Test-Path $RealNear) { Set-Alias near $RealNear -Scope Script }
$App = "$AppName.$Account"

function Step([string]$text) { Write-Host "`n==> $text" -ForegroundColor Cyan }
function Check([int]$code, [string]$what) {
    if ($code -ne 0) {
        Write-Host "`nSTOPPED: $what failed. Send the error above to Claude." -ForegroundColor Red
        exit 1
    }
}

Step "Building the Passpot contract"
Push-Location contracts/committee; cargo near build non-reproducible-wasm --no-abi; $code = $LASTEXITCODE; Pop-Location
Check $code "Building"

$wasm = Get-ChildItem -Path target -Recurse -Filter "committee.wasm" -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match "\\near\\" } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $wasm) { Write-Host "STOPPED: committee.wasm not found under target\near" -ForegroundColor Red; exit 1 }
Write-Host ("Built {0} ({1:N0} KB)" -f $wasm.FullName, ($wasm.Length / 1KB))

Step "Replacing the code on $App (circles and records are kept)"
near contract deploy $App use-file $wasm.FullName without-init-call network-config testnet sign-with-keychain send
Check $LASTEXITCODE "Deploying"

Step "Checking the new code: circle #1 should now report its join rule"
$out = near contract call-function as-read-only $App get_committee json-args '{"committee_id":1}' network-config testnet now 2>&1 | Out-String
if ($out -match "min_clean_circles") {
    Write-Host "`nDone. The upgrade is live: circles can now require a clean savings record." -ForegroundColor Green
} else {
    Write-Host $out
    Write-Host "`nSTOPPED: the new field isn't there yet. Send the output above to Claude." -ForegroundColor Red
    exit 1
}
