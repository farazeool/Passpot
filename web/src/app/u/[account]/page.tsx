"use client";

import { useTitle } from "@/lib/useTitle";
import { Suspense } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Copy } from "@/components/Copy";
import { ProfileForm } from "@/components/ProfileForm";
import { TOKEN_SYMBOL } from "@/lib/config";
import { circleName, money, percent } from "@/lib/format";
import { getCommitteesFor, getReputation } from "@/lib/near";
import { nameOf, useProfile } from "@/lib/profile";
import type { Committee, Reputation } from "@/lib/types";
import { useWallet } from "@/lib/wallet";

function status(c: Committee) {
  if (c.status === "Running") return `Round ${c.round} of ${c.size}`;
  if (c.status === "Open") return `Taking members · ${c.members.length} of ${c.size}`;
  return "Finished";
}

function ProfilePageInner() {
  const { account } = useParams<{ account: string }>();
  const params = useSearchParams();
  const accountId = decodeURIComponent(account);
  const { accountId: me, actor } = useWallet();
  const mine = me === accountId;
  const profile = useProfile(accountId);
  const name = nameOf(accountId, profile);
  useTitle(name);
  const [rep, setRep] = useState<Reputation | null>(null);
  const [circles, setCommittees] = useState<Committee[] | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    getReputation(accountId).then(setRep).catch(() => {});
    getCommitteesFor(accountId).then(setCommittees).catch(() => setCommittees([]));
  }, [accountId]);

  // Open the editor straight away for a new member, or when sent here to edit.
  useEffect(() => {
    if (mine && (params.get("edit") === "1" || profile === null)) setEditing(true);
  }, [mine, params, profile]);

  const r = rep?.record;
  const tier =
    !r || (r.finished === 0 && r.defaults === 0)
      ? "New member"
      : r.defaults > 0
        ? "Has missed a circle"
        : r.finished >= 3
          ? "Trusted"
          : "Building trust";

  const active = circles?.filter((c) => c.status !== "Finished") ?? [];
  const done = circles?.filter((c) => c.status === "Finished") ?? [];
  const received = circles
    ?.flatMap((c) => c.events.filter((e) => e.kind === "Payout" && e.account_id === accountId))
    .reduce((s, e) => s + BigInt(e.amount), 0n);

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10 sm:py-14">
      <div className="flex flex-wrap items-center gap-5">
        <Avatar id={accountId} size={88} />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-4xl sm:text-5xl font-semibold text-ink">{name}</h1>
          <p className="mt-1 text-sm text-muted flex items-center gap-2 min-w-0">
            <span className="truncate">{accountId}</span>
            <Copy value={accountId} label="Copy account" />
          </p>
          {(profile?.location || profile?.saving_for) && (
            <p className="mt-2 text-text">
              {profile?.location}
              {profile?.location && profile?.saving_for ? " · " : ""}
              {profile?.saving_for && <>Saving for {profile.saving_for}</>}
            </p>
          )}
        </div>
        {mine && !editing && (
          <button className="btn btn-quiet" onClick={() => setEditing(true)}>
            Edit profile
          </button>
        )}
      </div>
      {profile?.description && !editing && <p className="mt-5 max-w-2xl text-lg text-text">{profile.description}</p>}

      {mine && editing && actor && (
        <div className="mt-8">
          <ProfileForm
            actor={actor}
            initial={profile}
            first={profile === null}
            onSaved={() => setEditing(false)}
            onCancel={profile ? () => setEditing(false) : undefined}
          />
        </div>
      )}

      <div className="mt-10 grid gap-6 lg:grid-cols-[1.3fr_1fr] items-start">
        <section className="card p-5 sm:p-6" aria-labelledby="record">
          <p className="text-sm font-semibold text-muted">Savings record</p>
          <h2 id="record" className="font-display text-2xl font-semibold text-ink mt-1">
            {tier}
          </h2>
          {rep ? (
            <>
              <dl className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  ["Circles finished", r!.finished],
                  ["Paid on time", r!.on_time],
                  ["Missed", r!.missed],
                  ["Circles with a miss", r!.defaults],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <dt className="text-sm text-muted">{label}</dt>
                    <dd className="font-display text-3xl font-semibold text-ink num">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-5 text-text">
                When {name.split(" ")[0]} gets a pot early, <strong className="num">{percent(rep.holdback_bps)}</strong> of
                it is held back until their remaining payments are in.
                {rep.holdback_bps > 0 ? " Finishing circles without missing a payment lowers this." : ""}
              </p>
            </>
          ) : (
            <div className="mt-5 grid grid-cols-4 gap-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-14" />
              ))}
            </div>
          )}
          <p className="mt-4 text-sm text-muted">
            Kept by the Passpot contract, not by us: any app on NEAR can read it, and nobody can edit it.
          </p>
        </section>

        <section className="card p-5 sm:p-6" aria-labelledby="totals">
          <p id="totals" className="text-sm font-semibold text-muted">
            With Passpot
          </p>
          <dl className="mt-3 space-y-4">
            <div>
              <dt className="text-sm text-muted">Pots received</dt>
              <dd className="font-display text-3xl font-semibold text-ink num">
                {received === undefined ? "…" : `${money(received)} ${TOKEN_SYMBOL}`}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Circles</dt>
              <dd className="font-display text-3xl font-semibold text-ink num">
                {circles === null ? "…" : `${active.length} active · ${done.length} finished`}
              </dd>
            </div>
          </dl>
          {mine && (
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/circles" className="btn btn-quiet btn-sm">
                Find a circle
              </Link>
              <Link href="/new" className="btn btn-primary btn-sm">
                Start a circle
              </Link>
            </div>
          )}
        </section>
      </div>

      <section className="mt-10" aria-labelledby="theirs">
        <h2 id="theirs" className="font-display text-2xl font-semibold text-ink mb-3">
          {mine ? "Your circles" : "Circles"}
        </h2>
        {circles === null && <div className="skeleton h-24" />}
        {circles?.length === 0 && (
          <p className="text-muted">
            {mine ? (
              <>
                You&apos;re not in a circle yet.{" "}
                <Link href="/circles" className="link">
                  Find one to join
                </Link>{" "}
                or{" "}
                <Link href="/new" className="link">
                  start your own
                </Link>
                .
              </>
            ) : (
              "Not in any circles yet."
            )}
          </p>
        )}
        {!!circles?.length && (
          <ul className="divide-y divide-rule border-y border-rule">
            {[...active, ...done].map((c) => (
              <li key={c.id}>
                <Link href={`/c/${c.id}`} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-3.5 group">
                  <span className="font-semibold text-ink group-hover:underline">{circleName(c.name)}</span>
                  <span className="text-sm text-muted num">
                    {money(c.amount)} {TOKEN_SYMBOL} a round · {status(c)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
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
