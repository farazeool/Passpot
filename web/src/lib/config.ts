export const NETWORK = (process.env.NEXT_PUBLIC_NETWORK ?? "testnet") as "testnet" | "mainnet";
export const CONTRACT = process.env.NEXT_PUBLIC_CONTRACT ?? "cmt.fatneek-committee.testnet";
export const TOKEN = process.env.NEXT_PUBLIC_TOKEN ?? "usd.fatneek-committee.testnet";
export const RPC_URLS = (
  process.env.NEXT_PUBLIC_RPC ?? "https://test.rpc.fastnear.com,https://rpc.testnet.near.org"
).split(",");

/** testUSD has 6 decimals, like USDC. */
export const TOKEN_DECIMALS = 6;
export const TOKEN_SYMBOL = "tUSD";

/** NEAR the Sputnik factory needs to create a committee's DAO. */
export const DAO_DEPOSIT_NEAR = 6;

export const EXPLORER = "https://testnet.nearblocks.io";
export const explorerAccount = (id: string) => `${EXPLORER}/address/${id}`;
export const explorerTx = (hash: string) => `${EXPLORER}/txns/${hash}`;

/** Gas in yocto-gas units. */
export const TGAS = 1_000_000_000_000n;

/** The always-running demo circle the agent keeps on round 2: named with this
 *  prefix, and told apart from visitors' fresh demo circles by its day-long rounds. */
export const LIVE_DEMO_PREFIX = "Live demo:";
export const LIVE_DEMO_ROUND_SECS = 86_400;

/** NEAR Social's data contract, where member profiles live. */
export const SOCIAL_DB = process.env.NEXT_PUBLIC_SOCIAL_DB ?? (NETWORK === "mainnet" ? "social.near" : "v1.social08.testnet");

/** Where the code lives. */
export const REPO_URL = "https://github.com/farazeool/Passpot";
