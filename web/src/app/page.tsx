"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Circle } from "@/components/Circle";
import { TOKEN_SYMBOL } from "@/lib/config";
import { getConfig } from "@/lib/near";
import type { Committee, Member } from "@/lib/types";

const NAMES = ["ayesha", "bilal", "sara", "omar", "hina"];

/** A sample committee for the hero: the pot passes around the circle. */
function sample(round: number): Committee {
  const members: Member[] = NAMES.map((n, i) => ({
    account_id: `${n}.testnet`,
    deposit: "50000000",
    holdback: "0",
    holdback_release: "0",
    bonus: "0",
    paid_out_round: i < round - 1 ? i + 1 : null,
    paid_this_round: true,
    on_time: 0,
    missed: 0,
    claimed: false,
  }));
  return {
    id: 0,
    name: "Khan family committee",
    organizer: "ayesha.testnet",
    token: "",
    dao: null,
    dao_ready: true,
    amount: "50000000",
    size: 5,
    round_secs: 2592000,
    mode: "Draw",
    status: "Running",
    round,
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

export default function Home() {
  const [round, setRound] = useState(1);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    getConfig()
      .then((c) => setCount(c.committees))
      .catch(() => {});
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setRound((r) => (r >= 5 ? 1 : r + 1)), 3600);
    return () => clearInterval(t);
  }, []);

  const committee = useMemo(() => sample(round), [round]);
  const celebrate = round > 1 ? { accountId: `${NAMES[round - 2]}.testnet`, key: `r${round}` } : null;

  return (
    <>
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-12 sm:pt-20 pb-16 grid gap-12 lg:grid-cols-[1.1fr_1fr] items-center">
        <div>
          <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-semibold text-ink leading-[1.02]">
            A committee where nobody holds the cash.
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-text max-w-xl">
            Everyone pays in each month and one member takes the whole pot, until everyone has had a turn. Committee runs
            that on NEAR: the money sits in a vault no single person controls, and if someone stops paying, the circle
            keeps going.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/demo" className="btn btn-pot text-base">
              Try a demo committee
            </Link>
            <Link href="/new" className="btn btn-quiet text-base">
              Start your own
            </Link>
          </div>
          <p className="mt-4 text-sm text-muted">
            The demo needs no wallet. Every step is a real transaction on NEAR testnet.
            {count ? ` ${count} committees created so far.` : ""}
          </p>
        </div>
        <div aria-hidden="false">
          <Circle committee={committee} celebrate={celebrate} />
        </div>
      </section>

      <section className="border-y border-rule bg-sheet">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-20">
          <h2 className="font-display text-3xl sm:text-4xl font-semibold text-ink max-w-2xl">How a round works</h2>
          <ol className="mt-10 grid gap-10 md:grid-cols-3">
            {[
              [
                "Everyone pays in",
                `Each member pays the same amount — say 50 ${TOKEN_SYMBOL} — straight into the committee's vault. The register shows who has paid.`,
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
            This is why committees usually only work between close family. Committee makes the early winner leave part
            of the pot behind as cover.
          </p>
        </div>
        <div className="rounded-2xl border border-rule bg-sheet p-6 space-y-4 text-text">
          <p>
            Bilal wins round 1 of a 3-person committee: a{" "}
            <span className="num font-semibold">300 {TOKEN_SYMBOL}</span> pot. He&apos;s new, so{" "}
            <span className="num font-semibold">150</span> is held back and{" "}
            <span className="num font-semibold">150</span> reaches him straight away.
          </p>
          <p>
            In round 2 he doesn&apos;t pay. When the round closes, <span className="num font-semibold">100</span> of
            his holdback covers it. Sara still gets the full <span className="num font-semibold">300</span>.
          </p>
          <p>
            Bilal&apos;s record now shows a missed payment, so his next committee holds back half again. Members who
            finish cleanly get less held back — none after three committees.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-8">
        <div className="rounded-3xl bg-ink text-white p-8 sm:p-12 grid gap-8 lg:grid-cols-[1.4fr_1fr] items-center">
          <div>
            <h2 className="font-display text-3xl sm:text-4xl font-semibold">Nobody holds the cash. Not even the organizer.</h2>
            <p className="mt-4 text-lg text-white/85 max-w-2xl">
              Each committee gets its own Sputnik DAO. Payments go straight in, and money only leaves through the
              DAO&apos;s own Transfer proposals — filed and approved by the committee&apos;s rules, because the rules are
              the DAO&apos;s only council member.
            </p>
          </div>
          <div className="space-y-3">
            <p className="text-white/85">
              Every committee has a Verify page that re-checks the vault, every payout and every draw in your browser,
              straight from the chain.
            </p>
            <Link href="/committees" className="btn bg-white text-ink hover:bg-paper">
              See committees and verify one
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
