"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";

export interface TourStep {
  /** id of the element to spotlight */
  target: string;
  title: string;
  body: string;
}

const KEY = "rota.tour.done";

export function tourDone(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * A short guided tour: dims the page, spotlights one part at a time and explains it.
 * Keyboard: arrow keys move, Escape closes. Shown once per browser, replayable.
 */
export function Tour({ steps, open, onClose }: { steps: TourStep[]; open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[i];

  const close = useCallback(() => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
    setI(0);
    onClose();
  }, [onClose]);

  const measure = useCallback(() => {
    const el = step ? document.getElementById(step.target) : null;
    setRect(el ? el.getBoundingClientRect() : null);
  }, [step]);

  // Bring the step's element into view, then measure it.
  useEffect(() => {
    if (!open || !step) return;
    const el = document.getElementById(step.target);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const fits = r.top >= 80 && r.bottom <= window.innerHeight - 220;
    if (!fits) el.scrollIntoView({ behavior: "smooth", block: r.height > window.innerHeight * 0.55 ? "start" : "center" });
    const t = window.setTimeout(measure, fits ? 0 : 420);
    return () => window.clearTimeout(t);
  }, [open, step, measure]);

  useLayoutEffect(() => {
    if (!open) return;
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
    };
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setI((x) => Math.min(x + 1, steps.length - 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(x - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, steps.length]);

  if (!open || !step) return null;

  const pad = 10;
  const box = rect
    ? { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }
    : null;
  // Card below the spotlight if there's room, else above; centred on phones.
  const below = box ? box.top + box.height + 16 + 200 < window.innerHeight : true;
  const cardTop = box ? (below ? box.top + box.height + 14 : Math.max(16, box.top - 14 - 200)) : window.innerHeight / 2 - 100;
  const cardLeft = box ? Math.min(Math.max(16, box.left), window.innerWidth - 16 - Math.min(380, window.innerWidth - 32)) : 16;
  const last = i === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[60] print:hidden" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {/* click outside to close */}
      <button className="absolute inset-0 w-full h-full cursor-default" aria-label="Close the tour" onClick={close} tabIndex={-1} />
      {box && (
        <div
          className="absolute rounded-[1.25rem] pointer-events-none"
          style={{
            ...box,
            boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.62), 0 0 0 2px var(--marigold)",
            transition: "all 320ms cubic-bezier(0.2, 0.8, 0.2, 1)",
          }}
        />
      )}
      <div
        className="toast absolute card p-5 w-[min(380px,calc(100vw-32px))]"
        style={{ top: cardTop, left: cardLeft, boxShadow: "var(--shadow-lift)", transition: "top 320ms ease, left 320ms ease" }}
      >
        <p className="text-xs font-semibold text-muted num" aria-hidden>
          {i + 1} of {steps.length}
        </p>
        <h2 id="tour-title" className="font-display text-xl font-semibold text-ink mt-1">
          {step.title}
        </h2>
        <p className="mt-2 text-[15px] text-text leading-relaxed">{step.body}</p>
        <div className="mt-4 flex items-center gap-2">
          <div className="flex gap-1.5 mr-auto" aria-hidden>
            {steps.map((_, k) => (
              <span
                key={k}
                className="h-1.5 rounded-full transition-all"
                style={{ width: k === i ? 18 : 6, background: k === i ? "var(--marigold)" : "var(--rule-strong)" }}
              />
            ))}
          </div>
          {i > 0 ? (
            <button className="btn btn-ghost btn-sm" onClick={() => setI(i - 1)}>
              Back
            </button>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={close}>
              Skip
            </button>
          )}
          <button className="btn btn-primary btn-sm" autoFocus onClick={() => (last ? close() : setI(i + 1))}>
            {last ? "Got it" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
