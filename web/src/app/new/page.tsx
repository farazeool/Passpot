"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createCommittee, explainError } from "@/lib/actions";
import { DAO_DEPOSIT_NEAR, TOKEN_SYMBOL } from "@/lib/config";
import { money, toBase } from "@/lib/format";
import type { PayoutMode } from "@/lib/types";
import { useWallet } from "@/lib/wallet";

const ROUNDS = [
  { secs: 120, label: "2 minutes (for trying it out)" },
  { secs: 3600, label: "1 hour" },
  { secs: 86400, label: "1 day" },
  { secs: 604800, label: "1 week" },
  { secs: 2592000, label: "1 month (30 days)" },
];

const MODES: { value: PayoutMode; title: string; text: string }[] = [
  {
    value: "Draw",
    title: "Lucky draw",
    text: "Each round, the contract draws one member who hasn't had the pot yet. The seed is public, so anyone can re-check it.",
  },
  {
    value: "Order",
    title: "Agreed order",
    text: "Members get the pot in the order they joined. Join early if you need it early.",
  },
  {
    value: "Bid",
    title: "Bidding",
    text: "Members who need the pot sooner offer a discount; the highest offer wins and the discount is shared with everyone still waiting. Falls back to a draw when nobody bids.",
  },
];

export default function NewCommitteePage() {
  const router = useRouter();
  const { actor, signIn } = useWallet();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("50");
  const [size, setSize] = useState(5);
  const [roundSecs, setRoundSecs] = useState(2592000);
  const [mode, setMode] = useState<PayoutMode>("Draw");
  const [withDao, setWithDao] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = name.trim().length > 0 && name.length <= 64 && Number(amount) > 0 && size >= 2 && size <= 20;
  const base = valid ? toBase(amount) : 0n;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!actor) return signIn();
    setBusy(true);
    setError(null);
    try {
      const id = await createCommittee(actor, { name: name.trim(), amount: base, size, roundSecs, mode, withDao });
      router.push(id ? `/c/${id}` : "/circles");
    } catch (err) {
      setError(explainError(err));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-10 sm:py-14">
      <h1 className="font-display text-4xl sm:text-5xl font-semibold text-ink">Start a circle</h1>
      <p className="mt-3 text-text">
        Set the rules once. After that, nobody — including you — can change who gets paid or move the money.
      </p>

      <form onSubmit={submit} className="mt-10 space-y-8">
        <div className="space-y-2">
          <label htmlFor="name" className="font-semibold text-ink block">
            Name
          </label>
          <input
            id="name"
            className="field"
            placeholder="Khan family committee"
            value={name}
            maxLength={64}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label htmlFor="amount" className="font-semibold text-ink block">
              Each member pays per round
            </label>
            <div className="flex items-center gap-2">
              <input
                id="amount"
                className="field num"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                required
              />
              <span className="text-muted">{TOKEN_SYMBOL}</span>
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="size" className="font-semibold text-ink block">
              Members
            </label>
            <input
              id="size"
              type="number"
              min={2}
              max={20}
              className="field num"
              value={size}
              onChange={(e) => setSize(Math.max(2, Math.min(20, Number(e.target.value) || 2)))}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="round" className="font-semibold text-ink block">
            Each round lasts
          </label>
          <select id="round" className="field" value={roundSecs} onChange={(e) => setRoundSecs(Number(e.target.value))}>
            {ROUNDS.map((r) => (
              <option key={r.secs} value={r.secs}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="space-y-3">
          <legend className="font-semibold text-ink mb-2">Who gets the pot each round</legend>
          {MODES.map((m) => (
            <label
              key={m.value}
              className={`flex gap-3 items-start rounded-2xl border p-4 cursor-pointer ${
                mode === m.value ? "border-ink bg-sheet" : "border-rule bg-sheet/50"
              }`}
            >
              <input
                type="radio"
                name="mode"
                className="mt-1 h-5 w-5 shrink-0 accent-[var(--ink)]"
                checked={mode === m.value}
                onChange={() => setMode(m.value)}
              />
              <span>
                <span className="font-semibold text-ink">{m.title}</span>
                <span className="block text-sm text-muted">{m.text}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <label className="flex gap-3 items-start rounded-2xl border border-rule bg-sheet p-4 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 shrink-0 accent-[var(--ink)]"
            checked={withDao}
            onChange={(e) => setWithDao(e.target.checked)}
          />
          <span>
            <span className="font-semibold text-ink">Keep the money in its own Sputnik DAO</span>
            <span className="block text-sm text-muted">
              Costs {DAO_DEPOSIT_NEAR} test NEAR for the DAO&apos;s storage. Every payment goes into the DAO, and payouts
              leave only through DAO proposals approved by the circle&apos;s rules. Untick for a quick test circle
              held by the contract.
            </span>
          </span>
        </label>

        {valid && (
          <p className="rounded-2xl bg-marigold-wash border border-marigold/40 p-4 text-text">
            Each round&apos;s pot: <strong className="num">{money(base * BigInt(size))} {TOKEN_SYMBOL}</strong>. Every member
            also locks a <span className="num">{money(base)} {TOKEN_SYMBOL}</span> deposit when joining, returned at the end.
          </p>
        )}

        {error && (
          <p role="alert" className="text-missed bg-missed-wash rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-3 items-center">
          {actor ? (
            <button className="btn btn-pot" type="submit" disabled={!valid || busy}>
              {busy ? "Creating…" : "Create circle"}
            </button>
          ) : (
            <button className="btn btn-primary" type="button" onClick={signIn}>
              Connect wallet to create
            </button>
          )}
          <Link href="/demo" className="link text-sm">
            Or try the demo without a wallet
          </Link>
        </div>
      </form>
    </div>
  );
}
