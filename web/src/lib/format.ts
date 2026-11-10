import { TOKEN_DECIMALS } from "./config";

const UNIT = 10n ** BigInt(TOKEN_DECIMALS);

/** Base units → "1,234.50" (drops trailing zero cents). */
export function money(base: string | bigint | number, opts: { cents?: boolean } = {}): string {
  const v = BigInt(base);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const whole = abs / UNIT;
  const frac = abs % UNIT;
  const cents = Number((frac * 100n) / UNIT);
  const wholeStr = whole.toLocaleString("en-US");
  const showCents = opts.cents ?? cents !== 0;
  const s = showCents ? `${wholeStr}.${String(cents).padStart(2, "0")}` : wholeStr;
  return neg ? `-${s}` : s;
}

/** "25.5" → base units. */
export function toBase(amount: string): bigint {
  const [w, f = ""] = amount.trim().split(".");
  const frac = (f + "0".repeat(TOKEN_DECIMALS)).slice(0, TOKEN_DECIMALS);
  return BigInt(w || "0") * UNIT + BigInt(frac || "0");
}

/** "ayesha-demo.fatneek-committee.testnet" → "ayesha-demo" */
export function shortName(accountId: string): string {
  const first = accountId.split(".")[0];
  return first.length > 22 ? `${first.slice(0, 20)}…` : first;
}

/** A display name: demo accounts get their friendly name. */
export function displayName(accountId: string): string {
  const first = shortName(accountId).replace(/-demo$/, "");
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export function duration(secs: number): string {
  if (secs < 60) return `${secs} seconds`;
  if (secs < 3600) {
    const m = Math.round(secs / 60);
    return secs % 60 === 0 ? `${m} minute${m === 1 ? "" : "s"}` : `${(secs / 60).toFixed(1)} minutes`;
  }
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (secs < 86400) return plural(Math.round(secs / 3600), "hour");
  if (secs < 86400 * 7) return plural(Math.round(secs / 86400), "day");
  if (secs < 86400 * 27) return plural(Math.round(secs / 604800), "week");
  return `${Math.round(secs / (86400 * 30))} month${secs >= 86400 * 45 ? "s" : ""}`;
}

export function countdown(ms: number): string {
  if (ms <= 0) return "now";
  const s = Math.ceil(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
}

export function percent(bps: number): string {
  return `${bps / 100}%`;
}

/** A circle's name as people should see it: the live demo prefix becomes a badge instead. */
export function circleName(name: string): string {
  return name.replace(/^(undefined|Live demo:)\s*/i, "").trim() || name;
}

export function isLiveDemoName(name: string): boolean {
  return /^(undefined|Live demo:)\s/i.test(name);
}
