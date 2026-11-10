"use client";

import { useTitle } from "@/lib/useTitle";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Tilt } from "@/components/Tilt";
import { LIVE_DEMO_ROUND_SECS, TOKEN_SYMBOL } from "@/lib/config";
import { circleName, duration, money } from "@/lib/format";
import { getCommittees, getReputation } from "@/lib/near";
import { Name } from "@/lib/profile";
import type { Committee, Reputation } from "@/lib/types";
import { useWallet } from "@/lib/wallet";

type Tab = "Open" | "Running" | "Finished" | "Mine";

const MODE: Record<Committee["mode"], string> = { Draw: "Lucky draw", Order: "Agreed order", Bid: "Bidding" };

const isDemoAccount = (id: string) => /-demo\./.test(id);
const isDemo = (c: Committee) => isDemoAccount(c.organizer);

function tier(r: Reputation | undefined): { label: string; tone: string } | null {
  if (!r) return null;
  const { finished, defaults } = r.record;
  if (defaults > 0) return { label: "Has missed a circle", tone: "text-missed" };
  if (finished >= 3) return { label: `Trusted · ${finished} clean circles`, tone: "text-paid" };
  if (finished >= 1) return { label: `Building trust · ${finished} clean circle${finished > 1 ? "s" : ""}`, tone: "text-ink" };
  return { label: "New organizer", tone: "text-muted" };
}

/** Seats around a ring: members' avatars, open seats dashed. */
function Seats({ c }: { c: Committee }) {
  const n = Math.max(c.size, c.members.length);
  const R = 46;
  const size = n > 10 ? 20 : 26;
  return (
    <div className="relative h-[124px] w-[124px] shrink-0" aria-hidden>
      <div className="absolute inset-[18px] rounded-full border border-dashed border-rule-strong" />
      <div className="absolute inset-[44px] rounded-full bg-marigold/90 shadow-[inset_0_-4px_0_rgb(0_0_0/0.12)]" />
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        const x = 62 + Math.cos(a) * R - size / 2;
        const y = 62 + Math.sin(a) * R - size / 2;
        const m = c.members[i];
        return (
          <span key={i} className="absolute" style={{ left: x, top: y }}>
            {m ? (
              <span className={`block rounded-full ring-2 ${m.paid_out_round ? "ring-marigold" : "ring-sheet"}`}>
                <Avatar id={m.account_id} size={size} />
              </span>
            ) : (
              <span
                className="block rounded-full border-[1.5px] border-dashed border-muted bg-sheet"
                style={{ width: size, height: size }}
              />
            )}
          </span>
        );
      })}
    </div>
  );
}

function CircleCard({ c, rep, live }: { c: Committee; rep?: Reputation; live?: boolean }) {
  const left = c.size - c.members.length;
  const t = tier(rep);
  const progress = c.status === "Finished" ? 1 : c.status === "Running" ? (c.round - 1) / c.size : 0;
  return (
    <Tilt max={5} className="card h-full">
      <Link href={`/c/${c.id}`} className="flex h-full flex-col p-5 rounded-[1.25rem]">
        <div className="flex items-start gap-4">
          <Seats c={c} />
          <div className="min-w-0 flex-1 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              {live && (
                <span className="rounded-full bg-marigold-wash border border-marigold/50 px-2 py-0.5 text-xs font-semibold text-ink">
                  Live demo
                </span>
              )}
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  c.status === "Open"
                    ? "bg-paid-wash text-paid"
                    : c.status === "Running"
                      ? "bg-marigold-wash text-ink"
                      : "bg-rule text-muted"
                }`}
              >
                {c.status === "Open"
                  ? `${left} seat${left === 1 ? "" : "s"} left`
                  : c.status === "Running"
                    ? `Round ${c.round} of ${c.size}`
                    : "Finished"}
              </span>
            </div>
            <h2 className="mt-2 font-display text-xl font-semibold text-ink leading-tight line-clamp-2">
              {circleName(c.name)}
            </h2>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
              <span className="num">#{c.id}</span>
              <span aria-hidden>·</span>
              <span>{MODE[c.mode]}</span>
              {c.dao && (
                <>
                  <span className="basis-full inline-flex items-center gap-1 text-ink font-medium" title="Payments sit in this circle's own Sputnik DAO">
                    <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5">
                      <path d="M8 1.5 13.5 3.6v4.1c0 3.1-2.3 5.6-5.5 6.8C4.8 13.3 2.5 10.8 2.5 7.7V3.6Z" fill="var(--marigold)" />
                      <path d="m5.6 8 1.7 1.7 3.2-3.4" stroke="#241a02" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    DAO vault
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <dt className="text-xs text-muted">Each pays</dt>
            <dd className="font-semibold text-ink num">
              {money(c.amount)} {TOKEN_SYMBOL} <span className="font-normal text-muted text-sm">/ {duration(c.round_secs)}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Pot</dt>
            <dd className="font-semibold text-ink num">
              {money(BigInt(c.amount) * BigInt(c.size))} {TOKEN_SYMBOL}
            </dd>
          </div>
        </dl>

        <div className="mt-4 h-1.5 rounded-full bg-rule overflow-hidden" aria-hidden>
          <div className="h-full rounded-full bg-marigold" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>

        <div className="mt-auto pt-4 border-t border-rule flex items-center gap-3">
          <Avatar id={c.organizer} size={32} />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="text-sm font-semibold text-ink truncate">
              <Name id={c.organizer} />
            </p>
            <p className={`text-xs truncate ${t?.tone ?? "text-muted"}`}>{t?.label ?? "Organizer"}</p>
          </div>
          {c.status === "Open" ? (
            <span className="btn btn-primary btn-sm">Join</span>
          ) : (
            <span className="text-sm font-semibold text-ink">View →</span>
          )}
        </div>
      </Link>
    </Tilt>
  );
}

function SkeletonCard() {
  return (
    <div className="card p-5">
      <div className="flex gap-4">
        <div className="skeleton h-[124px] w-[124px] rounded-full" />
        <div className="flex-1 space-y-2 pt-2">
          <div className="skeleton h-5 w-24" />
          <div className="skeleton h-6 w-full" />
          <div className="skeleton h-4 w-12" />
        </div>
      </div>
      <div className="skeleton mt-5 h-10" />
      <div className="skeleton mt-4 h-8" />
    </div>
  );
}

export default function CommitteesPage() {
  useTitle("Circles");
  const { accountId } = useWallet();
  const [all, setAll] = useState<Committee[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("Open");
  const [q, setQ] = useState("");
  const [showDemos, setShowDemos] = useState(false);
  const [reps, setReps] = useState<Record<string, Reputation>>({});

  useEffect(() => {
    getCommittees(0, 200)
      .then((list) => setAll([...list].reverse()))
      .catch((e) => setError(String(e)));
  }, []);

  // The one always-running demo circle, pinned at the top.
  const live = useMemo(
    () => all?.find((c) => isDemo(c) && c.round_secs === LIVE_DEMO_ROUND_SECS && c.status === "Running"),
    [all],
  );

  // Organizers' records, for the trust line on each card.
  useEffect(() => {
    if (!all) return;
    const ids = [...new Set(all.map((c) => c.organizer))];
    ids.forEach((id) =>
      getReputation(id)
        .then((r) => setReps((m) => ({ ...m, [id]: r })))
        .catch(() => {}),
    );
  }, [all]);

  const mine = (c: Committee) =>
    !!accountId && (c.organizer === accountId || c.members.some((m) => m.account_id === accountId));

  const pool = (all ?? []).filter((c) => c !== live && (showDemos || !isDemo(c) || mine(c)));
  const counts: Record<Tab, number> = {
    Open: pool.filter((c) => c.status === "Open").length,
    Running: pool.filter((c) => c.status === "Running").length,
    Finished: pool.filter((c) => c.status === "Finished").length,
    Mine: pool.filter(mine).length,
  };
  const needle = q.trim().toLowerCase();
  const shown = pool
    .filter((c) => (tab === "Mine" ? mine(c) : c.status === tab))
    .filter((c) => !needle || circleName(c.name).toLowerCase().includes(needle) || c.organizer.includes(needle) || String(c.id) === needle);
  const demoCount = (all ?? []).filter((c) => isDemo(c) && c !== live).length;
  const tabs: Tab[] = accountId ? ["Open", "Running", "Finished", "Mine"] : ["Open", "Running", "Finished"];
  const TAB_LABEL: Record<Tab, string> = { Open: "Open to join", Running: "Running", Finished: "Finished", Mine: "Mine" };

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl sm:text-5xl font-semibold text-ink">Circles</h1>
          <p className="mt-2 text-text">Find one with an open seat, or start your own and invite people you know.</p>
        </div>
        <Link href="/new" className="btn btn-pot">
          Start a circle
        </Link>
      </div>

      {live && tab !== "Mine" && !needle && (
        <section className="mt-8" aria-label="Live demo circle">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
            <CircleCard c={live} rep={reps[live.organizer]} live />
            <div className="lg:col-span-2 rounded-[1.25rem] border border-dashed border-rule-strong p-6 sm:p-8 flex flex-col justify-center bg-band-soft">
              <p className="font-display text-xl font-semibold text-ink">Try one without a wallet</p>
              <p className="mt-2 text-text max-w-lg">
                The live demo circle always has a round in progress. Act as Ayesha, Bilal or Sara, pay in, and close
                the round to see who gets the pot. Every step is a real NEAR testnet transaction.
              </p>
              <div className="mt-4">
                <Link href={`/c/${live.id}`} className="btn btn-quiet">
                  Open the live demo
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="mt-10 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-full border border-rule bg-sheet p-1 overflow-x-auto" role="tablist" aria-label="Filter circles">
          {tabs.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                tab === t ? "bg-[var(--primary-bg)] text-[var(--primary-fg)]" : "text-muted hover:text-ink"
              }`}
            >
              {TAB_LABEL[t]}
              {all && <span className={`ml-1.5 num ${tab === t ? "opacity-70" : "opacity-60"}`}>{counts[t]}</span>}
            </button>
          ))}
        </div>
        <label className="relative flex-1 min-w-[12rem] max-w-sm ml-auto">
          <span className="sr-only">Search circles</span>
          <svg aria-hidden viewBox="0 0 20 20" className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted">
            <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M13.5 13.5 L17 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            className="field rounded-full"
            style={{ paddingLeft: "2.5rem" }}
            placeholder="Search by name, organizer or #"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
      </div>

      {error && <p className="mt-8 text-missed">Couldn&apos;t read circles from NEAR. Refresh to try again.</p>}

      <ul className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {!all && !error && [0, 1, 2].map((i) => <li key={i}><SkeletonCard /></li>)}
        {shown.map((c) => (
          <li key={c.id}>
            <CircleCard c={c} rep={reps[c.organizer]} />
          </li>
        ))}
      </ul>

      {all && shown.length === 0 && (
        <div className="mt-2 rounded-[1.25rem] border border-dashed border-rule-strong p-8 text-center">
          <p className="font-display text-xl font-semibold text-ink">
            {needle
              ? "No circles match that search."
              : tab === "Open"
                ? "No circles are taking members right now."
                : tab === "Mine"
                  ? "You're not in any circles yet."
                  : `No ${TAB_LABEL[tab].toLowerCase()} circles yet.`}
          </p>
          <p className="mt-2 text-text">
            Start one and send the invite on WhatsApp, or{" "}
            <Link href="/demo" className="link">
              try the demo
            </Link>
            .
          </p>
          <Link href="/new" className="btn btn-primary mt-5">
            Start a circle
          </Link>
        </div>
      )}

      {demoCount > 0 && (
        <p className="mt-8 text-sm text-muted">
          {showDemos ? "Showing" : "Hiding"} {demoCount} demo circle{demoCount === 1 ? "" : "s"} visitors made while trying Rota.{" "}
          <button className="link" onClick={() => setShowDemos(!showDemos)}>
            {showDemos ? "Hide them" : "Show them"}
          </button>
        </p>
      )}
    </div>
  );
}
