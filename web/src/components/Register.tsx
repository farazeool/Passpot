import { TOKEN_SYMBOL } from "@/lib/config";
import { displayName, money } from "@/lib/format";
import { register, type Cell } from "@/lib/ledger";
import type { Committee } from "@/lib/types";

const CELL: Record<Cell, { label: string; className: string; text: string }> = {
  paid: { label: "Paid", className: "bg-paid-wash text-paid", text: "Paid" },
  covered: { label: "Missed, covered from holdback or deposit", className: "bg-missed-wash text-missed", text: "Covered" },
  missed: { label: "Missed and not covered", className: "bg-missed text-white", text: "Missed" },
  due: { label: "Due this round", className: "border border-dashed border-rule-strong text-muted", text: "Due" },
  future: { label: "Later round", className: "text-rule-strong", text: "" },
  none: { label: "", className: "", text: "" },
};

/** The circle register: one row per member, one column per round. */
export function Register({ circle: c }: { circle: Committee }) {
  const rows = register(c);
  const rounds = Array.from({ length: c.size }, (_, i) => i + 1);
  if (rows.length === 0) {
    return <p className="text-muted">Nobody has joined yet. The register fills in as members join and pay.</p>;
  }
  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <caption className="sr-only">Who paid in each round, and when each member received the pot</caption>
        <thead>
          <tr className="text-left text-muted">
            <th scope="col" className="font-medium py-2 pl-4 sm:pl-0 pr-3">Member</th>
            {rounds.map((r) => (
              <th
                key={r}
                scope="col"
                className={`font-medium py-2 px-1 text-center num ${r === c.round && c.status === "Running" ? "text-ink" : ""}`}
              >
                Round {r}
              </th>
            ))}
            <th scope="col" className="font-medium py-2 px-3 text-right">Received</th>
            <th scope="col" className="font-medium py-2 pl-3 pr-4 sm:pr-0 text-right">Still locked</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const m = c.members.find((x) => x.account_id === row.accountId)!;
            const locked = BigInt(m.deposit) + BigInt(m.holdback) + BigInt(m.bonus);
            return (
              <tr key={row.accountId} className="border-t border-rule">
                <th scope="row" className="text-left font-semibold py-2.5 pl-4 sm:pl-0 pr-3 whitespace-nowrap">
                  {displayName(row.accountId)}
                  {m.account_id === c.organizer && <span className="ml-1.5 text-xs font-normal text-muted">organizer</span>}
                </th>
                {row.cells.map((cell, i) => {
                  const pot = row.receivedRound === i + 1;
                  return (
                    <td key={i} className="px-1 py-1.5 text-center">
                      <span
                        title={pot ? `Received the pot in round ${i + 1}` : CELL[cell].label}
                        className={`inline-flex items-center justify-center gap-1 min-w-[4.5rem] h-7 rounded-full text-xs font-semibold ${CELL[cell].className} ${
                          pot ? "ring-2 ring-marigold" : ""
                        }`}
                      >
                        {CELL[cell].text}
                        {pot && <span className="text-[color:var(--marigold)]" aria-hidden>●</span>}
                        {pot && <span className="sr-only">, received the pot</span>}
                      </span>
                    </td>
                  );
                })}
                <td className="px-3 py-2.5 text-right num whitespace-nowrap">
                  {row.receivedAmount > 0n ? money(row.receivedAmount) : "—"}
                </td>
                <td className="pl-3 pr-4 sm:pr-0 py-2.5 text-right num whitespace-nowrap text-muted">{money(locked)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 px-4 sm:px-0 text-xs text-muted">
        Amounts in {TOKEN_SYMBOL}. A marigold ring marks the round a member received the pot. Still locked is the
        member&apos;s deposit plus holdback, returned when the circle ends.
      </p>
    </div>
  );
}
