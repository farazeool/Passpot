# Deploys testUSD and Committee to NEAR testnet.
# Usage (PowerShell, from the project folder):
#   .\scripts\deploy.ps1 -Account your-name.testnet
# Needs: rustup target wasm32-unknown-unknown, cargo-near, near-cli-rs,
# and a testnet account saved in your keychain with at least 10 NEAR.

param(
    [Parameter(Mandatory = $true)][string]$Account,
    [string]$UsdName = "usd",
    [string]$AppName = "app"
)

$ErrorActionPreference = "Stop"
$Usd = "$UsdName.$Account"
$App = "$AppName.$Account"

function B64([string]$json) {
    [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
}

function Step([string]$text) { Write-Host "`n==> $text" -ForegroundColor Cyan }

Step "Building contracts"
Push-Location contracts/testusd;  cargo near build non-reproducible-wasm; Pop-Location
Push-Location contracts/committee; cargo near build non-reproducible-wasm; Pop-Location
$UsdWasm = "target/near/testusd/testusd.wasm"
$AppWasm = "target/near/committee/committee.wasm"

Step "Creating $Usd and $App (3 NEAR each from $Account)"
near account create-account fund-myself $Usd '3 NEAR' autogenerate-new-keypair save-to-keychain sign-as $Account network-config testnet sign-with-keychain send
near account create-account fund-myself $App '3 NEAR' autogenerate-new-keypair save-to-keychain sign-as $Account network-config testnet sign-with-keychain send

Step "Deploying testUSD to $Usd"
near contract deploy $Usd use-file $UsdWasm with-init-call new base64-args (B64 '{}') prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send

Step "Deploying Committee to $App"
$init = B64 ('{"owner":"' + $Account + '","token":"' + $Usd + '"}')
near contract deploy $App use-file $AppWasm with-init-call new base64-args $init prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send

Step "Registering $App on testUSD"
near contract call-function as-transaction $Usd register base64-args (B64 ('{"account_id":"' + $App + '"}')) prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' sign-as $Account network-config testnet sign-with-keychain send

Step "Done"
Write-Host "testUSD:   $Usd"
Write-Host "Committee: $App"
Write-Host "Next: .\scripts\smoke-test.ps1 -Account $Account"
