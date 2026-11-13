# Creates the three demo members (ayesha-demo, bilal-demo, sara-demo) so the
# website's no-wallet demo can sign for them. Their keys are written to
# web\.env.local (never committed); copy DEMO_ACCOUNTS from there into Vercel.
# Usage (from the project folder): .\scripts\setup-demo.ps1 -Account your-name.testnet
# Ayesha organizes demo committees, and each DAO costs 6 NEAR, so she gets the most.

param(
    [Parameter(Mandatory = $true)][string]$Account,
    [string]$AyeshaNear = "8 NEAR",
    [string]$MemberNear = "1 NEAR"
)

$RealNear = Join-Path $env:APPDATA "npm\node_modules\near-cli-rs\node_modules\.bin_real\near.exe"
if (Test-Path $RealNear) { Set-Alias near $RealNear -Scope Script }
function Step([string]$text) { Write-Host "`n==> $text" -ForegroundColor Cyan }

Step "Generating demo keys (kept in web\.env.local)"
Push-Location web
if (-not (Test-Path node_modules)) { npm.cmd install --no-audit --no-fund | Out-Null }
$json = node scripts/gen-demo-keys.mjs $Account
Pop-Location
if ($LASTEXITCODE -ne 0) { Write-Host "STOPPED: key generation failed." -ForegroundColor Red; exit 1 }
$members = $json | ConvertFrom-Json

foreach ($m in $members) {
    near account view-account-summary $m.id network-config testnet now *> $null
    if ($LASTEXITCODE -eq 0) { Write-Host "$($m.id) already exists, reusing it"; continue }
    $amount = if ($m.id -like "ayesha-demo.*") { $AyeshaNear } else { $MemberNear }
    Step "Creating $($m.id) with $amount"
    near account create-account fund-myself $m.id $amount use-manually-provided-public-key $m.publicKey sign-as $Account network-config testnet sign-with-keychain send
    if ($LASTEXITCODE -ne 0) { Write-Host "STOPPED: creating $($m.id) failed. See the error above." -ForegroundColor Red; exit 1 }
}

Step "Done"
Write-Host "Demo members: $($members.id -join ', ')"
Write-Host "Their keys are in web\.env.local. Copy the DEMO_ACCOUNTS line into Vercel's environment variables."
