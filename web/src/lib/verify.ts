// Independent checks a member (or a judge) can run in their own browser,
// straight against the chain: nothing here trusts the app's server.
import { CONTRACT, TOKEN, TOKEN_SYMBOL } from "./config";
import { displayName, money } from "./format";
import { drawSeed } from "./ledger";
import { getTokenBalance, view } from "./near";
import type { Committee } from "./types";

export interface Check {
  title: string;
  ok: boolean | null; // null = not applicable
  detail: string;
  items?: { ok: boolean; text: string }[];
}

interface Proposal {
  id: number;
  proposer: string;
  description: string;
  kind: Record<string, { token_id?: string; receiver_id?: string; amount?: string }> | string;
  status: string;
}

interface Policy {
  roles: { name: string; kind: unknown; permissions: string[] }[];
}

/** Rebuild the lucky draw: first 8 bytes of the seed, little-endian, mod the number still waiting. */
export function replayDraw(seedHex: string, waitingCount: number): number {
  let v = 0n;
  for (let i = 7; i >= 0; i--) v = (v << 8n) + BigInt(parseInt(seedHex.slice(i * 2, i * 2 + 2), 16));
  return Number(v % BigInt(waitingCount));
}

export async function runChecks(c: Committee): Promise<Check[]> {
  const checks: Check[] = [];
  const sum = (kinds: string[]) =>
    c.events.filter((e) => kinds.includes(e.kind)).reduce((s, e) => s + BigInt(e.amount), 0n);

  // 1. Who controls the money.
  if (c.dao) {
    try {
      const policy = await view<Policy>(c.dao, "get_policy");
      const movers = policy.roles.filter((r) =>
        r.permissions.some((p) => p === "*:*" || p.startsWith("transfer:") || p.startsWith("*:VoteApprove")),
      );
      const onlyContract = movers.every((r) => {
        const k = r.kind as { Group?: string[] };
        return Array.isArray(k?.Group) && k.Group.length === 1 && k.Group[0] === CONTRACT;
      });
      checks.push({
        title: "Only the circle's rules can move the money",
        ok: movers.length > 0 && onlyContract,
        detail: onlyContract
          ? `The DAO's only member with power to approve payments is the Rota contract (${CONTRACT}). Everyone else can only file non-binding polls.`
          : "The DAO policy gives payment power to someone other than the Rota contract.",
        items: policy.roles.map((r) => ({
          ok: true,
          text: `Role "${r.name}": ${JSON.stringify(r.kind)} can ${r.permissions.join(", ")}`,
        })),
      });
    } catch (e) {
      checks.push({ title: "Only the circle's rules can move the money", ok: false, detail: `Couldn't read the DAO policy: ${e}` });
    }
  } else {
    checks.push({
      title: "Only the circle's rules can move the money",
      ok: null,
      detail: "This is a test circle without its own DAO; the Rota contract holds its money directly.",
    });
  }

  // 2. Money in = money out + money still held.
  const paidIn = sum(["Joined", "Contributed"]);
  const paidOut = sum(["Payout", "Claimed"]);
  const held = BigInt(c.held);
  checks.push({
    title: "Every unit is accounted for",
    ok: paidIn - paidOut === held,
    detail: `Paid in ${money(paidIn)} ${TOKEN_SYMBOL} (deposits and contributions) − paid out ${money(paidOut)} ${TOKEN_SYMBOL} (pots and claims) = ${money(paidIn - paidOut)} ${TOKEN_SYMBOL}. The circle's records say it holds ${money(held)} ${TOKEN_SYMBOL}.`,
  });

  // 3. The vault really holds it.
  if (c.dao) {
    try {
      const balance = await getTokenBalance(c.dao);
      const expected = held - BigInt(c.unforwarded);
      checks.push({
        title: "The DAO really holds it",
        ok: balance === expected,
        detail: `${TOKEN} reports the DAO's balance as ${money(balance)} ${TOKEN_SYMBOL}; the circle expects ${money(expected)} ${TOKEN_SYMBOL}.`,
      });
    } catch (e) {
      checks.push({ title: "The DAO really holds it", ok: false, detail: `Couldn't read the balance: ${e}` });
    }
  }

  // 4. Every payout went through an approved DAO proposal.
  const payoutEvents = c.events.filter((e) => e.kind === "Payout" || e.kind === "Claimed").filter((e) => BigInt(e.amount) > 0n);
  if (c.dao) {
    try {
      const proposals = await view<Proposal[]>(c.dao, "get_proposals", { from_index: 0, limit: 200 });
      const transfers = proposals.filter((p) => typeof p.kind === "object" && "Transfer" in p.kind);
      const used = new Set<number>();
      const items = payoutEvents.map((e) => {
        const match = transfers.find(
          (p) =>
            !used.has(p.id) &&
            typeof p.kind === "object" &&
            p.kind.Transfer?.receiver_id === e.account_id &&
            p.kind.Transfer?.amount === e.amount &&
            p.kind.Transfer?.token_id === c.token,
        );
        if (match) used.add(match.id);
        const ok = !!match && match.status === "Approved" && match.proposer === CONTRACT;
        return {
          ok,
          text: match
            ? `${displayName(e.account_id!)}: ${money(e.amount)} ${TOKEN_SYMBOL} via proposal #${match.id}, filed by the contract, ${match.status}`
            : `${displayName(e.account_id!)}: ${money(e.amount)} ${TOKEN_SYMBOL}, no matching proposal yet`,
        };
      });
      const unexplained = transfers.filter((p) => !used.has(p.id));
      checks.push({
        title: "Every payout went through the DAO's own proposals",
        ok: items.every((i) => i.ok) && unexplained.length === 0,
        detail:
          payoutEvents.length === 0
            ? "No payouts yet."
            : `${items.filter((i) => i.ok).length} of ${items.length} payout${items.length === 1 ? "" : "s"} match an approved Transfer proposal. ${
                unexplained.length ? `${unexplained.length} transfer proposal(s) don't match any payout.` : "No other transfers left the DAO."
              }`,
        items,
      });
    } catch (e) {
      checks.push({ title: "Every payout went through the DAO's own proposals", ok: false, detail: `Couldn't read proposals: ${e}` });
    }
  }

  // 5. Every draw can be replayed.
  const paidSoFar = new Set<string>();
  const drawItems: { ok: boolean; text: string }[] = [];
  for (const e of c.events) {
    if (e.kind !== "Payout" || !e.account_id) continue;
    const waiting = c.members.map((m) => m.account_id).filter((a) => !paidSoFar.has(a));
    const seed = drawSeed(e.note);
    if (seed) {
      const expected = waiting[replayDraw(seed, waiting.length)];
      drawItems.push({
        ok: expected === e.account_id,
        text: `Round ${e.round}: seed ${seed.slice(0, 12)}… picks #${replayDraw(seed, waiting.length) + 1} of ${waiting.length} still waiting → ${displayName(expected)}${expected === e.account_id ? "" : ` (but ${displayName(e.account_id)} was paid)`}`,
      });
    } else if (e.note?.startsWith("next in agreed order")) {
      drawItems.push({
        ok: waiting[0] === e.account_id,
        text: `Round ${e.round}: next in the agreed order is ${displayName(waiting[0])}`,
      });
    } else if (e.note?.startsWith("won bid")) {
      const bps = e.note.match(/(\d+) bps/)?.[1];
      const bidEvent = c.events.find(
        (b) => b.kind === "Bid" && b.round === e.round && b.account_id === e.account_id && b.note === `${bps} bps`,
      );
      drawItems.push({
        ok: !!bidEvent,
        text: `Round ${e.round}: ${displayName(e.account_id)} won with a ${Number(bps) / 100}% discount bid`,
      });
    }
    paidSoFar.add(e.account_id);
  }
  checks.push({
    title: "Every winner can be re-checked",
    ok: drawItems.length ? drawItems.every((i) => i.ok) : null,
    detail: drawItems.length
      ? "For each lucky draw, the recorded random seed is replayed here exactly as the contract does: the first 8 bytes as a number, modulo the members still waiting."
      : "No rounds have paid out yet.",
    items: drawItems,
  });

  // 6. Nobody paid twice, nobody received twice.
  const seen = new Set<string>();
  let doubles = 0;
  for (const e of c.events) {
    if (e.kind !== "Contributed") continue;
    const k = `${e.round}:${e.account_id}`;
    if (seen.has(k)) doubles++;
    seen.add(k);
  }
  const receivers = c.events.filter((e) => e.kind === "Payout").map((e) => e.account_id);
  const twice = receivers.length - new Set(receivers).size;
  checks.push({
    title: "Nobody paid twice or got the pot twice",
    ok: doubles === 0 && twice === 0,
    detail: `${seen.size} contribution${seen.size === 1 ? "" : "s"} recorded, ${doubles} duplicate${doubles === 1 ? "" : "s"}. ${receivers.length} pot${receivers.length === 1 ? "" : "s"} paid out, ${twice} to someone who'd already had one.`,
  });

  return checks;
}
