// Derive the register (who paid what, when) from a circle's on-chain events.
import type { Committee, CommitteeEvent } from "./types";

export type Cell = "paid" | "covered" | "missed" | "due" | "future" | "none";

export interface Row {
  accountId: string;
  cells: Cell[]; // index 0 = round 1
  receivedRound: number | null;
  receivedAmount: bigint;
}

export function register(c: Committee): Row[] {
  const rows = new Map<string, Row>(
    c.members.map((m) => [
      m.account_id,
      {
        accountId: m.account_id,
        cells: Array.from({ length: c.size }, () => "future" as Cell),
        receivedRound: m.paid_out_round,
        receivedAmount: 0n,
      },
    ]),
  );
  for (const e of c.events) {
    if (!e.account_id || e.round < 1) continue;
    const row = rows.get(e.account_id);
    if (!row) continue;
    const i = e.round - 1;
    if (e.kind === "Contributed") row.cells[i] = "paid";
    if (e.kind === "Covered" && row.cells[i] !== "missed") row.cells[i] = "covered";
    if (e.kind === "Shortfall") row.cells[i] = "missed";
    if (e.kind === "Payout") row.receivedAmount += BigInt(e.amount);
  }
  if (c.status === "Running") {
    for (const row of rows.values()) {
      if (row.cells[c.round - 1] === "future") row.cells[c.round - 1] = "due";
    }
  }
  return [...rows.values()];
}

/** Payout events with the round they belong to. */
export function payouts(c: Committee): CommitteeEvent[] {
  return c.events.filter((e) => e.kind === "Payout");
}

export function howChosen(note: string | null): string {
  if (!note) return "";
  if (note.startsWith("lucky draw")) return "lucky draw";
  if (note.startsWith("won bid")) {
    const bps = Number(note.match(/(\d+) bps/)?.[1] ?? 0);
    return `won the bid at ${bps / 100}%`;
  }
  if (note.startsWith("next in agreed order")) return "next in the agreed order";
  return note.split(";")[0];
}

export function heldBack(note: string | null): bigint {
  const m = note?.match(/held back (\d+)/);
  return m ? BigInt(m[1]) : 0n;
}

export function drawSeed(note: string | null): string | null {
  return note?.match(/seed ([0-9a-f]{64})/)?.[1] ?? null;
}
