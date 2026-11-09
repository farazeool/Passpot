# Runs a committee whose money lives in its own Sputnik DAO, on testnet:
# creates the DAO, has three members join and pay, then closes round 1 so the
# payout leaves the DAO through a Transfer proposal.
# Usage: .\scripts\dao-test.ps1 -Account your-name.testnet
# Needs about 7 NEAR on your account (6 for the DAO).

param(
    [Parameter(Mandatory = $true)][string]$Account,
    [string]$UsdName = "usd",
    [string]$AppName = "cmt"
)

# Call near.exe directly: the npm wrapper hides failures (always exits 0).
$RealNear = Join-Path $env:APPDATA "npm\node_modules\near-cli-rs\node_modules\.bin_real\near.exe"
if (Test-Path $RealNear) { Set-Alias near $RealNear -Scope Script }

$Usd = "$UsdName.$Account"
$App = "$AppName.$Account"
$Members = @($Account, "bilal.$Account", "sara.$Account")
$Amount = "10000000"   # 10 tUSD (6 decimals)

function B64([string]$json) { [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json)) }
function Step([string]$text) { Write-Host "`n==> $text" -ForegroundColor Cyan }
function Stop([string]$text) { Write-Host "`nSTOPPED: $text Send the output above to Claude." -ForegroundColor Red; exit 1 }

# Sends a transaction and returns what the method returned (stdout).
function Call($contract, $method, $json, $signer, $deposit = '0 NEAR', $gas = '100.0 Tgas') {
    $out = near contract call-function as-transaction $contract $method base64-args (B64 $json) prepaid-gas $gas attached-deposit $deposit sign-as $signer network-config testnet sign-with-keychain send
    if ($LASTEXITCODE -ne 0) { Stop "$method by $signer failed." }
    return ($out | Out-String).Trim()
}
function View($contract, $method, $json) {
    $out = near contract call-function as-read-only $contract $method base64-args (B64 $json) network-config testnet now
    return ($out | Out-String).Trim()
}
function Pay($member, $action, $id) {
    $msg = '{\"action\":\"' + $action + '\",\"committee_id\":' + $id + '}'
    Call $Usd 'ft_transfer_call' ('{"receiver_id":"' + $App + '","amount":"' + $Amount + '","msg":"' + $msg + '"}') $member '1 yoctoNEAR' | Out-Null
}

Step "Making sure the helper members exist"
foreach ($m in $Members[1..2]) {
    near account view-account-summary $m network-config testnet now *> $null
    if ($LASTEXITCODE -eq 0) { continue }
    Write-Host "Creating $m. If asked for a signature scheme, press Enter."
    near account create-account fund-myself $m '1 NEAR' autogenerate-new-keypair save-to-keychain sign-as $Account network-config testnet sign-with-keychain send
}

Step "Topping up test dollars (skipped for anyone who has plenty)"
foreach ($m in $Members) {
    $bal = View $Usd 'ft_balance_of' ('{"account_id":"' + $m + '"}')
    if ([decimal]($bal.Trim('"')) -lt 100000000) { Call $Usd 'faucet' '{}' $m | Out-Null }
}

Step "Creating a committee with its own Sputnik DAO (attaching 6 NEAR)"
$id = Call $App 'create_committee' '{"name":"Family DAO test","amount":"10000000","size":3,"round_secs":60,"mode":"Draw"}' $Account '6 NEAR' '300.0 Tgas'
$id = ($id -split "`n")[-1].Trim()
if ($id -notmatch '^\d+$') { Stop "Could not read the committee id (got '$id')." }
Write-Host "Committee id: $id"

$c = View $App 'get_committee' ('{"committee_id":' + $id + '}') | ConvertFrom-Json
$Dao = $c.dao
if (-not $c.dao_ready) { Stop "The DAO $Dao was not created." }
Write-Host "DAO is live: $Dao" -ForegroundColor Green

Step "Members join with a 10 tUSD deposit (forwarded to the DAO)"
foreach ($m in $Members) { Pay $m 'join' $id }

Step "Organizer starts the committee"
Call $App 'start' ('{"committee_id":' + $id + '}') $Account | Out-Null

Step "Everyone pays round 1 (forwarded to the DAO)"
foreach ($m in $Members) { Pay $m 'contribute' $id }

$daoBal = View $Usd 'ft_balance_of' ('{"account_id":"' + $Dao + '"}')
Write-Host "DAO holds $daoBal (expect 60000000 = 60 tUSD)"

Step "Closing round 1: the lucky draw picks a winner, the DAO pays through a proposal"
Call $App 'advance_round' ('{"committee_id":' + $id + '}') $Account '0 NEAR' '300.0 Tgas' | Out-Null

Step "What happened"
$c = View $App 'get_committee' ('{"committee_id":' + $id + '}') | ConvertFrom-Json
$c.events | Where-Object { $_.kind -in @('Payout', 'DaoProposal') } |
    Format-Table round, kind, account_id, amount, note -AutoSize | Out-String -Width 200 | Write-Host
$last = View $Dao 'get_last_proposal_id' '{}'
$propId = [int]$last - 1
$p = View $Dao 'get_proposal' ('{"id":' + $propId + '}') | ConvertFrom-Json
Write-Host "DAO proposal #$propId status: $($p.status)  (expect Approved)"
$daoBal = View $Usd 'ft_balance_of' ('{"account_id":"' + $Dao + '"}')
Write-Host "DAO now holds $daoBal (60 tUSD minus what was paid out)"
Write-Host "`nSee the DAO's proposals: https://testnet.nearblocks.io/address/$Dao"
