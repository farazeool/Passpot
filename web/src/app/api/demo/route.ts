// Signs transactions for the ready-made demo members, so anyone can try
// Rota without a wallet. Testnet only: the demo accounts hold nothing but
// test dollars and a little test NEAR for fees. Only Rota and testUSD
// calls are allowed, and only the ones the app itself makes.
import { Account, FailoverRpcProvider, JsonRpcProvider, KeyPairSigner, type KeyPairString } from "near-api-js";
import { CONTRACT, DAO_DEPOSIT_NEAR, RPC_URLS, TOKEN } from "@/lib/config";
import { readOutcome } from "@/lib/outcome";

interface DemoAccount {
  id: string;
  key: KeyPairString;
}

function demoAccounts(): DemoAccount[] {
  try {
    const parsed = JSON.parse(process.env.DEMO_ACCOUNTS ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((a) => a && a.id && a.key) : [];
  } catch {
    return [];
  }
}

const provider = () =>
  new FailoverRpcProvider(RPC_URLS.map((url) => new JsonRpcProvider({ url })));

const NEAR = 10n ** 24n;
const DAO_DEPOSIT = BigInt(DAO_DEPOSIT_NEAR) * NEAR;
/** Keep enough NEAR after a DAO for fees and storage. */
const DAO_RESERVE = DAO_DEPOSIT + (15n * NEAR) / 10n;
const DAO_COOLDOWN_MS = 60_000;
let lastDaoCreated = 0;

async function nearBalance(accountId: string): Promise<bigint> {
  const p = provider();
  const view = await p.viewAccount({ accountId });
  return BigInt(view.amount);
}

async function daoAvailable(organizer: string | undefined): Promise<boolean> {
  if (!organizer) return false;
  try {
    return (await nearBalance(organizer)) >= DAO_RESERVE && Date.now() - lastDaoCreated > DAO_COOLDOWN_MS;
  } catch {
    return false;
  }
}

export async function GET() {
  const accounts = demoAccounts();
  return Response.json({
    enabled: accounts.length >= 3,
    members: accounts.map((a) => a.id),
    organizer: accounts[0]?.id ?? null,
    daoAvailable: await daoAvailable(accounts[0]?.id),
  });
}

const CONTRACT_METHODS = new Set([
  "create_committee",
  "start",
  "place_bid",
  "advance_round",
  "claim",
  "recheck_dao",
  "retry_payout",
  "retry_forward",
]);

function reject(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function POST(req: Request) {
  const accounts = demoAccounts();
  if (accounts.length < 3) return reject("The demo isn't set up on this deployment.", 503);

  let body: { as?: string; receiverId?: string; methodName?: string; args?: Record<string, unknown>; deposit?: string; gasTgas?: number };
  try {
    body = await req.json();
  } catch {
    return reject("Invalid request.");
  }
  const { as, receiverId, methodName, args = {}, gasTgas = 100 } = body;
  const deposit = BigInt(body.deposit ?? "0");
  const signer = accounts.find((a) => a.id === as);
  if (!signer) return reject("That demo member doesn't exist.");
  if (!receiverId || !methodName) return reject("Missing call.");
  if (gasTgas < 1 || gasTgas > 300) return reject("Gas out of range.");

  if (receiverId === TOKEN) {
    if (methodName === "faucet") {
      if (deposit !== 0n) return reject("No deposit allowed.");
    } else if (methodName === "ft_transfer_call") {
      if (deposit !== 1n) return reject("Token transfers attach exactly 1 yoctoNEAR.");
      if (args.receiver_id !== CONTRACT) return reject("Demo members can only pay into Rota.");
    } else {
      return reject("Not allowed in the demo.");
    }
  } else if (receiverId === CONTRACT) {
    if (!CONTRACT_METHODS.has(methodName)) return reject("Not allowed in the demo.");
    if (methodName === "create_committee" && deposit > 0n) {
      if (deposit !== DAO_DEPOSIT) return reject("Wrong DAO deposit.");
      if (!(await daoAvailable(signer.id))) {
        return reject("The demo is out of test NEAR for new DAOs right now. Create it without a DAO.", 429);
      }
      lastDaoCreated = Date.now();
    } else if (deposit !== 0n) {
      return reject("No deposit allowed.");
    }
  } else {
    return reject("Demo members can only use Rota and testUSD.");
  }

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
    return Response.json(readOutcome(outcome));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return reject(message, 422);
  }
}
