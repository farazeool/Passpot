"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TOKEN_SYMBOL } from "@/lib/config";
import { displayName, duration, money } from "@/lib/format";
import { getCommittees } from "@/lib/near";
import type { Committee } from "@/lib/types";
import { useWallet } from "@/lib/wallet";

const STATUS: Record<Committee["status"], string> = {
  Open: "Taking members",
  Running: "Running",
  Finished: "Finished",
};

export default function CommitteesPage() {
  const { accountId } = useWallet();
  const [all, setAll] = useState<Committee[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState(false);

  useEffect(() => {
    getCommittees(0, 50)
      .then((list) => setAll([...list].reverse()))
      .catch((e) => setError(String(e)));
  }, []);

  const shown = (all ?? []).filter(
    (c) => !mine || (accountId && (c.organizer === accountId || c.members.some((m) => m.account_id === accountId))),
  );

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-4xl sm:text-5xl font-semibold text-ink">Circles</h1>
        <div className="flex gap-2">
          {accountId && (
            <button className={`btn ${mine ? "btn-primary" : "btn-quiet"}`} onClick={() => setMine(!mine)} aria-pressed={mine}>
              Only mine
            </button>
          )}
          <Link href="/new" className="btn btn-pot">
            Start a circle
          </Link>
        </div>
      </div>

      {error && <p className="mt-8 text-missed">Couldn&apos;t read circles from NEAR. Refresh to try again.</p>}
      {!all && !error && <p className="mt-8 text-muted">Reading circles from NEAR…</p>}
      {all && shown.length === 0 && (
        <p className="mt-8 text-muted">
          {mine ? "You're not in any circles yet." : "No circles yet."}{" "}
          <Link href="/demo" className="link">
            Try the demo
          </Link>{" "}
          or{" "}
          <Link href="/new" className="link">
            start one
          </Link>
          .
        </p>
      )}

      <ul className="mt-8 divide-y divide-rule border-y border-rule">
        {shown.map((c) => (
          <li key={c.id}>
            <Link
              href={`/c/${c.id}`}
              className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_10rem_9rem_8rem] gap-x-6 gap-y-1 py-4 hover:bg-sheet -mx-3 px-3 rounded-lg"
            >
              <span className="min-w-0">
                <span className="font-display text-lg font-semibold text-ink block truncate">{c.name}</span>
                <span className="text-sm text-muted">
                  #{c.id}, by {displayName(c.organizer)}
                  {c.dao ? ", with its own DAO vault" : ""}
                </span>
              </span>
              <span className="text-sm sm:text-base text-right sm:text-left">
                <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  c.status === "Running" ? "bg-marigold-wash text-ink" : c.status === "Open" ? "bg-paid-wash text-paid" : "bg-rule text-muted"
                }`}>
                  {c.status === "Running" ? `Round ${c.round} of ${c.size}` : STATUS[c.status]}
                </span>
              </span>
              <span className="text-sm text-muted hidden sm:block">
                {c.members.length} of {c.size} members
                <br />
                every {duration(c.round_secs)}
              </span>
              <span className="hidden sm:block text-right">
                <span className="num font-semibold">{money(c.pot)}</span>
                <span className="text-sm text-muted"> {TOKEN_SYMBOL} pot</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
