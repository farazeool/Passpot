"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Actions } from "@/components/Actions";
import { Activity } from "@/components/Activity";
import { Circle } from "@/components/Circle";
import { SoundToggle } from "@/components/SoundToggle";
import { Copy } from "@/components/Copy";
import { useTitle } from "@/lib/useTitle";
import { Invite, Remind } from "@/components/Share";
import { Register } from "@/components/Register";
import type { Actor } from "@/lib/actions";
import { TOKEN_SYMBOL, explorerAccount } from "@/lib/config";
import { demoActor, getDemoInfo, type DemoInfo } from "@/lib/demo";
import { displayName, duration, money, circleName } from "@/lib/format";
import { heldBack, howChosen } from "@/lib/ledger";
import { getCommittee } from "@/lib/near";
import type { Committee } from "@/lib/types";
import { useWallet } from "@/lib/wallet";

const MODE_TEXT = {
  Draw: "Lucky draw each round",
  Order: "Agreed order",
  Bid: "Bidding, with a draw when nobody bids",
} as const;

function CommitteePageInner() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { actor: walletActor, signIn } = useWallet();
  const [c, setC] = useState<Committee | null | undefined>(undefined);
  const [demo, setDemo] = useState<DemoInfo | null>(null);
  const [persona, setPersona] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState<{ accountId: string; key: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const lastPayouts = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await getCommittee(id);
      setC(next);
      if (next) {
        const payouts = next.events.filter((e) => e.kind === "Payout");
        if (lastPayouts.current !== null && payouts.length > lastPayouts.current) {
          const latest = payouts[payouts.length - 1];
          setCelebrate({ accountId: latest.account_id!, key: `${latest.round}-${latest.timestamp_ms}` });
        }
        lastPayouts.current = payouts.length;
      }
    } catch {
      setC((prev) => (prev === undefined ? null : prev));
    }
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    getDemoInfo().then(setDemo).catch(() => {});
    return () => {
      clearInterval(t);
      clearInterval(clock);
    };
  }, [load]);

  const isDemo = useMemo(
    () => !!demo?.enabled && !!c && c.organizer === demo.organizer,
    [demo, c],
  );

  useEffect(() => {
    if (isDemo && !persona && demo?.members.length) setPersona(demo.members[0]);
  }, [isDemo, persona, demo]);

  useTitle(c ? circleName(c.name) : c === null ? "Circle not found" : null);

  const actor: Actor | null = isDemo && persona ? demoActor(persona) : walletActor;

  if (c === undefined) {
    return <CircleSkeleton />;
  }
  if (c === null) {
    return (
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 space-y-3">
        <h1 className="font-display text-3xl font-semibold text-ink">Circle #{id} doesn&apos;t exist</h1>
        <p className="text-muted">Check the link, or see all circles.</p>
        <Link href="/circles" className="btn btn-quiet">
          See all circles
        </Link>
      </div>
    );
  }

  const latestPayout = [...c.events].reverse().find((e) => e.kind === "Payout");
  const shareText = latestPayout
    ? `${circleName(c.name)}: ${displayName(latestPayout.account_id!)} received the round ${latestPayout.round} pot (${money(latestPayout.amount)} ${TOKEN_SYMBOL}, ${howChosen(latestPayout.note)}). Check it yourself: ${typeof window !== "undefined" ? window.location.href : ""}`
    : "";

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">
            Circle #{c.id}, organized by {displayName(c.organizer)}
          </p>
          <h1 className="font-display text-4xl sm:text-5xl font-semibold text-ink mt-1">
            {circleName(c.name)}
            {isDemo && (
              <span className="ml-3 align-middle inline-block rounded-full bg-marigold-wash border border-marigold/50 px-3 py-1 text-sm font-sans font-semibold tracking-normal text-ink">
                Live demo
              </span>
            )}
          </h1>
          <p className="mt-2 text-muted">
            {c.size} members pay <span className="num font-semibold text-text">{money(c.amount)} {TOKEN_SYMBOL}</span>{" "}
            every {duration(c.round_secs)}. {MODE_TEXT[c.mode]}.
          </p>
        </div>
        <div className="flex gap-2">
          <SoundToggle />
          <Link href={`/c/${c.id}/verify`} className="btn btn-quiet">
            Verify on-chain
          </Link>
        </div>
      </div>

      {isDemo && demo && (
        <section className="mt-8 rounded-2xl border border-ink/15 bg-sheet p-4 sm:p-5" aria-label="Demo members">
          <p className="text-sm text-muted mb-3">
            Demo circle. Act as any member — every action is a real NEAR testnet transaction, signed for you.
            Other visitors may be playing too.{" "}
            <Link href="/demo?fresh=1" className="link">
              Start a fresh demo circle
            </Link>
          </p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Act as">
            {demo.members.map((m) => (
              <button
                key={m}
                role="radio"
                aria-checked={persona === m}
                onClick={() => setPersona(m)}
                className={`btn ${persona === m ? "btn-primary" : "btn-quiet"}`}
              >
                {displayName(m)}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,520px)_1fr] items-start">
        <div className="lg:sticky lg:top-24">
          <Circle circle={c} celebrate={celebrate} sound />
        </div>

        <div className="space-y-10 min-w-0">
          <section aria-labelledby="todo" className="card p-5 sm:p-6">
            <h2 id="todo" className="font-display text-xl font-semibold text-ink mb-3">
              {actor ? `What ${isDemo ? displayName(actor.accountId) : "you"} can do` : "Take part"}
            </h2>
            <Actions circle={c} actor={actor} onDone={load} onSignIn={signIn} now={now} />
          </section>

          {c.status === "Open" && c.members.length < c.size && <Invite circle={c} />}
          {c.status === "Running" && <Remind circle={c} now={now} />}

          {latestPayout && (
            <section aria-labelledby="latest" className="rounded-2xl bg-marigold-wash border border-marigold/40 p-5 sm:p-6">
              <h2 id="latest" className="font-display text-xl font-semibold text-ink">
                {displayName(latestPayout.account_id!)} received the round {latestPayout.round} pot
              </h2>
              <p className="mt-1 text-text">
                Chosen by {howChosen(latestPayout.note)}.{" "}
                <span className="num">{money(latestPayout.amount)} {TOKEN_SYMBOL}</span> sent
                {heldBack(latestPayout.note) > 0n
                  ? `, ${money(heldBack(latestPayout.note))} ${TOKEN_SYMBOL} held back until their remaining payments are in.`
                  : "."}
              </p>
              <a
                className="btn btn-quiet mt-4 bg-sheet"
                href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                target="_blank"
                rel="noreferrer"
              >
                Share the receipt on WhatsApp
              </a>
            </section>
          )}

          <section aria-labelledby="register">
            <h2 id="register" className="font-display text-2xl font-semibold text-ink mb-4">
              Register
            </h2>
            <Register circle={c} />
          </section>

          <section aria-labelledby="vault">
            <h2 id="vault" className="font-display text-2xl font-semibold text-ink mb-2">
              Where the money is
            </h2>
            {c.dao ? (
              <p className="text-text">
                In this circle&apos;s own Sputnik DAO,{" "}
                <a className="link break-all" href={explorerAccount(c.dao)} target="_blank" rel="noreferrer">
                  {c.dao}
                </a>{" "}
                <Copy value={c.dao} label="Copy the DAO address" />
                . Its only council member is the Rota contract, so no person — not even the organizer — can move
                it. It should hold <strong className="num">{money(c.held)} {TOKEN_SYMBOL}</strong> right now.
              </p>
            ) : (
              <p className="text-text">
                Held by the Rota contract itself (a test circle without its own DAO):{" "}
                <strong className="num">{money(c.held)} {TOKEN_SYMBOL}</strong>.
              </p>
            )}
          </section>

          <section aria-labelledby="activity">
            <h2 id="activity" className="font-display text-2xl font-semibold text-ink mb-2">
              Activity
            </h2>
            <Activity circle={c} />
          </section>
        </div>
      </div>
    </div>
  );
}

/** Holds the page's shape while the circle loads from NEAR. */
function CircleSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 sm:py-14" aria-busy="true" aria-label="Loading the circle from NEAR">
      <div className="skeleton h-4 w-56" />
      <div className="skeleton h-12 w-[min(32rem,90%)] mt-3" />
      <div className="skeleton h-4 w-80 mt-4" />
      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,520px)_1fr] items-start">
        <div className="skeleton aspect-[4/3] w-full rounded-[2rem]" />
        <div className="space-y-6">
          <div className="skeleton h-40 w-full rounded-[1.25rem]" />
          <div className="skeleton h-6 w-40" />
          <div className="skeleton h-48 w-full rounded-[1.25rem]" />
        </div>
      </div>
    </div>
  );
}

export default function CommitteePage() {
  return (
    <Suspense fallback={<CircleSkeleton />}>
      <CommitteePageInner />
    </Suspense>
  );
}
