"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CONTRACT, explorerAccount } from "@/lib/config";
import { getCommittee } from "@/lib/near";
import type { Committee } from "@/lib/types";
import { runChecks, type Check } from "@/lib/verify";

function VerifyPageInner() {
  const { id } = useParams<{ id: string }>();
  const [c, setC] = useState<Committee | null>(null);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const committee = await getCommittee(Number(id));
      if (!committee) throw new Error(`Committee #${id} doesn't exist.`);
      setC(committee);
      setChecks(await runChecks(committee));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, [id]);

  useEffect(() => {
    run();
  }, [run]);

  const applicable = checks?.filter((ch) => ch.ok !== null) ?? [];
  const passed = applicable.filter((ch) => ch.ok).length;

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10 sm:py-14">
      <Link href={`/c/${id}`} className="link text-sm">
        Back to {c?.name ?? `committee #${id}`}
      </Link>
      <h1 className="font-display text-4xl font-semibold text-ink mt-3">Check it yourself</h1>
      <p className="mt-3 text-text max-w-prose">
        These checks run in your browser and read straight from NEAR — the Committee contract (
        <a className="link" href={explorerAccount(CONTRACT)} target="_blank" rel="noreferrer">
          {CONTRACT}
        </a>
        ){c?.dao ? ", the committee's Sputnik DAO and the token" : " and the token"}. Nothing here relies on this
        website being honest.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        {checks && (
          <p className="font-display text-2xl font-semibold text-ink num" aria-live="polite">
            {passed} of {applicable.length} checks pass
          </p>
        )}
        <button className="btn btn-quiet" onClick={run} disabled={running}>
          {running ? "Checking…" : "Run the checks again"}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-6 text-missed bg-missed-wash rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      {!checks && !error && <p className="mt-6 text-muted">Reading the chain…</p>}

      <ol className="mt-8 space-y-4">
        {checks?.map((ch) => (
          <li key={ch.title} className="rounded-2xl bg-sheet border border-rule p-5">
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  ch.ok === null ? "bg-rule text-muted" : ch.ok ? "bg-paid text-white" : "bg-missed text-white"
                }`}
              >
                {ch.ok === null ? "–" : ch.ok ? "✓" : "!"}
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-lg font-semibold text-ink">
                  {ch.title}
                  <span className="sr-only">{ch.ok === null ? " (not applicable)" : ch.ok ? " (passes)" : " (fails)"}</span>
                </h2>
                <p className="mt-1 text-sm text-text">{ch.detail}</p>
                {ch.items && ch.items.length > 0 && (
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {ch.items.map((it, i) => (
                      <li key={i} className="flex gap-2">
                        <span className={it.ok ? "text-paid" : "text-missed"} aria-hidden>
                          {it.ok ? "✓" : "✗"}
                        </span>
                        <span className="break-words min-w-0">{it.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 text-muted">Loading…</div>}>
      <VerifyPageInner />
    </Suspense>
  );
}
