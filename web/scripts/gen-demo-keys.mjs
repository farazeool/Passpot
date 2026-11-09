// Creates key pairs for the three demo members and writes them to .env.local
// (never committed). Prints the public keys for scripts/setup-demo.ps1.
// Usage (from the web folder): node scripts/gen-demo-keys.mjs fatneek-committee.testnet
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { KeyPair } from "near-api-js";

const parent = process.argv[2];
if (!parent) {
  console.error("Usage: node scripts/gen-demo-keys.mjs <your-account.testnet>");
  process.exit(1);
}
const envPath = ".env.local";
const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
let accounts;
const m = existing.match(/^DEMO_ACCOUNTS='(.*)'$/m);
if (m) {
  accounts = JSON.parse(m[1]);
} else {
  accounts = ["ayesha", "bilal", "sara"].map((name) => {
    const kp = KeyPair.fromRandom("ed25519");
    return { id: `${name}-demo.${parent}`, key: kp.toString() };
  });
  const lines = existing.split("\n").filter((l) => l && !l.startsWith("DEMO_ACCOUNTS="));
  lines.push(`DEMO_ACCOUNTS='${JSON.stringify(accounts)}'`);
  writeFileSync(envPath, lines.join("\n") + "\n");
}
const out = accounts.map((a) => ({ id: a.id, publicKey: KeyPair.fromString(a.key).getPublicKey().toString() }));
console.log(JSON.stringify(out));
