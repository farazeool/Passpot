"use client";

import { useEffect, useState } from "react";
import { getReputation } from "@/lib/near";
import { useToast } from "./Toast";
import * as act from "@/lib/actions";
import type { Actor } from "@/lib/actions";
import { TOKEN_SYMBOL } from "@/lib/config";
import { countdown, displayName, money } from "@/lib/format";
import { Name } from "@/lib/profile";
import type { Committee } from "@/lib/types";

interface Props {
  circle: Committee;
  actor: Actor | null;
  onDone: () => void;
  onSignIn: () => void;
  now: number;
}

/** What the current person can do right now, and nothing else. */
export function Actions({ circle: c, actor, onDone, onSignIn, now }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bidPct, setBidPct] = useState("5");
  const toast = useToast();
  const rule = c.min_clean_circles ?? 0;
  const [record, setRecord] = useState<{ finished: number; defaults: number } | null>(null);
  useEffect(() => {
    if (!rule || !actor || c.status !== "Open") return;
    getReputation(actor.accountId)
      .then((r) => setRecord(r.record))
      .catch(() => {});
  }, [rule, actor, c.status]);

  const me = actor ? c.members.find((m) => m.account_id === actor.accountId) : undefined;
  const isOrganizer = actor?.accountId === c.organizer;
  const amount = `${money(c.amount)} ${TOKEN_SYMBOL}`;
  const ended = now >= c.round_ends_ms;
  // In the demo, speak about the member being played; with a wallet, speak to the person.
  const who = actor?.kind === "demo" ? displayName(actor.accountId) : null;
  const youHave = who ? `${who} has` : "You've";
  const yourSub = who ? `${who}'s` : "Your";

  async function run(label: string, fn: () => Promise<act.CallResult>, done: string) {
    setBusy(label);
    setError(null);
    try {
      const r = await fn();
      toast(done, { hash: r?.hash });
      onDone();
    } catch (e) {
      setError(act.explainError(e));
    } finally {
      setBusy(null);
    }
  }

  const btn = (label: string, doing: string, fn: () => Promise<act.CallResult>, style = "btn-primary", done = "Done.") => (
    <button
      className={`btn ${style} w-full sm:w-auto`}
      disabled={!!busy}
      aria-busy={busy === label}
      onClick={() => run(label, fn, done)}
    >
      {busy === label && <span className="spinner" aria-hidden />}
      {busy === label ? doing.replace(/…$/, "") : label}
    </button>
  );
  const name = who ?? "You";

  const items: React.ReactNode[] = [];

  if (c.dao && !c.dao_ready) {
    items.push(
      <div key="dao" className="space-y-2">
        <p>The circle&apos;s DAO vault is being set up. No money can come in until it&apos;s confirmed.</p>
        {actor ? btn("Check the DAO", "Checking…", () => act.recheckDao(actor, c), "btn-quiet", "The DAO vault is confirmed.") : null}
      </div>,
    );
  } else if (!actor) {
    items.push(
      <div key="signin" className="space-y-2">
        <p>Connect a NEAR testnet wallet to join or pay.</p>
        <button className="btn btn-primary" onClick={onSignIn}>
          Connect wallet
        </button>
      </div>,
    );
  } else if (c.status === "Open") {
    if (!me && c.members.length < c.size) {
      items.push(
        <div key="join" className="space-y-2">
          <p>
            Join by locking a deposit of <strong className="num">{amount}</strong>. You get it back when the circle
            ends; it only covers you if you ever miss a payment.
          </p>
          {rule > 0 && (
            <p className="rounded-xl bg-marigold-wash border border-marigold/40 px-3 py-2 text-sm text-ink">
              This circle only takes members with at least {rule} clean circle{rule === 1 ? "" : "s"} and no missed
              circles on their savings record.
              {record && !isOrganizer
                ? record.defaults === 0 && record.finished >= rule
                  ? " Your record qualifies."
                  : ` ${youHave} finished ${record.finished} clean circle${record.finished === 1 ? "" : "s"}${record.defaults ? " and missed one" : ""}, so the contract will turn this join down.`
                : ""}
            </p>
          )}
          {rule > 0 && record && !isOrganizer && !(record.defaults === 0 && record.finished >= rule)
            ? null
            : btn(`Join and lock ${amount}`, "Joining…", () => act.join(actor, c), "btn-primary", `${name} joined and locked a ${amount} deposit.`)}
        </div>,
      );
    } else if (me && c.members.length < c.size) {
      items.push(
        <p key="wait">
          {who ? `${who} is in.` : "You're in."} Waiting for {c.size - c.members.length} more member{c.size - c.members.length === 1 ? "" : "s"}
          {isOrganizer ? " — share the link with them." : "."}
        </p>,
      );
    }
    if (c.members.length === c.size) {
      if (isOrganizer) {
        items.push(
          <div key="start" className="space-y-2">
            <p>Every seat is taken. Start round 1 when everyone is ready.</p>
            {btn("Start the circle", "Starting…", () => act.start(actor, c), "btn-pot", "Round 1 has started.")}
          </div>,
        );
      } else {
        items.push(<p key="wait-start">Every seat is taken. Waiting for <Name id={c.organizer} /> to start.</p>);
      }
    }
  } else if (c.status === "Running") {
    if (me && !me.paid_this_round) {
      items.push(
        <div key="pay" className="space-y-2">
          <p>
            {yourSub} round {c.round} payment of <strong className="num">{amount}</strong> is due
            {ended ? " — the round has ended, so it may be covered from your holdback." : ` in ${countdown(c.round_ends_ms - now)}.`}
          </p>
          {btn(`Pay ${amount}`, "Paying…", () => act.contribute(actor, c), "btn-primary", `${name} paid ${amount} for round ${c.round}.`)}
        </div>,
      );
    } else if (me) {
      items.push(<p key="paid">{youHave} paid for round {c.round}.</p>);
    }
    if (c.mode === "Bid" && me && me.paid_out_round == null) {
      const myBid = c.bids.find(([i]) => c.members[i]?.account_id === me.account_id);
      items.push(
        <div key="bid" className="space-y-2">
          <p>
            Need the pot this round? Offer a discount; the highest offer wins and the discount is shared with everyone
            still waiting.
            {myBid ? ` Your current offer: ${myBid[1] / 100}%.` : ""}
          </p>
          <div className="flex gap-2 items-center">
            <label className="sr-only" htmlFor="bid">
              Discount in percent
            </label>
            <input
              id="bid"
              className="field w-24 num"
              inputMode="decimal"
              value={bidPct}
              onChange={(e) => setBidPct(e.target.value)}
            />
            <span className="text-muted">%</span>
            {btn("Offer discount", "Offering…", () => act.bid(actor, c, Math.round(Number(bidPct) * 100)), "btn-quiet", `Offered a ${bidPct}% discount for this round's pot.`)}
          </div>
        </div>,
      );
    }
    if (c.can_advance || ended) {
      const everyonePaid = c.members.every((m) => m.paid_this_round);
      items.push(
        <div key="advance" className="space-y-2">
          <p>
            {everyonePaid
              ? "Everyone has paid. Anyone can close the round now."
              : "The round has ended. Closing it covers missed payments from holdback and deposits."}{" "}
            {c.mode === "Draw" || (c.mode === "Bid" && c.bids.length === 0)
              ? "An on-chain lucky draw picks who gets the pot."
              : c.mode === "Order"
                ? "The pot goes to the next member in the agreed order."
                : "The highest discount offer wins the pot."}
          </p>
          {btn(
            c.mode === "Order" ? "Close round and pay out" : "Close round and run the draw",
            "Closing…",
            () => act.advance(actor, c),
            "btn-pot",
            `Round ${c.round} closed and the pot went out. Watch the circle.`,
          )}
        </div>,
      );
    }
  } else if (c.status === "Finished") {
    if (me && !me.claimed) {
      const total = BigInt(me.deposit) + BigInt(me.holdback) + BigInt(me.bonus);
      items.push(
        <div key="claim" className="space-y-2">
          <p>
            The circle is done. Take back <strong className="num">{money(total)} {TOKEN_SYMBOL}</strong>: your
            deposit, any holdback, and shared discounts.
          </p>
          {btn(`Claim ${money(total)} ${TOKEN_SYMBOL}`, "Claiming…", () => act.claim(actor, c), "btn-pot", `${name} claimed ${money(total)} ${TOKEN_SYMBOL}.`)}
        </div>,
      );
    } else if (me) {
      items.push(<p key="claimed">{youHave} claimed everything. This circle is complete.</p>);
    } else {
      items.push(<p key="done">This circle is complete.</p>);
    }
  }

  if (items.length === 0) items.push(<p key="none">Nothing for you to do right now.</p>);

  if (me) {
    items.push(
      <p key="statement" className="text-sm">
        <a className="link" href={`/c/${c.id}/statement/${encodeURIComponent(me.account_id)}`}>
          {who ? `${who}'s` : "Your"} statement
        </a>
        : every payment in and out, ready to print or save as PDF.
      </p>,
    );
  }

  return (
    <div className="space-y-4">
      {items}
      {error && (
        <p role="alert" className="text-sm text-missed bg-missed-wash rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}
