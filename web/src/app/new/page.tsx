"use client";

import { useTitle } from "@/lib/useTitle";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createCommittee, explainError } from "@/lib/actions";
import { DAO_DEPOSIT_NEAR, TOKEN_SYMBOL } from "@/lib/config";
import { duration, money, toBase } from "@/lib/format";
import { Circle } from "@/components/Circle";
import type { Committee } from "@/lib/types";
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

/** What the new circle will look like: you in the first seat, the rest open. */
function preview(name: string, amount: bigint, size: number, roundSecs: number, mode: PayoutMode, you: string): Committee {
  return {
    id: 0,
    name: name || "Your circle",
    organizer: you,
    token: "",
    dao: null,
    dao_ready: true,
    amount: amount.toString(),
    size,
    round_secs: roundSecs,
    mode,
    status: "Open",
    round: 0,
    round_started_ms: 0,
    members: [
      {
        account_id: you,
        deposit: amount.toString(),
        holdback: "0",
        holdback_release: "0",
        bonus: "0",
        paid_out_round: null,
        paid_this_round: false,
        on_time: 0,
        missed: 0,
        claimed: false,
      },
    ],
    bids: [],
    events: [],
    pot: (amount * BigInt(size)).toString(),
    round_ends_ms: 0,
    can_advance: false,
    held: "0",
    unforwarded: "0",
  } as unknown as Committee;
}

export default function NewCommitteePage() {
  useTitle("Start a circle");
  const router = useRouter();
  const { actor, signIn, accountId } = useWallet();
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
  const each = Number(amount) > 0 ? toBase(amount) : 0n;
  const draft = preview(name.trim(), each, size, roundSecs, mode, accountId ?? "you.testnet");

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
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 sm:py-14 grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] items-start">
      <div>
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

        <label className="flex gap-3 items-start card p-4 cursor-pointer">
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

      <aside className="lg:sticky lg:top-24 space-y-5" aria-label="Preview">
        <div className="card p-5">
          <p className="text-sm font-semibold text-muted">Preview</p>
          <p className="font-display text-2xl font-semibold text-ink mt-1 truncate">{name.trim() || "Your circle"}</p>
          <div className="mt-2 -mx-2">
            <Circle circle={draft} celebrate={null} />
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-rule pt-4">
            <div>
              <dt className="text-sm text-muted">Pot each round</dt>
              <dd className="font-display text-2xl font-semibold text-ink num">
                {money(each * BigInt(size))} <span className="text-base text-muted">{TOKEN_SYMBOL}</span>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Circle runs for</dt>
              <dd className="font-display text-2xl font-semibold text-ink num">{duration(roundSecs * size)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Each member pays in</dt>
              <dd className="font-semibold text-ink num">
                {money(each * BigInt(size))} {TOKEN_SYMBOL} in total
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Deposit to join</dt>
              <dd className="font-semibold text-ink num">
                {money(each)} {TOKEN_SYMBOL}, returned
              </dd>
            </div>
          </dl>
        </div>

        <div className="card p-5">
          <p className="font-display text-lg font-semibold text-ink">What happens next</p>
          <ol className="mt-3 space-y-3">
            {[
              ["Share the invite", "You get a link to send on WhatsApp. Anyone with a NEAR account can join until the seats are full."],
              ["Members lock a deposit", `Each pays a ${money(each)} ${TOKEN_SYMBOL} deposit when joining. It covers a missed payment and comes back at the end.`],
              ["You start round 1", `Then everyone pays ${money(each)} ${TOKEN_SYMBOL} every ${duration(roundSecs)}, and one member takes the pot each round.`],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-3">
                <span className="mt-0.5 h-6 w-6 shrink-0 rounded-full bg-marigold-wash border border-marigold/50 text-xs font-semibold text-ink inline-flex items-center justify-center num">
                  {i + 1}
                </span>
                <span>
                  <span className="font-semibold text-ink block">{t}</span>
                  <span className="text-sm text-muted">{d}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        {!actor && (
          <p className="text-sm text-muted px-1">
            Need test dollars? Connect a wallet, then press <span className="font-semibold text-ink">Get test dollars</span>{" "}
            in the top bar for 1,000 free {TOKEN_SYMBOL}.
          </p>
        )}
      </aside>
    </div>
  );
}
