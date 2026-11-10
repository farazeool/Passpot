// Server-only: signs NEAR transactions for the demo members and the agent.
// Testnet keys only, read from the DEMO_ACCOUNTS environment variable.
import "server-only";
import { Account, JsonRpcProvider, KeyPairSigner, type KeyPairString } from "near-api-js";
import { RPC_URLS } from "@/lib/config";
import { readOutcome } from "@/lib/outcome";
import type { CallResult } from "@/lib/actions";

export interface DemoAccount {
  id: string;
  key: KeyPairString;
}

export function demoAccounts(): DemoAccount[] {
  try {
    const parsed = JSON.parse(process.env.DEMO_ACCOUNTS ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((a) => a && a.id && a.key) : [];
  } catch {
    return [];
  }
}

// One provider at a time, so contract errors come back as they are (a failover
// provider reports any failure as "exceeded providers"). The next URL is used
// only when the current one can't be reached.
let rpcIndex = 0;
export const provider = () => new JsonRpcProvider({ url: RPC_URLS[rpcIndex % RPC_URLS.length] });
const isNetworkError = (e: unknown) =>
  /fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|socket|429|502|503|504|timeout/i.test(e instanceof Error ? e.message : String(e));

export async function nearBalance(accountId: string): Promise<bigint> {
  const view = await provider().viewAccount({ accountId });
  return BigInt(view.amount);
}

export async function signAndSend(
  signer: DemoAccount,
  receiverId: string,
  methodName: string,
  args: object,
  gasTgas: number,
  deposit: bigint,
): Promise<CallResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt < RPC_URLS.length; attempt++) {
    try {
      const account = new Account(signer.id, provider(), KeyPairSigner.fromSecretKey(signer.key));
      const outcome = await account.callFunctionRaw({
        contractId: receiverId,
        methodName,
        args,
        deposit,
        gas: BigInt(gasTgas) * 1_000_000_000_000n,
        waitUntil: "EXECUTED_OPTIMISTIC",
      });
      return readOutcome(outcome);
    } catch (e) {
      lastError = e;
      if (isNetworkError(e) && attempt + 1 < RPC_URLS.length) {
        rpcIndex++;
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}
