"use client";

import { useState } from "react";
import * as act from "@/lib/actions";
import type { Actor } from "@/lib/actions";
import { TOKEN_SYMBOL } from "@/lib/config";
import { countdown, displayName, money } from "@/lib/format";
import type { Committee } from "@/lib/types";

interface Props {
  committee: Committee;
  actor: Actor | null;
  onDone: () => void;
  onSignIn: () => void;
  now: number;
}

/** What the current person can do right now, and nothing else. */
export function Actions({ committee: c, actor, onDone, onSignIn, now }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bidPct, setBidPct] = useState("5");

  const me = actor ? c.members.find((m) => m.account_id === actor.accountId) : undefined;
  const isOrganizer = actor?.accountId === c.organizer;
  const amount = `${money(c.amount)} ${TOKEN_SYMBOL}`;
  const ended = now >= c.round_ends_ms;

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
      onDone();
    } catch (e) {
      setError(act.explainError(e));
    } finally {
      setBusy(null);
    }
  }

  const btn = (label: string, doing: string, fn: () => Promise<unknown>, style = "btn-primary") => (
    <button className={`btn ${style} w-full sm:w-auto`} disabled={!!busy} onClick={() => run(label, fn)}>
      {busy === label ? doing : label}
    </button>
  );

  const items: React.ReactNode[] = [];

  if (c.dao && !c.dao_ready) {
    items.push(
      <div key="dao" className="space-y-2">
        <p>The committee&apos;s DAO vault is being set up. No money can come in until it&apos;s confirmed.</p>
        {actor ? btn("Check the DAO", "Checking…", () => act.recheckDao(actor, c), "btn-quiet") : null}
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
            Join by locking a deposit of <strong className="num">{amount}</strong>. You get it back when the committee
            ends; it only covers you if you ever miss a payment.
          </p>
          {btn(`Join and lock ${amount}`, "Joining…", () => act.join(actor, c))}
        </div>,
      );
    } else if (me && c.members.length < c.size) {
      items.push(
        <p key="wait">
          You&apos;re in. Waiting for {c.size - c.members.length} more member{c.size - c.members.length === 1 ? "" : "s"}
          {isOrganizer ? " — share the link with them." : "."}
        </p>,
      );
    }
    if (c.members.length === c.size) {
      if (isOrganizer) {
        items.push(
          <div key="start" className="space-y-2">
            <p>Every seat is taken. Start round 1 when everyone is ready.</p>
            {btn("Start the committee", "Starting…", () => act.start(actor, c), "btn-pot")}
          </div>,
        );
      } else {
        items.push(<p key="wait-start">Every seat is taken. Waiting for {displayName(c.organizer)} to start.</p>);
      }
    }
  } else if (c.status === "Running") {
    if (me && !me.paid_this_round) {
      items.push(
        <div key="pay" className="space-y-2">
          <p>
            Your round {c.round} payment of <strong className="num">{amount}</strong> is due
            {ended ? " — the round has ended, so it may be covered from your holdback." : ` in ${countdown(c.round_ends_ms - now)}.`}
          </p>
          {btn(`Pay ${amount}`, "Paying…", () => act.contribute(actor, c))}
        </div>,
      );
    } else if (me) {
      items.push(<p key="paid">You&apos;ve paid for round {c.round}.</p>);
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
            {btn("Offer discount", "Offering…", () => act.bid(actor, c, Math.round(Number(bidPct) * 100)), "btn-quiet")}
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
            The committee is done. Take back <strong className="num">{money(total)} {TOKEN_SYMBOL}</strong>: your
            deposit, any holdback, and shared discounts.
          </p>
          {btn(`Claim ${money(total)} ${TOKEN_SYMBOL}`, "Claiming…", () => act.claim(actor, c), "btn-pot")}
        </div>,
      );
    } else if (me) {
      items.push(<p key="claimed">You&apos;ve claimed everything. This committee is complete.</p>);
    } else {
      items.push(<p key="done">This committee is complete.</p>);
    }
  }

  if (items.length === 0) items.push(<p key="none">Nothing for you to do right now.</p>);

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
