"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { explorerTx } from "@/lib/config";

interface Toast {
  id: number;
  text: string;
  hash?: string;
  tone: "good" | "info";
}

const ToastContext = createContext<(text: string, opts?: { hash?: string; tone?: Toast["tone"] }) => void>(() => {});

/** Small confirmations after a transaction lands, with a link to see it on the explorer. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((text: string, opts: { hash?: string; tone?: Toast["tone"] } = {}) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text, hash: opts.hash, tone: opts.tone ?? "good" }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="fixed z-50 bottom-4 left-1/2 -translate-x-1/2 sm:left-auto sm:right-6 sm:translate-x-0 flex flex-col gap-2 w-[min(92vw,380px)] print:hidden"
      >
        {toasts.map((t) => (
          <div key={t.id} role="status" className="toast card flex items-start gap-3 px-4 py-3 text-sm" style={{ boxShadow: "var(--shadow-lift)" }}>
            <span
              aria-hidden
              className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                t.tone === "good" ? "bg-paid text-white" : "bg-marigold text-[#241a02]"
              }`}
            >
              {t.tone === "good" ? "✓" : "i"}
            </span>
            <span className="min-w-0 flex-1 text-text">
              {t.text}
              {t.hash && (
                <>
                  {" "}
                  <a className="link whitespace-nowrap" href={explorerTx(t.hash)} target="_blank" rel="noreferrer">
                    View transaction
                  </a>
                </>
              )}
            </span>
            <button
              className="text-muted hover:text-text -mr-1 px-1 leading-none text-lg"
              aria-label="Dismiss"
              onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
