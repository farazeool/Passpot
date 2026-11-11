"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CalendarButtons } from "@/components/CalendarButtons";
import { Tilt } from "@/components/Tilt";
import { useToast } from "@/components/Toast";
import * as act from "@/lib/actions";
import { TOKEN_SYMBOL } from "@/lib/config";
import { circleName, countdown, duration, money } from "@/lib/format";
import { getCommitteesFor, getTokenBalance } from "@/lib/near";
import type { Committee, Member } from "@/lib/types";
import { useTitle } from "@/lib/useTitle";
import { useWallet } from "@/lib/wallet";
import { useName } from "@/lib/profile";

const locked = (m: Member) => BigInt(m.deposit) + BigInt(m.holdback) + BigInt(m.bonus);
const pot = (c: Committee) => BigInt(c.amount) * BigInt(c.size);

/** When this member can expect the pot, in words. */
function nextPot(c: Committee, m: Member): string {
  if (m.paid_out_round != null) return `Received in round ${m.paid_out_round}`;
  if (c.status === "Open") return "Once the circle starts";
  const left = c.size - c.round + 1;
  if (c.mode === "Order") {
    const order = c.members.filter((x) => x.paid_out_round == null);
    const pos = order.findIndex((x) => x.account_id === m.account_id);
    if (pos === 0) return "This round";
    return `In about ${pos} round${pos === 1 ? "" : "s"}`;
  }
  if (left <= 1) return "This round";
  return c.mode === "Bid" ? `Any round, or bid to get it sooner` : `Any of the next ${left} rounds`;
}

function PayButton({ c, onDone }: { c: Committee; onDone: () => void }) {
  const { actor } = useWallet();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!actor) return null;
  return (
    <div>
      <button
        className="btn btn-pot w-full sm:w-auto"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const r = await act.contribute(actor, c);
            toast(`Paid ${money(c.amount)} ${TOKEN_SYMBOL} into ${circleName(c.name)}.`, { hash: r?.hash });
            onDone();
          } catch (e) {
            setError(act.explainError(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy && <span className="spinner" aria-hidden />}
        {busy ? "Paying" : `Pay ${money(c.amount)} ${TOKEN_SYMBOL}`}
      </button>
      {error && <p className="mt-2 text-sm text-missed">{error}</p>}
    </div>
  );
}

export default function MoneyPage() {
  useTitle("Your money");
  const { accountId: walletId, signIn, ready } = useWallet();
  // ?account=… shows anyone's circles read-only: it's all public data on NEAR.
  const [viewAs, setViewAs] = useState<string | null>(null);
  useEffect(() => {
    const a = new URLSearchParams(window.location.search).get("account");
    if (a && /^[a-z0-9._-]{2,64}$/.test(a)) setViewAs(a);
  }, []);
  const accountId = viewAs ?? walletId;
  const readOnly = !!viewAs && viewAs !== walletId;
  const ownerName = useName(accountId ?? "");
  const [circles, setCircles] = useState<Committee[] | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(() => {
    if (!accountId) return;
    getCommitteesFor(accountId)
      .then(setCircles)
      .catch(() => setCircles([]));
    getTokenBalance(accountId)
      .then(setBalance)
      .catch(() => {});
  }, [accountId]);

  useEffect(() => {
    load();
    const t = setInterval(() => setNow(Date.now()), 1000);
    const r = setInterval(load, 15_000);
    return () => {
      clearInterval(t);
      clearInterval(r);
    };
  }, [load]);

  if (!accountId) {
    return (
      <div className="mx-auto max-w-xl px-4 sm:px-6 py-16 sm:py-24 text-center">
        <h1 className="font-display text-4xl sm:text-5xl font-semibold text-ink">Your money</h1>
        <p className="mt-4 text-lg text-text">
          Connect your wallet to see what you owe, what&apos;s locked as your deposit, and when your pot is coming.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button className="btn btn-primary" onClick={signIn} disabled={!ready}>
            Connect wallet
          </button>
          <Link href="/demo" className="btn btn-quiet">
            Try the demo
          </Link>
        </div>
      </div>
    );
  }

  const mine = (circles ?? [])
    .map((c) => ({ c, m: c.members.find((x) => x.account_id === accountId) }))
    .filter((x): x is { c: Committee; m: Member } => !!x.m);
  const active = mine.filter(({ c }) => c.status !== "Finished");
  const toPay = active.filter(({ c, m }) => c.status === "Running" && !m.paid_this_round);
  const claimable = mine.filter(({ c, m }) => c.status === "Finished" && !m.claimed && locked(m) > 0n);

  const dueTotal = toPay.reduce((s, { c }) => s + BigInt(c.amount), 0n);
  const lockedTotal = mine.filter(({ m }) => !m.claimed).reduce((s, { m }) => s + locked(m), 0n);
  const comingTotal = active.filter(({ m }) => m.paid_out_round == null).reduce((s, { c }) => s + pot(c), 0n);
  const received = mine.reduce(
    (s, { c }) =>
      s + c.events.filter((e) => e.kind === "Payout" && e.account_id === accountId).reduce((a, e) => a + BigInt(e.amount), 0n),
    0n,
  );

  const stats: [string, string, string][] = [
    ["Due now", circles ? `${money(dueTotal)}` : "…", toPay.length ? `across ${toPay.length} circle${toPay.length > 1 ? "s" : ""}` : "You're all paid up"],
    ["Pots coming to you", circles ? money(comingTotal) : "…", "Before any holdback"],
    ["Locked as cover", circles ? money(lockedTotal) : "…", "Deposits and holdback, returned at the end"],
    ["Received so far", circles ? money(received) : "…", balance === null ? "" : `Wallet: ${money(balance)} ${TOKEN_SYMBOL}`],
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 sm:py-14">
      <h1 className="font-display text-4xl sm:text-5xl font-semibold text-ink">
        {readOnly ? `${ownerName.split(" ")[0]}'s money` : "Your money"}
      </h1>
      <p className="mt-2 text-text">
        {readOnly
          ? "A read-only view of this account's circles, straight from NEAR. Everything here is public on-chain."
          : "Everything you owe, have locked and have coming, across all your circles."}
      </p>

      <dl className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-px rounded-3xl overflow-hidden border border-rule bg-rule">
        {stats.map(([label, value, sub], i) => (
          <div key={label} className={`px-5 py-6 sm:px-6 ${i === 0 && dueTotal > 0n ? "bg-marigold-wash" : "bg-sheet"}`}>
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="mt-1 font-display text-3xl sm:text-4xl font-semibold text-ink num">
              {value} <span className="text-base font-medium text-muted">{TOKEN_SYMBOL}</span>
            </dd>
            <dd className="mt-1 text-xs text-muted">{sub}</dd>
          </div>
        ))}
      </dl>

      {circles === null && <div className="skeleton mt-10 h-40" />}

      {toPay.length > 0 && (
        <section className="mt-12" aria-labelledby="pay">
          <h2 id="pay" className="font-display text-2xl font-semibold text-ink">
            To pay
          </h2>
          <ul className="mt-4 grid gap-4 md:grid-cols-2">
            {toPay.map(({ c }) => {
              const left = c.round_ends_ms - now;
              return (
                <li key={c.id} className="card p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <Link href={`/c/${c.id}`} className="font-display text-xl font-semibold text-ink hover:underline">
                        {circleName(c.name)}
                      </Link>
                      <p className="text-sm text-muted">
                        Round {c.round} of {c.size}
                      </p>
                    </div>
                    <p className={`text-sm font-semibold num shrink-0 ${left < 0 ? "text-missed" : left < 86_400_000 ? "text-ink" : "text-muted"}`}>
                      {left > 0 ? `Due in ${countdown(left)}` : "Overdue"}
                    </p>
                  </div>
                  {left < 0 && (
                    <p className="mt-3 text-sm text-missed">
                      If the round closes before you pay, it&apos;s covered from your holdback and deposit, and the
                      miss shows on your record.
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    {!readOnly && <PayButton c={c} onDone={load} />}
                    <CalendarButtons circle={c} unpaid compact />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {claimable.length > 0 && (
        <section className="mt-12" aria-labelledby="claim">
          <h2 id="claim" className="font-display text-2xl font-semibold text-ink">
            Ready to take back
          </h2>
          <ul className="mt-4 grid gap-4 md:grid-cols-2">
            {claimable.map(({ c, m }) => (
              <li key={c.id} className="card p-5 sm:p-6 flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-ink">{circleName(c.name)}</p>
                  <p className="text-sm text-muted num">
                    {money(locked(m))} {TOKEN_SYMBOL} still locked
                  </p>
                </div>
                <Link href={`/c/${c.id}`} className="btn btn-primary btn-sm">
                  Claim it
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-12" aria-labelledby="circles">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="circles" className="font-display text-2xl font-semibold text-ink">
            Your circles
          </h2>
          <Link href="/circles" className="link text-sm">
            Find another circle
          </Link>
        </div>
        {circles && mine.length === 0 && (
          <div className="mt-4 rounded-[1.25rem] border border-dashed border-rule-strong p-8 text-center">
            <p className="font-display text-xl font-semibold text-ink">You&apos;re not in a circle yet.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <Link href="/circles" className="btn btn-quiet">
                Find one to join
              </Link>
              <Link href="/new" className="btn btn-primary">
                Start a circle
              </Link>
            </div>
          </div>
        )}
        <ul className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...active, ...mine.filter((x) => x.c.status === "Finished")].map(({ c, m }) => {
            const paid = c.status === "Running" && m.paid_this_round;
            return (
              <li key={c.id}>
                <Tilt max={5} className="card h-full">
                  <Link href={`/c/${c.id}`} className="block h-full p-5 rounded-[1.25rem]">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-display text-lg font-semibold text-ink truncate">{circleName(c.name)}</p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          c.status === "Finished"
                            ? "bg-rule text-muted"
                            : c.status === "Open"
                              ? "bg-paid-wash text-paid"
                              : paid
                                ? "bg-paid-wash text-paid"
                                : "bg-marigold-wash text-ink"
                        }`}
                      >
                        {c.status === "Finished" ? "Finished" : c.status === "Open" ? "Filling up" : paid ? "Paid this round" : "Payment due"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted num">
                      {money(c.amount)} {TOKEN_SYMBOL} every {duration(c.round_secs)}
                      {c.status === "Running" ? ` · round ${c.round} of ${c.size}` : ""}
                    </p>
                    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-muted">Your pot</dt>
                        <dd className="font-semibold text-ink">{nextPot(c, m)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Locked</dt>
                        <dd className="font-semibold text-ink num">
                          {m.claimed ? "Taken back" : `${money(locked(m))} ${TOKEN_SYMBOL}`}
                        </dd>
                      </div>
                    </dl>
                  </Link>
                </Tilt>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
