"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Circle } from "@/components/Circle";
import { Tilt } from "@/components/Tilt";
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

const FAQ: [string, string][] = [
  [
    "What is a savings circle?",
    "A group of people who each pay the same amount every month. Each month one of them takes the whole pot, until everyone has had a turn. Nobody pays interest, and nobody needs a bank. It's called a committee, susu, tanda, chama or hui, depending on where you're from.",
  ],
  [
    "Can the organizer run off with the money?",
    "No. The money never sits with a person. Each circle has its own Sputnik DAO vault on NEAR, and money only leaves it to the member the rules pick. The organizer has no more power over the money than anyone else.",
  ],
  [
    "What if someone stops paying?",
    "Every member locks a deposit when they join, and members who get the pot early have part of it held back. A missed payment is covered from those, so the rest of the circle still gets paid in full. The miss is also recorded on that member's savings record.",
  ],
  [
    "How is the lucky draw fair?",
    "The winner is picked by the contract from NEAR's on-chain randomness, among members who haven't had the pot yet. Nobody, including us, can choose the result. Every circle's Verify page re-runs each draw in your browser so you can check it yourself.",
  ],
  [
    "Do I need crypto to try it?",
    "No. The demo circle needs no wallet: you act as three ready-made members and every step is a real transaction on NEAR testnet. To start or join your own circle, you need a free NEAR testnet account.",
  ],
  [
    "Is this real money?",
    `Not yet. Rota runs on NEAR testnet with ${TOKEN_SYMBOL}, a test dollar with no value that you can get for free. The same contract can run with real stablecoins like USDC on NEAR mainnet.`,
  ],
  [
    "Does Rota take a cut?",
    "No. There's no fee in the contract. The only costs are NEAR's network fees, which are fractions of a cent, and a one-time storage deposit for the circle's DAO.",
  ],
  [
    "Where is my profile kept?",
    "On NEAR Social, the profile store NEAR apps share, under your own account. Your savings record is kept by the Rota contract. Neither sits on our servers, and nobody can edit your record.",
  ],
];

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
          <p className="rise mb-5 inline-flex items-center gap-2.5 rounded-full border border-rule bg-sheet pl-1.5 pr-3.5 py-1.5 text-sm" style={{ animationDelay: "0ms" }}>
            <span className="rounded-full bg-marigold px-2.5 py-0.5 font-display text-[13px] font-bold tracking-[0.12em] text-[#241a02]">
              ROTA
            </span>
            <span className="font-medium text-ink">Savings circles on NEAR</span>
          </p>
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
          <Tilt max={5} className="rounded-3xl border border-rule overflow-hidden" style={{ boxShadow: "var(--shadow)" }}>
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
          </Tilt>
          <Tilt max={5} className="rounded-3xl bg-band text-band-fg p-6 sm:p-8">
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
          </Tilt>
        </div>
      </section>

      <section className="border-y border-rule bg-band-soft">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-20">
          <h2 className="font-display text-3xl sm:text-4xl font-semibold text-ink max-w-2xl">How a round works</h2>
          <ol className="mt-10 grid gap-5 md:grid-cols-3">
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
              <li key={title}>
                <Tilt className="card h-full p-6">
                  <span className="font-display text-5xl font-semibold text-marigold num leading-none" aria-hidden>
                    {i + 1}
                  </span>
                  <h3 className="mt-4 font-display text-xl font-semibold text-ink">{title}</h3>
                  <p className="mt-2 text-text">{text}</p>
                </Tilt>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-20" aria-labelledby="trust">
        <div className="max-w-2xl">
          <h2 id="trust" className="font-display text-3xl sm:text-4xl font-semibold text-ink">
            Pay on time, and Rota trusts you more.
          </h2>
          <p className="mt-4 text-lg text-text">
            When you get the pot before you&apos;ve finished paying in, part of it is held back as cover for the
            payments you still owe. How much depends on your savings record, which lives on-chain and follows you
            from circle to circle.
          </p>
        </div>
        <ol className="mt-10 grid gap-5 md:grid-cols-3">
          {[
            { who: "New member", held: 50, text: "Half of an early pot waits until your remaining payments are in. It comes back to you round by round as you pay." },
            { who: "One clean circle", held: 25, text: "Finish a circle without missing a payment and only a quarter is held back next time." },
            { who: "Three clean circles", held: 0, text: "You get the whole pot the moment it's yours. Your record is the guarantee." },
          ].map((t, i) => (
            <li key={t.who}>
              <Tilt className="card h-full p-6 flex flex-col">
                <p className="text-sm font-semibold text-muted">Level {i + 1}</p>
                <h3 className="mt-1 font-display text-2xl font-semibold text-ink">{t.who}</h3>
                <div className="mt-5" aria-label={`${t.held}% held back`}>
                  <div className="flex h-3 rounded-full overflow-hidden bg-rule">
                    <span className="bg-paid" style={{ width: `${100 - t.held}%` }} />
                    <span className="bg-marigold" style={{ width: `${t.held}%` }} />
                  </div>
                  <div className="mt-2 flex justify-between text-sm num">
                    <span className="text-text">
                      <strong className="text-ink">{100 - t.held}%</strong> paid to you now
                    </span>
                    {t.held > 0 && (
                      <span className="text-text">
                        <strong className="text-ink">{t.held}%</strong> held
                      </span>
                    )}
                  </div>
                </div>
                <p className="mt-4 text-text">{t.text}</p>
              </Tilt>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-muted">
          Miss a payment and the held money covers it, the circle carries on, and your next circle starts back at
          level 1.
        </p>
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

      <section id="faq" className="mx-auto max-w-6xl px-4 sm:px-6 pt-20 scroll-mt-24" aria-labelledby="faq-title">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr] items-start">
          <div className="lg:sticky lg:top-24">
            <h2 id="faq-title" className="font-display text-3xl sm:text-4xl font-semibold text-ink">
              FAQ <span className="text-muted font-medium text-lg sm:text-xl tracking-normal whitespace-nowrap">(Frequently asked questions)</span>
            </h2>
            <p className="mt-4 text-lg text-text">The things people ask before they join their first circle.</p>
          </div>
          <div className="border-t border-rule">
            {FAQ.map(([q, a]) => (
              <details key={q} className="faq border-b border-rule group">
                <summary className="flex items-center justify-between gap-6 py-5 font-semibold text-ink text-lg">
                  {q}
                  <span aria-hidden className="faq-icon text-2xl font-normal text-muted leading-none">
                    +
                  </span>
                </summary>
                <p className="faq-body pb-5 -mt-1 text-text max-w-2xl">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
