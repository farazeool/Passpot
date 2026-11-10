// The Rota agent. Runs every few minutes (GitHub Actions, with Vercel Cron as
// a backup) and does two jobs nobody should have to remember:
//  1. Closes any round whose time is up, in any circle. Closing covers missed
//     payments from holdback and runs the draw. Anyone may call advance_round;
//     the agent just makes sure someone always does.
//  2. Keeps one live demo circle ready on round 2, with real history, so a
//     visitor lands in a circle that's already going.
// Each run does a bounded amount of work and picks up where the last one left off.
import { CONTRACT, DAO_DEPOSIT_NEAR, LIVE_DEMO_PREFIX, TOKEN } from "@/lib/config";
import { getCommittee, getCommittees, getTokenBalance } from "@/lib/near";
import { demoAccounts, nearBalance, signAndSend, type DemoAccount } from "@/lib/server/signer";
import type { Committee } from "@/lib/types";

export const maxDuration = 60;

const NEAR = 10n ** 24n;
const BUDGET_MS = 45_000;
const STEP_MS = 12_000; // a transaction rarely takes longer
const DEMO_AMOUNT = 10_000_000n; // 10 tUSD
const DEMO_ROUND_SECS = 86_400; // a day, so the demo circle waits for visitors

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV === "development"; // local testing only

  const header = req.headers.get("authorization");
  const key = new URL(req.url).searchParams.get("key");
  return header === `Bearer ${secret}` || key === secret;
}

async function allCircles(): Promise<Committee[]> {
  const out: Committee[] = [];
  for (let from = 0; ; from += 50) {
    const page = await getCommittees(from, 50);
    out.push(...page);
    if (page.length < 50) return out;
  }
}

const pay = (who: DemoAccount, c: Committee, action: "join" | "contribute") =>
  signAndSend(
    who,
    TOKEN,
    "ft_transfer_call",
    { receiver_id: CONTRACT, amount: c.amount, msg: JSON.stringify({ action, committee_id: c.id }) },
    100,
    1n,
  );

async function topUp(who: DemoAccount, log: string[]) {
  if ((await getTokenBalance(who.id)) < DEMO_AMOUNT * 5n) {
    await signAndSend(who, TOKEN, "faucet", {}, 30, 0n);
    log.push(`Topped up ${who.id} with test dollars`);
  }
}

async function run(): Promise<{ ok: boolean; did: string[]; error?: string }> {
  const started = Date.now();
  const timeLeft = () => BUDGET_MS - (Date.now() - started);
  const did: string[] = [];
  const accounts = demoAccounts();
  if (accounts.length < 3) return { ok: false, did, error: "DEMO_ACCOUNTS isn't set." };
  const [organizer, ...others] = accounts;
  const members = [organizer, ...others];

  try {
    const circles = await allCircles();
    const now = Date.now();

    // 1. Close every round whose time is up.
    for (const c of circles) {
      if (c.status !== "Running" || now < c.round_ends_ms) continue;
      if (timeLeft() < STEP_MS) break;
      const unpaid = c.members.filter((m) => !m.paid_this_round).length;
      await signAndSend(organizer, CONTRACT, "advance_round", { committee_id: c.id }, 300, 0n);
      did.push(`Closed round ${c.round} of circle #${c.id}${unpaid ? ` (${unpaid} missed payment${unpaid === 1 ? "" : "s"} covered)` : ""}`);
    }

    // 2. Keep a live demo circle on round 2.
    let live: Committee | undefined = circles
      .filter((c) => c.organizer === organizer.id && c.name.startsWith(LIVE_DEMO_PREFIX) && c.status !== "Finished")
      .sort((a, b) => b.id - a.id)[0];

    if (!live && timeLeft() > STEP_MS) {
      const withDao = (await nearBalance(organizer.id)) >= BigInt(DAO_DEPOSIT_NEAR) * NEAR + (15n * NEAR) / 10n;
      const r = await signAndSend(
        organizer,
        CONTRACT,
        "create_committee",
        {
          name: `${LIVE_DEMO_PREFIX} Ayesha's family circle`,
          amount: DEMO_AMOUNT.toString(),
          size: members.length,
          round_secs: DEMO_ROUND_SECS,
          mode: "Draw",
        },
        300,
        withDao ? BigInt(DAO_DEPOSIT_NEAR) * NEAR : 0n,
      );
      const id = Number(r.value);
      did.push(`Created live demo circle #${id}${withDao ? " with its own DAO" : ""}`);
      live = (await getCommittee(id)) ?? undefined;
    }

    while (live && timeLeft() > STEP_MS) {
      const c: Committee | null = await getCommittee(live.id);
      if (!c) break;
      live = c;
      const joined = new Set(c.members.map((m) => m.account_id));
      if (c.dao && !c.dao_ready) {
        await signAndSend(organizer, CONTRACT, "recheck_dao", { committee_id: c.id }, 50, 0n);
        did.push(`Confirmed the DAO of circle #${c.id}`);
      } else if (c.status === "Open" && c.members.length < c.size) {
        const next = members.find((m) => !joined.has(m.id))!;
        await topUp(next, did);
        await pay(next, c, "join");
        did.push(`${next.id} joined circle #${c.id}`);
      } else if (c.status === "Open") {
        await signAndSend(organizer, CONTRACT, "start", { committee_id: c.id }, 50, 0n);
        did.push(`Started circle #${c.id}`);
      } else if (c.status === "Running" && c.round === 1) {
        const unpaid = members.find((m) => c.members.some((x) => x.account_id === m.id && !x.paid_this_round));
        if (unpaid) {
          await topUp(unpaid, did);
          await pay(unpaid, c, "contribute");
          did.push(`${unpaid.id} paid round 1 of circle #${c.id}`);
        } else {
          await signAndSend(organizer, CONTRACT, "advance_round", { committee_id: c.id }, 300, 0n);
          did.push(`Closed round 1 of circle #${c.id}: the draw picked a winner`);
        }
      } else if (c.status === "Running" && c.round === 2) {
        const me = c.members.find((m) => m.account_id === organizer.id);
        if (me && !me.paid_this_round) {
          await topUp(organizer, did);
          await pay(organizer, c, "contribute");
          did.push(`${organizer.id} paid round 2 of circle #${c.id}; ready for visitors`);
        }
        break;
      } else {
        break;
      }
    }
    return { ok: true, did };
  } catch (e) {
    return { ok: false, did, error: e instanceof Error ? e.message : String(e) };
  }
}

async function handle(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Not authorized." }, { status: 401 });
  const result = await run();
  return Response.json(result, { status: result.ok ? 200 : 500 });
}

export const GET = handle;
export const POST = handle;
