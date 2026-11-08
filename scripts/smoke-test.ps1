# Runs one real committee round on testnet with three members:
# you plus two helper accounts (bilal.<you> and sara.<you>).
# Usage: .\scripts\smoke-test.ps1 -Account your-name.testnet

param(
    [Parameter(Mandatory = $true)][string]$Account,
    [string]$UsdName = "usd",
    [string]$AppName = "app"
)

$ErrorActionPreference = "Stop"
$Usd = "$UsdName.$Account"
$App = "$AppName.$Account"
$Members = @($Account, "bilal.$Account", "sara.$Account")
$Amount = "10000000"   # 10 tUSD (6 decimals)

function B64([string]$json) { [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json)) }
function Step([string]$text) { Write-Host "`n==> $text" -ForegroundColor Cyan }
function Call($contract, $method, $json, $signer, $deposit = '0 NEAR') {
    near contract call-function as-transaction $contract $method base64-args (B64 $json) prepaid-gas '100.0 Tgas' attached-deposit $deposit sign-as $signer network-config testnet sign-with-keychain send
}
function View($contract, $method, $json) {
    near contract call-function as-read-only $contract $method base64-args (B64 $json) network-config testnet now
}

Step "Creating helper members (skipped if they exist)"
foreach ($m in $Members[1..2]) {
    try { near account create-account fund-myself $m '1 NEAR' autogenerate-new-keypair save-to-keychain sign-as $Account network-config testnet sign-with-keychain send }
    catch { Write-Host "$m probably exists already, continuing" }
}

Step "Getting test dollars"
foreach ($m in $Members) { Call $Usd 'faucet' '{}' $m }

Step "Creating a 3-person committee (10 tUSD, 60-second rounds, agreed order)"
Call $App 'create_committee' '{"name":"Smoke test","amount":"10000000","size":3,"round_secs":60,"mode":"Order"}' $Account
$id = Read-Host "Enter the committee id printed above (the number returned)"

Step "Members join with a 10 tUSD deposit"
foreach ($m in $Members) {
    $msg = '{\"action\":\"join\",\"committee_id\":' + $id + '}'
    Call $Usd 'ft_transfer_call' ('{"receiver_id":"' + $App + '","amount":"' + $Amount + '","msg":"' + $msg + '"}') $m '1 yoctoNEAR'
}

Step "Organizer starts it"
Call $App 'start' ('{"committee_id":' + $id + '}') $Account

Step "Everyone pays round 1"
foreach ($m in $Members) {
    $msg = '{\"action\":\"contribute\",\"committee_id\":' + $id + '}'
    Call $Usd 'ft_transfer_call' ('{"receiver_id":"' + $App + '","amount":"' + $Amount + '","msg":"' + $msg + '"}') $m '1 yoctoNEAR'
}

Step "Closing round 1 (pays the first member)"
Call $App 'advance_round' ('{"committee_id":' + $id + '}') $Account

Step "Committee state"
View $App 'get_committee' ('{"committee_id":' + $id + '}')
Step "Your testUSD balance"
View $Usd 'ft_balance_of' ('{"account_id":"' + $Account + '"}')
