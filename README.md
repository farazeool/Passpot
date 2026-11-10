# Rota

**The savings circle nobody can run off with.**

A rotating savings circle (economists call it a ROSCA) is one of the oldest ways people save and borrow without banks. Friends or family each pay the same amount every month, and one of them takes the whole pot, until everyone has had a turn. It's a *committee* in Pakistan and India, a *susu* in Ghana and the Caribbean, a *tanda* in Mexico, a *chama* in Kenya, a *hui* in China and a *tontine* in West Africa.

Circles break in three ways:
- **Someone takes the pot early and stops paying.** That's why circles usually only work among close family.
- **The organizer holds all the cash** and can disappear with it.
- **Nobody can prove who paid**, so disputes happen over notebooks and WhatsApp.

Rota runs the whole circle on NEAR:

| Problem | What Rota does |
| --- | --- |
| The organizer holds the cash | Each circle gets its **own Sputnik DAO**. Its only council member is the Rota contract, so no person (not even the organizer) can move the money. Payouts leave through the DAO's own Transfer proposals. |
| Someone takes the pot and stops paying | Early winners have part of the pot **held back** and released as they keep paying. A missed payment is covered from holdback, then from their deposit, so the next winner still gets the full pot. |
| Who gets the pot is rigged | An **on-chain lucky draw** using NEAR's random seed (or an agreed order, or discount bidding). The seed is recorded, so anyone can replay the draw. |
| Nobody can prove who paid | Every payment, payout and draw is an on-chain event. A **Verify page** re-checks everything in your browser, straight from the chain. |
| Nobody remembers to close the round | The **Rota agent** runs every five minutes and closes any round whose time is up, covering missed payments and running the draw. Anyone can close a round; the agent makes sure someone always does. |
| Trust doesn't travel | Finished circles build a **reputation** that lowers your holdback next time: 50% for new members, 25% after one clean circle, none after three. |

> Built at NEAR HACKATHON for the **Social Money** and **Real-World Money** tracks.

## Try it

- **Live app:** _(Vercel URL)_. **Try a demo circle** drops you straight into a live circle already on round 2, where you can act as Ayesha, Bilal or Sara without a wallet. Or connect a NEAR testnet wallet and start your own.
- **Contracts on testnet:** Rota `cmt.fatneek-committee.testnet`, test dollars `usd.fatneek-committee.testnet`.
- **A real circle's DAO:** [`cmt-fatneek-committee-1.sputnikv2.testnet`](https://testnet.nearblocks.io/address/cmt-fatneek-committee-1.sputnikv2.testnet). Proposal #0 paid the round-1 winner.

## How the money moves

```
member ──ft_transfer_call──▶ Rota contract ──ft_transfer──▶ the circle's Sputnik DAO
                                   │                                     │
                    rules: draw, holdback,              add_proposal(Transfer) + act_proposal(VoteApprove)
                    default cover, reputation                            │
                                   └──────────── payout ◀────────────────┘
```

1. **Create.** The organizer attaches 6 NEAR. The contract asks the Sputnik factory (`sputnikv2.testnet`) for a DAO whose only council member is the contract. The exact policy is public via `get_dao_policy`.
2. **Join.** Each member locks one contribution as a deposit (`ft_transfer_call` with `{"action":"join"}`). It's forwarded straight to the DAO.
3. **Pay.** Each round, members pay in (`{"action":"contribute"}`), forwarded to the DAO.
4. **Close the round.** Anyone can call `advance_round` once everyone has paid or the time is up. The contract covers misses, picks the recipient, then files a Transfer proposal on the DAO and approves it. The DAO pays.
5. **Claim.** After the last round, members take back their deposit, any remaining holdback and shared bid discounts, also through DAO proposals.

Anything that fails partway (a transfer, a forward, the DAO's reply) is recorded and can be retried by anyone: `retry_payout`, `retry_forward`, `recheck_dao`. Nothing is lost.

## What's here

| Path | What it is |
| --- | --- |
| `contracts/committee` | The Rota contract (Rust, near-sdk 5). **`src/core.rs` holds every rule with no blockchain code**, so the rules are unit-tested on their own. `src/lib.rs` is the NEAR glue: token payments, Sputnik DAO custody, callbacks. |
| `contracts/testusd` | testUSD: a NEP-141 test-dollar token (6 decimals) with a `faucet()`, so anyone can try Rota for free. |
| `web/src/app/api/agent` | The Rota agent: closes due rounds in every circle, and keeps one live demo circle ready on round 2. Run by GitHub Actions every five minutes (`.github/workflows/agent.yml`), with Vercel Cron daily as a backup. |
| `web` | The app (Next.js). Circle page with the circle and the register, the Verify page, the no-wallet demo, create and profile pages. |
| `scripts` | Testnet scripts (PowerShell): deploy, smoke test, DAO test, demo setup. |

## Run the tests

```
cargo test
```

34 tests cover full cycles, conservation of money (everything paid in comes back out), holdback and default cover, every payout mode, bad payments being refunded, and the DAO flow: factory call, forwarding, proposal then approval, failure and retry paths.

## Deploy your own (testnet)

Needs Rust with `wasm32-unknown-unknown`, [`cargo-near`](https://github.com/near/cargo-near), [`near-cli-rs`](https://github.com/near/near-cli-rs), and a testnet account with about 20 NEAR.

```
.\scripts\deploy.ps1 -Account your-name.testnet      # testUSD + Rota
.\scripts\dao-test.ps1 -Account your-name.testnet    # one round through a real Sputnik DAO
.\scripts\setup-demo.ps1 -Account your-name.testnet  # demo members for the website
```

Then the web app (locally, or on Vercel with **Root Directory** set to `web`):

```
cd web
cp .env.example .env.local   # set the contract names; setup-demo.ps1 adds DEMO_ACCOUNTS
npm install
npm run dev
```

On Vercel, set `DEMO_ACCOUNTS` (from `web/.env.local`) and a random `CRON_SECRET`. For the five-minute agent, add two GitHub repository secrets: `ROTA_URL` (your Vercel URL) and the same `CRON_SECRET`.

Every circle page also has: an **Invite on WhatsApp** link while seats are open, a **reminder** listing who still owes this round, and a printable **statement** per member.

## Honest limits

- **Testnet only.** testUSD has no value. Mainnet would use a real stablecoin and need an audit.
- **Holdback and deposits reduce default risk; they don't remove it.** Someone who misses more than their holdback and deposit leaves a shortfall in that round's pot. It's recorded on-chain and hits their reputation.
- **The lucky draw uses NEAR's block random seed.** That's fair for a savings circle, but a block producer could in theory influence it. It's not casino-grade randomness.
- **A DAO costs 6 NEAR** of storage (the Sputnik factory's price). Without the deposit, a circle's money is held by the contract itself, which is useful for quick tests.
- **Demo members are signed by the website's server** with testnet-only keys, so judges can try it without a wallet. They can only call Rota and testUSD.

## Roadmap

- Pay in from any chain through NEAR Intents (1Click deposit addresses).
- Reputation as a portable, non-transferable credential other apps can read.
- A small insurance pool that covers defaults beyond holdback.
- Urdu and Arabic interface; reminders before due dates.
- A remittance link: family abroad pays a member's contribution directly.
