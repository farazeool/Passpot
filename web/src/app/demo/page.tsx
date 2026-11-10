"use client";

import { useTitle } from "@/lib/useTitle";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import * as act from "@/lib/actions";
import { TOKEN_SYMBOL } from "@/lib/config";
import { demoActor, getDemoInfo, rememberDemoCommittee, type DemoInfo } from "@/lib/demo";
import { displayName, toBase } from "@/lib/format";
import { getCommittee, getCommitteesFor, getTokenBalance } from "@/lib/near";
import { LIVE_DEMO_ROUND_SECS } from "@/lib/config";

type StepState = "waiting" | "running" | "done" | "failed";
interface Step {
  label: string;
  state: StepState;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function DemoPage() {
  useTitle("Try a demo circle");
  const router = useRouter();
  const [info, setInfo] = useState<DemoInfo | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [withDao, setWithDao] = useState(true);
  const [running, setRunning] = useState(false);

  const [looking, setLooking] = useState(true);

  // Instant demo: go straight to the live circle the agent keeps on round 2.
  useEffect(() => {
    const fresh = new URLSearchParams(window.location.search).has("fresh");
    getDemoInfo().then(async (i) => {
      setInfo(i);
      setWithDao(i.daoAvailable);
      if (!fresh && i.enabled && i.organizer) {
        try {
          const mine = await getCommitteesFor(i.organizer);
          const live = mine
            .filter((c) => c.round_secs === LIVE_DEMO_ROUND_SECS && c.status === "Running" && c.round >= 2)
            .sort((a, b) => b.id - a.id)[0];
          if (live) {
            router.replace(`/c/${live.id}`);
            return;
          }
        } catch {}
      }
      setLooking(false);
    });
  }, [router]);

  async function begin() {
    if (!info?.enabled || !info.organizer) return;
    const [org, ...others] = info.members;
    const names = info.members.map(displayName);
    const plan: string[] = [
      `${names[0]} creates the circle${withDao ? " and its own Sputnik DAO vault" : ""}`,
      "Everyone gets test dollars if they're low",
      ...names.map((n) => `${n} joins and locks a 10 ${TOKEN_SYMBOL} deposit`),
      `${names[0]} starts round 1`,
    ];
    setSteps(plan.map((label) => ({ label, state: "waiting" })));
    setRunning(true);
    setError(null);
    const mark = (i: number, state: StepState) =>
      setSteps((s) => s.map((st, j) => (j === i ? { ...st, state } : st)));

    let step = 0;
    try {
      mark(step, "running");
      const id = await act.createCommittee(demoActor(org), {
        name: `${names[0]}'s family committee`,
        amount: toBase("10"),
        size: info.members.length,
        roundSecs: 90,
        mode: "Draw",
        withDao,
      });
      if (!id) throw new Error("The circle was created but its id couldn't be read. Check the circles list.");
      rememberDemoCommittee(id);
      let c = await getCommittee(id);
      if (c?.dao && !c.dao_ready) {
        await act.recheckDao(demoActor(org), c);
        for (let i = 0; i < 10 && !c?.dao_ready; i++) {
          await sleep(1500);
          c = await getCommittee(id);
        }
      }
      if (!c) throw new Error("Couldn't read the new circle.");
      mark(step++, "done");

      mark(step, "running");
      for (const m of info.members) {
        if ((await getTokenBalance(m)) < toBase("100")) await act.faucet(demoActor(m));
      }
      mark(step++, "done");

      for (const m of [org, ...others]) {
        mark(step, "running");
        await act.join(demoActor(m), c);
        mark(step++, "done");
      }

      mark(step, "running");
      await act.start(demoActor(org), c);
      mark(step++, "done");
      router.push(`/c/${id}`);
    } catch (e) {
      mark(step, "failed");
      setError(act.explainError(e));
      setRunning(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-12 sm:py-16">
      <h1 className="font-display text-4xl sm:text-5xl font-semibold text-ink">Try a circle in two minutes</h1>
      <p className="mt-4 text-lg text-text">
        Three ready-made members — {info ? info.members.map(displayName).join(", ") : "Ayesha, Bilal and Sara"} — will
        set up a real circle on NEAR testnet. Then you play every one of them: pay in, skip a payment, run the draw.
        No wallet needed.
      </p>

      {info && !info.enabled && (
        <p role="alert" className="mt-8 text-missed bg-missed-wash rounded-lg px-4 py-3">
          The demo isn&apos;t switched on for this site. Connect a testnet wallet and{" "}
          <Link href="/new" className="link">
            start your own circle
          </Link>{" "}
          instead.
        </p>
      )}

      {looking && info?.enabled !== false && <p className="mt-8 text-muted">Finding the live demo circle…</p>}

      {!looking && info?.enabled && steps.length === 0 && (
        <div className="mt-8 space-y-5">
          <label className="flex gap-3 items-start card p-4 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 shrink-0 accent-[var(--ink)]"
              checked={withDao}
              disabled={!info.daoAvailable}
              onChange={(e) => setWithDao(e.target.checked)}
            />
            <span>
              <span className="font-semibold text-ink">Give it its own Sputnik DAO vault</span>
              <span className="block text-sm text-muted">
                {info.daoAvailable
                  ? "The real thing: every payment goes into a DAO only the circle's rules can spend from. Takes a few extra seconds."
                  : "The demo's test NEAR for new DAOs is used up for now, so this one keeps its money in the Rota contract."}
              </span>
            </span>
          </label>
          <button className="btn btn-pot text-base" onClick={begin} disabled={running}>
            Set up the demo circle
          </button>
        </div>
      )}

      {steps.length > 0 && (
        <ol className="mt-10 space-y-3" aria-live="polite">
          {steps.map((s, i) => (
            <li key={i} className="flex items-center gap-3">
              <span
                aria-hidden
                className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold num ${
                  s.state === "done"
                    ? "bg-paid text-white"
                    : s.state === "running"
                      ? "bg-marigold text-[#241a02] animate-pulse"
                      : s.state === "failed"
                        ? "bg-missed text-white"
                        : "border border-rule-strong text-muted"
                }`}
              >
                {s.state === "done" ? "✓" : s.state === "failed" ? "!" : i + 1}
              </span>
              <span className={s.state === "waiting" ? "text-muted" : "text-text"}>
                {s.label}
                <span className="sr-only"> — {s.state}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
      {error && (
        <div role="alert" className="mt-6 space-y-3">
          <p className="text-missed bg-missed-wash rounded-lg px-4 py-3">{error}</p>
          <button className="btn btn-quiet" onClick={() => setSteps([])}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
