// Everything a person can do, written once and used by both the wallet
// (real accounts) and the demo (ready-made accounts signed on the server).
import { CONTRACT, DAO_DEPOSIT_NEAR, TOKEN } from "./config";
import type { Committee, PayoutMode } from "./types";

export const ONE_YOCTO = 1n;
export const NEAR = 10n ** 24n;

export interface CallResult {
  /** The method's return value, if the signer could read it. */
  value?: unknown;
  /** Transaction hash, if known. */
  hash?: string;
}

export interface Actor {
  accountId: string;
  /** "wallet" signs in the person's wallet; "demo" signs on our server. */
  kind: "wallet" | "demo";
  call(receiverId: string, methodName: string, args: object, gasTgas: number, deposit: bigint): Promise<CallResult>;
}

export const faucet = (a: Actor) => a.call(TOKEN, "faucet", {}, 30, 0n);

export interface NewCommittee {
  name: string;
  amount: bigint;
  size: number;
  roundSecs: number;
  mode: PayoutMode;
  withDao: boolean;
}

export async function createCommittee(a: Actor, c: NewCommittee): Promise<number | undefined> {
  const r = await a.call(
    CONTRACT,
    "create_committee",
    { name: c.name, amount: c.amount.toString(), size: c.size, round_secs: c.roundSecs, mode: c.mode },
    300,
    c.withDao ? BigInt(DAO_DEPOSIT_NEAR) * NEAR : 0n,
  );
  const id = Number(r.value);
  return Number.isFinite(id) && id > 0 ? id : undefined;
}

function payInto(a: Actor, c: Committee, action: "join" | "contribute") {
  return a.call(
    TOKEN,
    "ft_transfer_call",
    {
      receiver_id: CONTRACT,
      amount: c.amount,
      msg: JSON.stringify({ action, committee_id: c.id }),
    },
    100,
    ONE_YOCTO,
  );
}

export const join = (a: Actor, c: Committee) => payInto(a, c, "join");
export const contribute = (a: Actor, c: Committee) => payInto(a, c, "contribute");
export const start = (a: Actor, c: Committee) => a.call(CONTRACT, "start", { committee_id: c.id }, 50, 0n);
export const advance = (a: Actor, c: Committee) => a.call(CONTRACT, "advance_round", { committee_id: c.id }, 300, 0n);
export const bid = (a: Actor, c: Committee, discountBps: number) =>
  a.call(CONTRACT, "place_bid", { committee_id: c.id, discount_bps: discountBps }, 30, 0n);
export const claim = (a: Actor, c: Committee) => a.call(CONTRACT, "claim", { committee_id: c.id }, 300, 0n);
export const recheckDao = (a: Actor, c: Committee) =>
  a.call(CONTRACT, "recheck_dao", { committee_id: c.id }, 50, 0n);

/** Turn a contract panic into something a person can act on. */
export function explainError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const m = raw.match(/Smart contract panicked: ([^"\n]+)/);
  const msg = (m ? m[1] : raw).replace(/\\n.*/, "").trim();
  if (/User rejected|rejected the request|cancel/i.test(msg)) return "You cancelled it in your wallet.";
  if (/NotEnoughBalance|not enough balance|LackBalanceForState/i.test(msg))
    return "Your account doesn't have enough NEAR to cover this. Get more from the testnet faucet.";
  if (/The account doesn't have enough balance|Not enough balance/i.test(msg))
    return "You don't have enough test dollars. Tap Get test dollars first.";
  return msg.length > 220 ? `${msg.slice(0, 220)}…` : msg;
}
