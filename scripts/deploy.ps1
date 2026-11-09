# Deploys testUSD and Committee to NEAR testnet.
# Usage (PowerShell, from the project folder):
#   .\scripts\deploy.ps1 -Account your-name.testnet
# Needs: rustup target wasm32-unknown-unknown, cargo-near, near-cli-rs,
# and a testnet account saved in your keychain with at least 10 NEAR.
# Safe to re-run: accounts that already exist are reused, and deploying
# again replaces the contract code (initialisation is skipped then).

param(
    [Parameter(Mandatory = $true)][string]$Account,
    [string]$UsdName = "usd",
    [string]$AppName = "app"
)

$Usd = "$UsdName.$Account"
$App = "$AppName.$Account"

function B64([string]$json) {
    [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
}
function Step([string]$text) { Write-Host "`n==> $text" -ForegroundColor Cyan }
function Check([int]$code, [string]$what) {
    if ($code -ne 0) {
        Write-Host "`nSTOPPED: $what failed. Send the error above to Claude." -ForegroundColor Red
        exit 1
    }
}
function Exists([string]$acc) {
    near account view-account-summary $acc network-config testnet now *> $null
    return ($LASTEXITCODE -eq 0)
}
function HasCode([string]$acc) {
    $out = near account view-account-summary $acc network-config testnet now 2>&1 | Out-String
    return ($out -notmatch "No contract code")
}

Step "Building contracts (no ABI: the ABI step doesn't link on Windows)"
Push-Location contracts/testusd;   cargo near build non-reproducible-wasm --no-abi; $code = $LASTEXITCODE; Pop-Location
Check $code "Building testUSD"
Push-Location contracts/committee; cargo near build non-reproducible-wasm --no-abi; $code = $LASTEXITCODE; Pop-Location
Check $code "Building Committee"
$UsdWasm = "target/near/testusd/testusd.wasm"
$AppWasm = "target/near/committee/committee.wasm"
Write-Host ("testUSD wasm:   {0:N0} KB" -f ((Get-Item $UsdWasm).Length / 1KB))
Write-Host ("Committee wasm: {0:N0} KB" -f ((Get-Item $AppWasm).Length / 1KB))

foreach ($sub in @($Usd, $App)) {
    if (Exists $sub) {
        Write-Host "$sub already exists, reusing it"
    } else {
        Step "Creating $sub (3 NEAR from $Account). If asked for a signature scheme, press Enter."
        near account create-account fund-myself $sub '3 NEAR' autogenerate-new-keypair save-to-keychain sign-as $Account network-config testnet sign-with-keychain send
        Check $LASTEXITCODE "Creating $sub"
    }
}

Step "Deploying testUSD to $Usd"
if (HasCode $Usd) {
    near contract deploy $Usd use-file $UsdWasm without-init-call network-config testnet sign-with-keychain send
} else {
    near contract deploy $Usd use-file $UsdWasm with-init-call new base64-args (B64 '{}') prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send
}
Check $LASTEXITCODE "Deploying testUSD"

Step "Deploying Committee to $App"
if (HasCode $App) {
    near contract deploy $App use-file $AppWasm without-init-call network-config testnet sign-with-keychain send
} else {
    $init = B64 ('{"owner":"' + $Account + '","token":"' + $Usd + '"}')
    near contract deploy $App use-file $AppWasm with-init-call new base64-args $init prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send
}
Check $LASTEXITCODE "Deploying Committee"

Step "Registering $App on testUSD"
near contract call-function as-transaction $Usd register base64-args (B64 ('{"account_id":"' + $App + '"}')) prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' sign-as $Account network-config testnet sign-with-keychain send
Check $LASTEXITCODE "Registering Committee on testUSD"

Step "Done"
Write-Host "testUSD:   $Usd"
Write-Host "Committee: $App"
Write-Host "Next: .\scripts\smoke-test.ps1 -Account $Account"
