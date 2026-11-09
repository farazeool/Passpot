import type { CallResult } from "./actions";

/** Pull the return value and hash out of a final execution outcome. */
export function readOutcome(outcome: unknown): CallResult {
  if (!outcome || typeof outcome !== "object") return {};
  const o = outcome as {
    status?: { SuccessValue?: string; Failure?: unknown };
    transaction?: { hash?: string };
    transaction_outcome?: { id?: string };
    receipts_outcome?: { outcome: { status: { Failure?: unknown } } }[];
  };
  if (o.status && "Failure" in o.status && o.status.Failure) {
    throw new Error(`Smart contract panicked: ${failureText(o.status.Failure)}`);
  }
  const hash = o.transaction?.hash ?? o.transaction_outcome?.id;
  const raw = o.status?.SuccessValue;
  let value: unknown;
  if (raw) {
    try {
      value = JSON.parse(atob(raw));
    } catch {
      value = atob(raw);
    }
  }
  return { value, hash };
}

function failureText(f: unknown): string {
  const s = JSON.stringify(f);
  const m = s.match(/ExecutionError":"([^"]+)/);
  return m ? m[1].replace(/^Smart contract panicked: /, "") : s;
}
