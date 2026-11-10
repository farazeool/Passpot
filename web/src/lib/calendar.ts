// Payment reminders for a circle: an .ics file (Apple, Outlook, most phones)
// and a Google Calendar link. Dates are when each round is due to close;
// a round can close a little later if nobody closes it on time.
import { TOKEN_SYMBOL } from "./config";
import { circleName, money } from "./format";
import type { Committee } from "./types";

const DAY = 86_400;

/** Calendar reminders only make sense for rounds of a day or longer. */
export const canRemind = (c: Committee) => c.status === "Running" && c.round_secs >= DAY;

/** Due dates for this round (if still unpaid) and every round after it. */
export function dueDates(c: Committee, includeCurrent: boolean): Date[] {
  const out: Date[] = [];
  for (let r = includeCurrent ? c.round : c.round + 1; r <= c.size; r++) {
    out.push(new Date(c.round_ends_ms + (r - c.round) * c.round_secs * 1000));
  }
  return out;
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");

export function icsFor(c: Committee, url: string, includeCurrent: boolean): string {
  const name = circleName(c.name);
  const amount = `${money(c.amount)} ${TOKEN_SYMBOL}`;
  const alarm = c.round_secs >= 2 * DAY ? "-P1D" : "-PT2H";
  const events = dueDates(c, includeCurrent).map((d, i) => {
    const round = (includeCurrent ? c.round : c.round + 1) + i;
    return [
      "BEGIN:VEVENT",
      `UID:rota-${c.id}-${round}@rota`,
      `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${stamp(new Date(d.getTime() - 30 * 60 * 1000))}`,
      `DTEND:${stamp(d)}`,
      `SUMMARY:${esc(`Pay ${amount} into ${name} (round ${round})`)}`,
      `DESCRIPTION:${esc(`Round ${round} of ${c.size} closes now. Pay here: ${url}`)}`,
      `URL:${url}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${esc(`${name}: ${amount} due`)}`,
      `TRIGGER:${alarm}`,
      "END:VALARM",
      "END:VEVENT",
    ].join("\r\n");
  });
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Rota//Savings circle//EN", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR"].join(
    "\r\n",
  );
}

export function downloadIcs(c: Committee, url: string, includeCurrent: boolean) {
  const blob = new Blob([icsFor(c, url, includeCurrent)], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${circleName(c.name).replace(/[^\w]+/g, "-").toLowerCase() || "rota"}-payments.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Google Calendar: the next payment, repeating every round until the circle ends. */
export function googleLink(c: Committee, url: string, includeCurrent: boolean): string {
  const dates = dueDates(c, includeCurrent);
  if (!dates.length) return "";
  const first = dates[0];
  const amount = `${money(c.amount)} ${TOKEN_SYMBOL}`;
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: `Pay ${amount} into ${circleName(c.name)}`,
    dates: `${stamp(new Date(first.getTime() - 30 * 60 * 1000))}/${stamp(first)}`,
    details: `Your Rota savings circle payment. Pay here: ${url}`,
  });
  const days = Math.round(c.round_secs / DAY);
  if (dates.length > 1 && days * DAY === c.round_secs) {
    p.set("recur", `RRULE:FREQ=DAILY;INTERVAL=${days};COUNT=${dates.length}`);
  }
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
