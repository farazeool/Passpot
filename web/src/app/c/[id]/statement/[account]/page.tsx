"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Mark } from "@/components/Mark";
import { CONTRACT, TOKEN_SYMBOL, explorerAccount } from "@/lib/config";
import { displayName, money, circleName } from "@/lib/format";
import { howChosen } from "@/lib/ledger";
import { getCommittee } from "@/lib/near";
import type { Committee, CommitteeEvent } from "@/lib/types";

/** A member's own record of a circle: printable, so it can be kept or shown to family. */
function describe(e: CommitteeEvent): { what: string; in?: bigint; out?: bigint } | null {
  const amt = BigInt(e.amount);
  switch (e.kind) {
    case "Joined":
      return { what: "Joined and locked a deposit", in: amt };
    case "Contributed":
      return { what: `Paid for round ${e.round}`, in: amt };
    case "Covered":
      return { what: `Missed round ${e.round}; covered from holdback and deposit` };
    case "Shortfall":
      return { what: `Missed round ${e.round}; ${money(amt)} ${TOKEN_SYMBOL} not covered` };
    case "Bid":
      return { what: `Offered a discount bid in round ${e.round}` };
    case "Payout":
      return { what: `Received the round ${e.round} pot (${howChosen(e.note)})`, out: amt };
    case "Claimed":
      return { what: "Took back deposit and remaining holdback", out: amt };
    default:
      return null;
  }
}

function StatementInner() {
  const { id, account } = useParams<{ id: string; account: string }>();
  const accountId = decodeURIComponent(account);
  const [c, setC] = useState<Committee | null | undefined>(undefined);

  useEffect(() => {
    getCommittee(Number(id)).then(setC).catch(() => setC(null));
  }, [id]);

  if (c === undefined) return <p className="text-muted">Reading the circle from NEAR…</p>;
  if (!c) return <p className="text-missed">Circle #{id} doesn&apos;t exist.</p>;
  const m = c.members.find((x) => x.account_id === accountId);
  if (!m) return <p className="text-missed">{accountId} isn&apos;t a member of this circle.</p>;

  const rows = c.events
    .filter((e) => e.account_id === accountId)
    .map((e) => ({ e, d: describe(e) }))
    .filter((r) => r.d);
  const paidIn = rows.reduce((s, r) => s + (r.d!.in ?? 0n), 0n);
  const received = rows.reduce((s, r) => s + (r.d!.out ?? 0n), 0n);
  const locked = BigInt(m.deposit) + BigInt(m.holdback) + BigInt(m.bonus);

  return (
    <article className="space-y-8">
      <header className="flex items-start justify-between gap-6">
        <div>
          <p className="text-sm text-muted">Member statement</p>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold text-ink mt-1">{displayName(accountId)}</h1>
          <p className="text-muted break-all text-sm">{accountId}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Mark size={28} />
          <span className="font-display text-xl font-semibold text-ink">Rota</span>
        </div>
      </header>

      <section className="card p-5">
        <h2 className="font-display text-xl font-semibold text-ink">{circleName(c.name)}</h2>
        <p className="text-sm text-muted">
          Circle #{c.id}, organized by {displayName(c.organizer)}. {c.size} members, {money(c.amount)} {TOKEN_SYMBOL} per
          round.{" "}
          {c.status === "Finished" ? "Finished." : c.status === "Running" ? `Now on round ${c.round} of ${c.size}.` : "Taking members."}
        </p>
        <dl className="mt-5 grid grid-cols-3 gap-4">
          {[
            ["Paid in", paidIn],
            ["Received", received],
            ["Still locked", locked],
          ].map(([label, v]) => (
            <div key={label as string}>
              <dt className="text-sm text-muted">{label as string}</dt>
              <dd className="font-display text-2xl font-semibold text-ink num">
                {money(v as bigint)} <span className="text-sm text-muted font-normal">{TOKEN_SYMBOL}</span>
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-sm text-text">
          {m.missed === 0
            ? `No missed payments (${m.on_time} on time).`
            : `${m.missed} missed payment${m.missed === 1 ? "" : "s"}, ${m.on_time} on time.`}
        </p>
      </section>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-left text-muted border-b border-rule-strong">
            <th className="py-2 pr-3 font-medium">Date</th>
            <th className="py-2 pr-3 font-medium">What happened</th>
            <th className="py-2 pr-3 font-medium text-right">Paid in</th>
            <th className="py-2 font-medium text-right">Received</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ e, d }, i) => (
            <tr key={i} className="border-b border-rule">
              <td className="py-2 pr-3 whitespace-nowrap num text-muted">
                {new Date(e.timestamp_ms).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
              </td>
              <td className="py-2 pr-3">{d!.what}</td>
              <td className="py-2 pr-3 text-right num">{d!.in ? money(d!.in) : ""}</td>
              <td className="py-2 text-right num">{d!.out ? money(d!.out) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <footer className="text-xs text-muted space-y-1">
        <p>
          Every line comes straight from the Rota contract on NEAR testnet (
          <a className="link" href={explorerAccount(CONTRACT)}>
            {CONTRACT}
          </a>
          ){c.dao ? (
            <>
              ; the money is held by the circle&apos;s DAO,{" "}
              <a className="link" href={explorerAccount(c.dao)}>
                {c.dao}
              </a>
            </>
          ) : null}
          . Amounts in {TOKEN_SYMBOL}, a test token with no value.
        </p>
        <p>Printed {new Date().toLocaleString()}.</p>
      </footer>
    </article>
  );
}

export default function StatementPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10 sm:py-14">
      <div className="flex justify-between gap-3 mb-8 print:hidden">
        <Link href={`/c/${id}`} className="link text-sm">
          Back to the circle
        </Link>
        <button className="btn btn-primary" onClick={() => window.print()}>
          Print or save as PDF
        </button>
      </div>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <StatementInner />
      </Suspense>
    </div>
  );
}
