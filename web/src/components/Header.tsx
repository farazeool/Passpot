"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { explainError, faucet } from "@/lib/actions";
import { TOKEN_SYMBOL } from "@/lib/config";
import { money, shortName } from "@/lib/format";
import { getTokenBalance } from "@/lib/near";
import { useWallet } from "@/lib/wallet";
import { Mark } from "./Mark";

export function Header() {
  const { accountId, signIn, signOut, actor, ready } = useWallet();
  const pathname = usePathname();
  const [balance, setBalance] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!accountId) return setBalance(null);
    try {
      setBalance(await getTokenBalance(accountId));
    } catch {
      setBalance(null);
    }
  }, [accountId]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 10_000);
    return () => clearInterval(t);
  }, [refresh]);

  async function getDollars() {
    if (!actor) return;
    setBusy(true);
    setNote(null);
    try {
      await faucet(actor);
      await refresh();
      setNote(`Added 1,000 ${TOKEN_SYMBOL}`);
    } catch (e) {
      setNote(explainError(e));
    } finally {
      setBusy(false);
    }
  }

  const nav = [
    { href: "/committees", label: "Committees" },
    { href: "/new", label: "Start a committee" },
  ];

  return (
    <header className="border-b border-rule bg-paper/90 backdrop-blur sticky top-0 z-30">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2.5 shrink-0" aria-label="Committee home">
          <Mark size={28} />
          <span className="font-display text-xl font-semibold text-ink">Committee</span>
        </Link>
        <nav className="hidden md:flex items-center gap-1 ml-4">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`px-3 py-2 rounded-full text-sm font-medium ${
                pathname?.startsWith(n.href) ? "text-ink bg-sheet border border-rule" : "text-muted hover:text-ink"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {accountId ? (
            <>
              <div className="hidden sm:flex flex-col items-end leading-tight mr-1">
                <Link href={`/u/${accountId}`} className="text-sm font-medium text-ink hover:underline">
                  {shortName(accountId)}
                </Link>
                <span className="text-xs text-muted num">
                  {balance === null ? "…" : `${money(balance)} ${TOKEN_SYMBOL}`}
                </span>
              </div>
              <button className="btn btn-quiet" onClick={getDollars} disabled={busy}>
                {busy ? "Adding…" : "Get test dollars"}
              </button>
              <button className="btn btn-quiet hidden sm:inline-flex" onClick={() => signOut()}>
                Sign out
              </button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={signIn} disabled={!ready}>
              Connect wallet
            </button>
          )}
        </div>
      </div>
      <nav className="md:hidden border-t border-rule px-4 flex gap-1 overflow-x-auto">
        {nav.map((n) => (
          <Link key={n.href} href={n.href} className="px-3 py-2.5 text-sm font-medium text-muted hover:text-ink">
            {n.label}
          </Link>
        ))}
      </nav>
      {note && (
        <div role="status" className="mx-auto max-w-6xl px-4 sm:px-6 pb-2 text-sm text-ink-soft">
          {note}
        </div>
      )}
    </header>
  );
}
