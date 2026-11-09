"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { displayName, percent } from "@/lib/format";
import { getCommitteesFor, getReputation } from "@/lib/near";
import type { Committee, Reputation } from "@/lib/types";

function ProfilePageInner() {
  const { account } = useParams<{ account: string }>();
  const accountId = decodeURIComponent(account);
  const [rep, setRep] = useState<Reputation | null>(null);
  const [committees, setCommittees] = useState<Committee[] | null>(null);

  useEffect(() => {
    getReputation(accountId).then(setRep).catch(() => {});
    getCommitteesFor(accountId).then(setCommittees).catch(() => setCommittees([]));
  }, [accountId]);

  const r = rep?.record;
  const tier =
    !r || (r.finished === 0 && r.defaults === 0)
      ? "New member"
      : r.defaults > 0
        ? "Has missed a committee"
        : r.finished >= 3
          ? "Trusted"
          : "Building trust";

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10 sm:py-14">
      <p className="text-sm text-muted break-all">{accountId}</p>
      <h1 className="font-display text-4xl sm:text-5xl font-semibold text-ink mt-1">{displayName(accountId)}</h1>

      <section className="mt-8 rounded-2xl bg-sheet border border-rule p-5 sm:p-6" aria-labelledby="record">
        <h2 id="record" className="font-display text-xl font-semibold text-ink">
          {tier}
        </h2>
        {rep && (
          <>
            <p className="mt-2 text-text">
              When {displayName(accountId)} gets the pot early, Committee holds back{" "}
              <strong className="num">{percent(rep.holdback_bps)}</strong> of it until their remaining payments are in.
              {rep.holdback_bps > 0 ? " Finishing committees without missing a payment lowers this." : ""}
            </p>
            <dl className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                ["Committees finished", r!.finished],
                ["Payments on time", r!.on_time],
                ["Payments missed", r!.missed],
                ["Committees with a miss", r!.defaults],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <dt className="text-sm text-muted">{label}</dt>
                  <dd className="font-display text-3xl font-semibold text-ink num">{value}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
        <p className="mt-5 text-sm text-muted">
          Holdback: 50% for new members or anyone with a missed committee, 25% after one clean committee, none after
          three. The record lives in the Committee contract, so any app can read it.
        </p>
      </section>

      <section className="mt-10" aria-labelledby="theirs">
        <h2 id="theirs" className="font-display text-2xl font-semibold text-ink mb-3">
          Committees
        </h2>
        {committees === null && <p className="text-muted">Reading from NEAR…</p>}
        {committees?.length === 0 && <p className="text-muted">Not in any committees yet.</p>}
        <ul className="divide-y divide-rule border-y border-rule">
          {committees?.map((c) => (
            <li key={c.id}>
              <Link href={`/c/${c.id}`} className="flex justify-between gap-4 py-3 hover:underline">
                <span className="font-semibold text-ink">{c.name}</span>
                <span className="text-sm text-muted">
                  {c.status === "Running" ? `Round ${c.round} of ${c.size}` : c.status === "Open" ? "Taking members" : "Finished"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 text-muted">Loading…</div>}>
      <ProfilePageInner />
    </Suspense>
  );
}
