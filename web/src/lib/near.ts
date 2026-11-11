// Read-only access to NEAR over JSON-RPC. Works in the browser and on the server.
import { CONTRACT, RPC_URLS, TOKEN } from "./config";
import type { Committee, ContractConfig, Reputation } from "./types";

let rpcIndex = 0;

async function rpc<T>(method: string, params: unknown): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < RPC_URLS.length; attempt++) {
    const url = RPC_URLS[(rpcIndex + attempt) % RPC_URLS.length];
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "committee", method, params }),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`RPC ${res.status}`);
      const body = await res.json();
      if (body.error) throw new Error(body.error?.cause?.name ?? body.error?.message ?? "RPC error");
      rpcIndex = (rpcIndex + attempt) % RPC_URLS.length;
      return body.result as T;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

function toBase64(s: string): string {
  if (typeof btoa === "function") return btoa(unescape(encodeURIComponent(s)));
  return Buffer.from(s, "utf8").toString("base64");
}

/** Call a view method and parse its JSON result. */
export async function view<T>(contractId: string, methodName: string, args: object = {}): Promise<T> {
  const result = await rpc<{ result: number[] }>("query", {
    request_type: "call_function",
    finality: "optimistic",
    account_id: contractId,
    method_name: methodName,
    args_base64: toBase64(JSON.stringify(args)),
  });
  const text = new TextDecoder().decode(new Uint8Array(result.result));
  return (text ? JSON.parse(text) : null) as T;
}

export async function accountExists(accountId: string): Promise<boolean> {
  try {
    await rpc("query", { request_type: "view_account", finality: "final", account_id: accountId });
    return true;
  } catch {
    return false;
  }
}

export const getCommittee = (id: number) => view<Committee | null>(CONTRACT, "get_committee", { committee_id: id });
export const getCommittees = (from_index = 0, limit = 50) =>
  view<Committee[]>(CONTRACT, "get_committees", { from_index, limit });
export const getCommitteesFor = (account_id: string) =>
  view<Committee[]>(CONTRACT, "get_committees_for", { account_id });
export const getReputation = (account_id: string) => view<Reputation>(CONTRACT, "get_reputation", { account_id });
export const getConfig = () => view<ContractConfig>(CONTRACT, "get_config");
export const getTokenBalance = async (account_id: string) =>
  BigInt((await view<string>(TOKEN, "ft_balance_of", { account_id })) ?? "0");

/** Full-access keys on an account. None means nobody can change its contract code. */
export async function fullAccessKeys(accountId: string): Promise<string[]> {
  const r = await rpc<{ keys: { public_key: string; access_key: { permission: unknown } }[] }>("query", {
    request_type: "view_access_key_list",
    finality: "final",
    account_id: accountId,
  });
  return r.keys.filter((k) => k.access_key.permission === "FullAccess").map((k) => k.public_key);
}
