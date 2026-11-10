"use client";

import { useEffect, useState } from "react";
import { TOKEN_SYMBOL } from "@/lib/config";
import { countdown, displayName, duration, money, circleName } from "@/lib/format";
import type { Committee } from "@/lib/types";

const whatsapp = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

function useUrl() {
  const [url, setUrl] = useState("");
  useEffect(() => setUrl(window.location.href.split("?")[0]), []);
  return url;
}

/** While seats are open: a link to share, ready-written for WhatsApp. */
export function Invite({ circle: c }: { circle: Committee }) {
  const url = useUrl();
  const [copied, setCopied] = useState(false);
  const open = c.size - c.members.length;
  const text = `Join our savings circle "${circleName(c.name)}" on Rota: ${c.size} of us each pay ${money(c.amount)} ${TOKEN_SYMBOL} every ${duration(c.round_secs)}, and one of us takes the pot each round. The money sits in a vault nobody controls, not even me. Join here: ${url}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <section aria-labelledby="invite" className="card p-5 sm:p-6">
      <h2 id="invite" className="font-display text-xl font-semibold text-ink">
        {open} seat{open === 1 ? "" : "s"} still open
      </h2>
      <p className="mt-1 text-text">Send the link to the people you want in the circle. Anyone with it can join.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <a className="btn btn-primary" href={whatsapp(text)} target="_blank" rel="noreferrer">
          Invite on WhatsApp
        </a>
        <button className="btn btn-quiet" onClick={copy}>
          {copied ? "Link copied" : "Copy link"}
        </button>
      </div>
    </section>
  );
}

/** During a round: who still owes, and a reminder ready to send. */
export function Remind({ circle: c, now }: { circle: Committee; now: number }) {
  const url = useUrl();
  const unpaid = c.members.filter((m) => !m.paid_this_round);
  if (c.status !== "Running" || unpaid.length === 0) return null;
  const names = unpaid.map((m) => displayName(m.account_id));
  const due = c.round_ends_ms - now;
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  const text = `Reminder for "${circleName(c.name)}": round ${c.round} payments of ${money(c.amount)} ${TOKEN_SYMBOL} are due ${
    due > 0 ? `in ${countdown(due)}` : "now"
  }. Still to pay: ${list}. If a payment is missed, it's covered from that member's holdback, and it shows on their record. Pay here: ${url}`;
  return (
    <section aria-labelledby="remind" className="card p-5 sm:p-6">
      <h2 id="remind" className="font-display text-xl font-semibold text-ink">
        Still to pay this round
      </h2>
      <ul className="mt-2 flex flex-wrap gap-2">
        {names.map((n) => (
          <li key={n} className="rounded-full border border-dashed border-rule-strong px-3 py-1 text-sm">
            {n}
          </li>
        ))}
      </ul>
      <a className="btn btn-quiet mt-4" href={whatsapp(text)} target="_blank" rel="noreferrer">
        Send a reminder on WhatsApp
      </a>
    </section>
  );
}
