"use client";

import { useState } from "react";

/** A value with a small copy button: account names, DAO addresses. */
export function Copy({ value, label }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      window.setTimeout(() => setDone(false), 1600);
    } catch {}
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1 align-baseline rounded-md px-1.5 py-0.5 text-xs font-medium text-muted hover:text-ink hover:bg-sheet border border-transparent hover:border-rule transition-colors"
      aria-label={label ?? `Copy ${value}`}
      title={done ? "Copied" : "Copy"}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        {done ? <path d="M5 12.5l4.5 4.5L19 7" strokeLinecap="round" strokeLinejoin="round" /> : (
          <>
            <rect x="8" y="8" width="12" height="12" rx="2.5" />
            <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
          </>
        )}
      </svg>
      {done ? "Copied" : "Copy"}
    </button>
  );
}
