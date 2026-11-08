# Committee

**A trusted committee without needing to trust the organizer.**

Committees (ROSCAs, chit funds) are how millions of families in Pakistan, India and the Gulf save and borrow without banks. Everyone pays in each month and one member takes the whole pot, until everyone has had a turn. They break when someone takes the pot early and stops paying, when the organizer disappears with the cash, or when nobody can prove who paid.

Committee runs the whole circle on NEAR:

- **The pot pays out by rule.** Each round the contract picks the recipient: an on-chain lucky draw (default), an agreed order, or an optional discount bid.
- **Skipping doesn't break the circle.** Part of an early payout is held back and released as you keep paying; a missed payment is covered from it, then from your deposit.
- **Reliability becomes portable.** Finished committees build a reputation that lowers your holdback next time.

> Built at NEAR HACKATHON for the Social Money and Real-World Money tracks. Work in progress: this README grows as features land.

## What's here

| Path | What it is |
| --- | --- |
| `contracts/committee` | The Committee contract (Rust, near-sdk 5). Rules live in `src/core.rs`, separate from blockchain glue, so every rule is unit-tested. |
| `contracts/testusd` | testUSD: a NEP-141 test-dollar token with a faucet, so anyone can try Committee without buying anything. |
| `scripts/` | Deploy and smoke-test scripts for testnet (PowerShell). |

## Run the tests

```
cargo test
```

## Deploy to testnet

Needs Rust with the `wasm32-unknown-unknown` target, `cargo-near`, `near-cli-rs`, and a testnet account with about 10 NEAR in your keychain.

```
.\scripts\deploy.ps1 -Account your-name.testnet
.\scripts\smoke-test.ps1 -Account your-name.testnet
```

## How payments work

Members pay with `ft_transfer_call` on the token, sending a message to the Committee contract:

```json
{"action": "join", "committee_id": 1}
{"action": "contribute", "committee_id": 1}
```

A payment with the wrong amount, for the wrong committee, or twice in a round is refunded automatically.

## Honest limits

- Testnet only; testUSD is not real money.
- Holdback and deposits reduce default risk; they don't remove it. A member who misses more than their holdback and deposit leaves a shortfall in that round's pot, which is recorded on-chain.
- The lucky draw uses NEAR's built-in random seed: fair for a savings circle, but not casino-grade.
