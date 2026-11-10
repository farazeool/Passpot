"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { explainError, faucet } from "@/lib/actions";
import { TOKEN_SYMBOL } from "@/lib/config";
import { money } from "@/lib/format";
import { nameOf, useProfile } from "@/lib/profile";
import { Avatar, Person } from "./Avatar";
import { getTokenBalance } from "@/lib/near";
import { useWallet } from "@/lib/wallet";
import { Mark } from "./Mark";
import { ThemeToggle } from "./ThemeToggle";

export function Header() {
  const { accountId, signIn, signOut, actor, ready } = useWallet();
  const pathname = usePathname();
  const [balance, setBalance] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const profile = useProfile(accountId);

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
    { href: "/", label: "Home" },
    { href: "/circles", label: "Circles" },
    { href: "/new", label: "Start a circle" },
    { href: "/about", label: "About" },
    ...(accountId ? [{ href: "/money", label: "Your money" }] : []),
  ];

  return (
    <header className="border-b border-rule bg-paper/90 backdrop-blur sticky top-0 z-30 print:hidden">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2.5 shrink-0" aria-label="Rota home">
          <Mark size={34} />
          <span className="font-display text-[1.65rem] font-bold tracking-[-0.03em] text-ink">Rota</span>
        </Link>
        <nav className="hidden md:flex items-center gap-1 ml-4">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`px-3 py-2 rounded-full text-sm font-medium ${
                (n.href === "/" ? pathname === "/" : pathname?.startsWith(n.href)) ? "text-ink bg-sheet border border-rule" : "text-muted hover:text-ink"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          {accountId ? (
            <>
              <Link
                href={`/u/${accountId}`}
                className="flex items-center gap-2.5 rounded-full pl-1 pr-1 sm:pr-3 py-1 hover:bg-sheet border border-transparent hover:border-rule transition-colors"
                title="Your profile"
              >
                <Avatar id={accountId} size={30} />
                <span className="hidden sm:flex flex-col leading-tight">
                  <span className="text-sm font-medium text-ink max-w-[10rem] truncate">{nameOf(accountId, profile)}</span>
                  <span className="text-xs text-muted num">
                    {balance === null ? "…" : `${money(balance)} ${TOKEN_SYMBOL}`}
                  </span>
                </span>
              </Link>
              <button className="btn btn-quiet" onClick={getDollars} disabled={busy}>
                {busy && <span className="spinner" aria-hidden />}
                {busy ? "Adding" : "Get test dollars"}
              </button>
              <button className="btn btn-quiet hidden sm:inline-flex" onClick={() => signOut()}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/profile"
                className="rounded-full hover:opacity-80 transition-opacity"
                aria-label="Create your profile"
                title="Create your profile"
              >
                <Person id="" size={34} />
              </Link>
              <button className="btn btn-primary" onClick={signIn} disabled={!ready}>
                Connect wallet
              </button>
            </>
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
      {accountId && profile === null && !pathname?.startsWith("/u/") && !pathname?.startsWith("/profile") && (
        <div className="border-t border-rule bg-marigold-wash">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink">
            <span>Add your name so members know who you are.</span>
            <Link href="/profile" className="font-semibold underline underline-offset-2">
              Make your profile
            </Link>
          </div>
        </div>
      )}
      {note && (
        <div role="status" className="mx-auto max-w-6xl px-4 sm:px-6 pb-2 text-sm text-ink-soft">
          {note}
        </div>
      )}
    </header>
  );
}
