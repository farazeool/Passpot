import { TOKEN_SYMBOL, explorerAccount } from "@/lib/config";
import { displayName, money } from "@/lib/format";
import { heldBack, howChosen } from "@/lib/ledger";
import type { Committee, CommitteeEvent } from "@/lib/types";

function sentence(e: CommitteeEvent, c: Committee): React.ReactNode {
  const who = e.account_id ? displayName(e.account_id) : "";
  const amt = `${money(e.amount)} ${TOKEN_SYMBOL}`;
  switch (e.kind) {
    case "Created":
      return "Committee created";
    case "DaoReady":
      return (
        <>
          Vault opened: its own Sputnik DAO,{" "}
          <a className="link" href={explorerAccount(e.account_id ?? c.dao ?? "")} target="_blank" rel="noreferrer">
            {e.account_id ?? c.dao}
          </a>
        </>
      );
    case "Joined":
      return `${who} joined and locked a ${amt} deposit`;
    case "Started":
      return `Round ${e.round} began`;
    case "Contributed":
      return `${who} paid ${amt} for round ${e.round}`;
    case "Bid": {
      const bps = Number(e.note?.match(/(\d+)/)?.[1] ?? 0);
      return `${who} offered a ${bps / 100}% discount to get the pot this round`;
    }
    case "Covered":
      return `${who} missed round ${e.round}; ${amt} was covered from their holdback and deposit`;
    case "Shortfall":
      return `${who} missed round ${e.round}; ${amt} could not be covered`;
    case "Payout": {
      const held = heldBack(e.note);
      return (
        <>
          <strong className="font-semibold text-ink">{who} received the round {e.round} pot</strong> by{" "}
          {howChosen(e.note)}: {amt} sent
          {held > 0n ? `, ${money(held)} ${TOKEN_SYMBOL} held back until their remaining payments are in` : ""}
        </>
      );
    }
    case "DaoProposal":
      return (
        <>
          The DAO paid {who} {amt} through{" "}
          <a className="link" href={explorerAccount(c.dao ?? "")} target="_blank" rel="noreferrer">
            {e.note?.replace("proposal ", "proposal #")}
          </a>
        </>
      );
    case "Claimed":
      return `${who} took back ${amt} (deposit, released holdback and any shared discounts)`;
    case "Finished":
      return "Every member has had the pot. Members can now claim what's still locked.";
    default:
      return e.kind;
  }
}

export function Activity({ committee: c }: { committee: Committee }) {
  const events = [...c.events].reverse();
  return (
    <ol className="space-y-0">
      {events.map((e, i) => (
        <li
          key={`${e.timestamp_ms}-${i}`}
          className={`flex gap-3 py-2.5 border-t border-rule text-sm ${e.kind === "Payout" ? "bg-marigold-wash/60 -mx-3 px-3 rounded" : ""}`}
        >
          <time className="text-muted num w-[4.5rem] shrink-0" dateTime={new Date(e.timestamp_ms).toISOString()}>
            {new Date(e.timestamp_ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </time>
          <span>{sentence(e, c)}</span>
        </li>
      ))}
    </ol>
  );
}
