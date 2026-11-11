// End-to-end check of the "agreed order" and "bidding" payout modes on NEAR testnet.
// Runs one full 3-member circle of each, using the three demo accounts in .env.local.
// Usage (from the web folder):  node scripts/test-modes.mjs
import { readFileSync } from "node:fs";
import { Account, JsonRpcProvider, KeyPairSigner } from "near-api-js";

const CONTRACT = "cmt.fatneek-committee.testnet";
const TOKEN = "usd.fatneek-committee.testnet";
const RPC = "https://rpc.testnet.near.org";
const AMOUNT = 10_000_000n; // 10 tUSD (6 decimals)
const TGAS = 1_000_000_000_000n;

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const line = env.split(/\r?\n/).find((l) => l.startsWith("DEMO_ACCOUNTS="));
if (!line) throw new Error("DEMO_ACCOUNTS not found in web/.env.local");
const demo = JSON.parse(line.slice("DEMO_ACCOUNTS=".length).replace(/^'|'$/g, ""));
const provider = new JsonRpcProvider({ url: RPC });
const [ayesha, bilal, sara] = demo.map((d) => new Account(d.id, provider, KeyPairSigner.fromSecretKey(d.key)));
const short = (id) => id.split("-")[0];

async function view(method, args) {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "query",
      params: {
        request_type: "call_function",
        finality: "optimistic",
        account_id: CONTRACT,
        method_name: method,
        args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
      },
    }),
  }).then((x) => x.json());
  if (r.error || r.result?.error) throw new Error(JSON.stringify(r.error ?? r.result.error));
  return JSON.parse(Buffer.from(r.result.result).toString());
}

async function call(acc, receiver, method, args, tgas = 100n, deposit = 0n) {
  for (let i = 0; i < 3; i++) {
    try {
      return await acc.callFunctionRaw({
        contractId: receiver,
        methodName: method,
        args,
        deposit,
        gas: tgas * TGAS,
        waitUntil: "EXECUTED_OPTIMISTIC",
      });
    } catch (e) {
      const msg = String(e?.message ?? e);
      if (i < 2 && /fetch failed|timeout|429|502|503|504|ECONN/i.test(msg)) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      throw new Error(`${short(acc.accountId)} ${method}: ${msg.slice(0, 300)}`);
    }
  }
}

const pay = (acc, id, action) =>
  call(acc, TOKEN, "ft_transfer_call", {
    receiver_id: CONTRACT,
    amount: AMOUNT.toString(),
    msg: JSON.stringify({ action, committee_id: id }),
  }, 100n, 1n);

const money = (v) => (Number(BigInt(v)) / 1e6).toFixed(2);
let failures = 0;
const check = (ok, text) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${text}`);
  if (!ok) failures++;
};

async function runCircle(mode, label, beforeRound) {
  console.log(`\n=== ${label} (${mode}) ===`);
  const before = await view("get_config", {});
  await call(ayesha, CONTRACT, "create_committee", {
    name: `Test: ${label}`,
    amount: AMOUNT.toString(),
    size: 3,
    round_secs: 60,
    mode,
  }, 300n);
  const id = Number(before.committees) + 1;
  let c = await view("get_committee", { committee_id: id });
  check(c && c.mode === mode, `circle #${id} created as ${mode}`);

  for (const m of [ayesha, bilal, sara]) await pay(m, id, "join");
  await call(ayesha, CONTRACT, "start", { committee_id: id }, 50n);
  c = await view("get_committee", { committee_id: id });
  check(c.status === "Running" && c.members.length === 3, "3 members joined and round 1 started");

  const winners = [];
  for (let round = 1; round <= 3; round++) {
    if (beforeRound) await beforeRound(id, round);
    for (const m of [ayesha, bilal, sara]) await pay(m, id, "contribute");
    await call(sara, CONTRACT, "advance_round", { committee_id: id }, 300n);
    c = await view("get_committee", { committee_id: id });
    const p = c.events.filter((e) => e.kind === "Payout" && e.round === round).pop();
    winners.push(short(p?.account_id ?? "nobody"));
    console.log(`  round ${round}: ${short(p?.account_id ?? "nobody")} got ${p ? money(p.amount) : "0"} tUSD (${p?.note ?? "no payout"})`);
  }
  check(c.status === "Finished", "circle finished after 3 rounds");
  return { id, winners, c };
}

console.log("Topping up demo members with test dollars…");
for (const m of [ayesha, bilal, sara]) await call(m, TOKEN, "faucet", {}, 30n).catch(() => {});

// 1. Agreed order: the pot goes round in the order members joined.
const order = await runCircle("Order", "agreed order");
check(order.winners.join(",") === "ayesha,bilal,sara", `payout order ${order.winners.join(" → ")} matches join order`);

// 2. Bidding: Bilal offers a 10% discount in round 1 to get the pot first.
const bidding = await runCircle("Bid", "bidding", async (id, round) => {
  if (round === 1) await call(bilal, CONTRACT, "place_bid", { committee_id: id, discount_bps: 1000 }, 30n);
});
check(bidding.winners[0] === "bilal", `Bilal's 10% bid won round 1 (winner: ${bidding.winners[0]})`);
const bidEvent = bidding.c.events.find((e) => e.kind === "Bid");
check(!!bidEvent, "the bid is in the circle's history");

console.log(
  failures
    ? `\n${failures} check(s) FAILED. Paste this whole output to Claude.`
    : `\nAll checks passed. Circles #${order.id} and #${bidding.id} are on the site for you to look at.`,
);
