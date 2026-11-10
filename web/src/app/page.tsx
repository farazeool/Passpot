"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Circle } from "@/components/Circle";
import { TOKEN_SYMBOL } from "@/lib/config";
import { getCommittees } from "@/lib/near";
import type { Committee, Member } from "@/lib/types";

const NAMES = ["ayesha", "bilal", "sara", "omar", "hina"];
const ID = (n: string) => `${n}.testnet`;

/** The hero tells one story on a loop: round 2, Bilal misses, his holdback covers it, Sara still gets the full pot. */
const STORY: { paid: string[]; mark?: "missed" | "covered"; winner?: boolean; text: string; ms: number }[] = [
  { paid: [], text: "Round 2. Everyone pays 50 tUSD into the vault.", ms: 1500 },
  { paid: ["ayesha"], text: "Round 2. Everyone pays 50 tUSD into the vault.", ms: 650 },
  { paid: ["ayesha", "sara"], text: "Round 2. Everyone pays 50 tUSD into the vault.", ms: 650 },
  { paid: ["ayesha", "sara", "omar"], text: "Round 2. Everyone pays 50 tUSD into the vault.", ms: 650 },
  { paid: ["ayesha", "sara", "omar", "hina"], text: "Round 2. Everyone pays 50 tUSD into the vault.", ms: 1100 },
  { paid: ["ayesha", "sara", "omar", "hina"], mark: "missed", text: "Bilal already had the pot in round 1. Now he stops paying.", ms: 2600 },
  { paid: ["ayesha", "sara", "omar", "hina"], mark: "covered", text: "The money held back from his pot covers it.", ms: 2600 },
  { paid: ["ayesha", "sara", "omar", "hina", "bilal"], winner: true, text: "Sara still gets the full 250 tUSD.", ms: 4200 },
];

function storyCircle(step: number): Committee {
  const st = STORY[step];
  const members: Member[] = NAMES.map((n) => ({
    account_id: ID(n),
    deposit: "50000000",
    holdback: "0",
    holdback_release: "0",
    bonus: "0",
    paid_out_round: n === "bilal" ? 1 : st.winner && n === "sara" ? 2 : null,
    paid_this_round: st.paid.includes(n),
    on_time: 0,
    missed: 0,
    claimed: false,
  }));
  return {
    id: 0,
    name: "Khan family committee",
    organizer: ID("ayesha"),
    token: "",
    dao: null,
    dao_ready: true,
    amount: "50000000",
    size: 5,
    round_secs: 2592000,
    mode: "Draw",
    status: "Running",
    round: 2,
    round_started_ms: 0,
    members,
    bids: [],
    events: [],
    pot: "250000000",
    round_ends_ms: Date.now() + 1000 * 60 * 60 * 24 * 12,
    can_advance: false,
    held: "0",
    unforwarded: "0",
  };
}

const PLACES: [string, string][] = [
  ["committee", "Pakistan"],
  ["susu", "Ghana"],
  ["tanda", "Mexico"],
  ["chama", "Kenya"],
  ["hui", "China"],
  ["arisan", "Indonesia"],
  ["paluwagan", "the Philippines"],
];


/** Counts up to a number when it first appears. */
function CountUp({ to, format = (n: number) => n.toLocaleString("en-US") }: { to: number; format?: (n: number) => string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setV(to);
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 1200);
      setV(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{format(v)}</>;
}

export default function Home() {
  const [step, setStep] = useState(0);
  const [place, setPlace] = useState(0);
  const [stats, setStats] = useState<{ circles: number; moved: bigint; members: number } | null>(null);

  useEffect(() => {
    getCommittees(0, 200)
      .then((cs) => {
        const moved = cs.reduce(
          (sum, c) => sum + c.events.filter((e) => e.kind === "Payout").reduce((s2, e) => s2 + BigInt(e.amount), 0n),
          0n,
        );
        const members = new Set(cs.flatMap((c) => c.members.map((m) => m.account_id))).size;
        setStats({ circles: cs.length, moved, members });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStep(STORY.length - 1);
      return;
    }
    const t = setTimeout(() => setStep((s) => (s + 1) % STORY.length), STORY[step].ms);
    return () => clearTimeout(t);
  }, [step]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setPlace((p) => (p + 1) % PLACES.length), 2200);
    return () => clearInterval(t);
  }, []);

  const circle = useMemo(() => storyCircle(step), [step]);
  const st = STORY[step];
  const celebrate = st.winner ? { accountId: ID("sara"), key: `win-${step}` } : null;
  const marks = st.mark ? { [ID("bilal")]: st.mark } : undefined;
  const [word, country] = PLACES[place];

  return (
    <>
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-12 sm:pt-20 pb-12 grid gap-12 lg:grid-cols-[1.1fr_1fr] items-center">
        <div>
          <h1 className="font-display text-[2.7rem] sm:text-6xl lg:text-[4.2rem] font-semibold text-ink leading-[1.03]">
            <span className="rise block sm:whitespace-nowrap" style={{ animationDelay: "80ms" }}>
              Everyone pays in.
            </span>
            <span className="rise block sm:whitespace-nowrap" style={{ animationDelay: "520ms" }}>
              One takes it home.
            </span>
            <span className="rise block sm:whitespace-nowrap text-marigold" style={{ animationDelay: "960ms" }}>
              Nobody runs off.
            </span>
          </h1>
          <p className="rise mt-6 text-xl sm:text-2xl text-ink font-medium" style={{ animationDelay: "1400ms" }} aria-live="off">
            It&apos;s called a{" "}
            <span className="relative inline-block overflow-hidden align-bottom">
              <span key={word} className="swap-in text-marigold">
                {word}
              </span>
            </span>{" "}
            in{" "}
            <span className="relative inline-block overflow-hidden align-bottom">
              <span key={country} className="swap-in">
                {country}
              </span>
            </span>
            .
          </p>
          <p className="rise mt-4 text-lg text-text max-w-xl" style={{ animationDelay: "1600ms" }}>
            Friends and family each pay in every month, and one of them takes the whole pot, until everyone has had a
            turn. Rota runs it on NEAR: the money sits in a vault nobody controls, and if someone stops paying, the
            circle keeps going.
          </p>
          <div className="rise mt-8 flex flex-wrap gap-3" style={{ animationDelay: "1800ms" }}>
            <Link href="/demo" className="btn btn-pot text-base">
              Try a demo circle
            </Link>
            <Link href="/new" className="btn btn-quiet text-base">
              Start your own
            </Link>
          </div>
          <p className="rise mt-4 text-sm text-muted" style={{ animationDelay: "1900ms" }}>
            The demo needs no wallet. Every step is a real transaction on NEAR testnet.
          </p>
        </div>
        <div>
          <Circle circle={circle} celebrate={celebrate} marks={marks} />
          <p
            key={st.text}
            className="swap-in w-full text-center mt-3 text-lg font-semibold text-ink min-h-[3.5rem]"
            aria-live="polite"
          >
            {st.text}
          </p>
        </div>
      </section>

      <section aria-label="Rota so far" className="mx-auto max-w-6xl px-4 sm:px-6 pb-14">
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-px rounded-3xl overflow-hidden border border-rule bg-rule">
          {[
            ["Circles created", stats ? <CountUp key="c" to={stats.circles} /> : "…"],
            ["Members", stats ? <CountUp key="m" to={stats.members} /> : "…"],
            [
              `Paid out (${TOKEN_SYMBOL})`,
              stats ? <CountUp key="p" to={Number(stats.moved / 1_000_000n)} /> : "…",
            ],
            ["Run off with the money", <span key="z" className="text-paid">0</span>],
          ].map(([label, value]) => (
            <div key={label as string} className="bg-sheet px-5 py-6 sm:px-7 sm:py-7">
              <dd className="font-display text-4xl sm:text-5xl font-semibold text-ink num">{value}</dd>
              <dt className="mt-1 text-sm text-muted">{label}</dt>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted">Read live from the Rota contract on NEAR testnet.</p>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-20">
        <h2 className="font-display text-3xl sm:text-4xl font-semibold text-ink max-w-3xl">
          Circles run on trust. Until someone leaves with the money.
        </h2>
        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-rule overflow-hidden" style={{ boxShadow: "var(--shadow)" }}>
            <div className="ruled h-full px-6 sm:px-8 pl-14 sm:pl-16 pt-8 pb-8 leading-[2rem]">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#8a6d3b] leading-8">The old way</p>
              <p className="font-semibold text-lg">Khan family committee — 50 a month</p>
              <ul className="text-[15px]">
                <li>Jan: Ayesha ✓ &nbsp;Bilal ✓ &nbsp;Sara ✓ &nbsp;Omar ✓</li>
                <li>Feb: Ayesha ✓ &nbsp;Bilal ✓ &nbsp;Sara ✓ &nbsp;Omar ✓</li>
                <li>Mar: Ayesha ✓ &nbsp;Bilal ✗ &nbsp;Sara ✓ &nbsp;Omar ✓</li>
                <li className="line-through decoration-[#c2412d] decoration-2">Apr: organizer holding 600, not answering calls</li>
              </ul>
              <p className="mt-2 text-[#c2412d] font-semibold">The cash sits with one person, and the record is a notebook.</p>
            </div>
          </div>
          <div className="rounded-3xl bg-band text-band-fg p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-wider text-marigold">With Rota</p>
            <ul className="mt-4 space-y-4">
              {[
                ["The cash sits in a vault, not a pocket", "Each circle gets its own Sputnik DAO. Nobody, including the organizer, can take money out."],
                ["Payouts follow the rules", "An on-chain draw, the agreed order or a bid decides who gets the pot. Anyone can re-check it."],
                ["A missed payment doesn't sink the circle", "Early winners leave part of the pot behind as cover, and every member locks a deposit."],
                ["The record is on-chain", "Who paid, who missed and who got paid lives on NEAR, not in a notebook anyone can lose."],
              ].map(([t, d]) => (
                <li key={t} className="flex gap-3">
                  <span aria-hidden className="mt-1 h-5 w-5 shrink-0 rounded-full bg-marigold text-[#241a02] text-xs font-bold inline-flex items-center justify-center">
                    ✓
                  </span>
                  <span>
                    <span className="font-semibold block">{t}</span>
                    <span className="opacity-75 text-[15px]">{d}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="border-y border-rule bg-band-soft">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-20">
          <h2 className="font-display text-3xl sm:text-4xl font-semibold text-ink max-w-2xl">How a round works</h2>
          <ol className="mt-10 grid gap-10 md:grid-cols-3">
            {[
              [
                "Everyone pays in",
                `Each member pays the same amount — say 50 ${TOKEN_SYMBOL} — straight into the circle's vault. The register shows who has paid.`,
              ],
              [
                "Anyone closes the round",
                "When everyone has paid, or the round's time is up, anyone can close it. Missed payments are covered from that member's holdback and deposit.",
              ],
              [
                "One member gets the pot",
                "An on-chain lucky draw, the agreed order, or the best discount bid picks who gets it. Nobody can rig it, and everyone can re-check it.",
              ],
            ].map(([title, text], i) => (
              <li key={title} className="flex gap-4">
                <span className="font-display text-4xl font-semibold text-marigold num leading-none" aria-hidden>
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-display text-xl font-semibold text-ink">{title}</h3>
                  <p className="mt-2 text-text">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-20 grid gap-12 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-3xl sm:text-4xl font-semibold text-ink">
            What happens when someone stops paying
          </h2>
          <p className="mt-4 text-lg text-text">
            This is why circles usually only work between close family. Rota makes the early winner leave part
            of the pot behind as cover.
          </p>
        </div>
        <div className="card p-6 space-y-4 text-text">
          <p>
            Bilal wins round 1 of a 3-person circle: a{" "}
            <span className="num font-semibold">300 {TOKEN_SYMBOL}</span> pot. He&apos;s new, so{" "}
            <span className="num font-semibold">150</span> is held back and{" "}
            <span className="num font-semibold">150</span> reaches him straight away.
          </p>
          <p>
            In round 2 he doesn&apos;t pay. When the round closes, <span className="num font-semibold">100</span> of
            his holdback covers it. Sara still gets the full <span className="num font-semibold">300</span>.
          </p>
          <p>
            Bilal&apos;s record now shows a missed payment, so his next circle holds back half again. Members who
            finish cleanly get less held back — none after three circles.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-8">
        <div className="rounded-3xl bg-band text-band-fg p-8 sm:p-12 grid gap-8 lg:grid-cols-[1.4fr_1fr] items-center">
          <div>
            <h2 className="font-display text-3xl sm:text-4xl font-semibold">Nobody holds the cash. Not even the organizer.</h2>
            <p className="mt-4 text-lg opacity-85 max-w-2xl">
              Each circle gets its own Sputnik DAO. Payments go straight in, and money only leaves through the
              DAO&apos;s own Transfer proposals — filed and approved by the circle&apos;s rules, because the rules are
              the DAO&apos;s only council member.
            </p>
          </div>
          <div className="space-y-3">
            <p className="opacity-85">
              Every circle has a Verify page that re-checks the vault, every payout and every draw in your browser,
              straight from the chain.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/demo" className="btn btn-pot">
                Try a demo circle
              </Link>
              <Link href="/circles" className="btn btn-quiet">
                See circles and verify one
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
