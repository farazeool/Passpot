"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useTitle } from "@/lib/useTitle";
import { useWallet } from "@/lib/wallet";

/** /profile: your own profile, or a prompt to connect first. */
export default function MyProfile() {
  useTitle("Your profile");
  const { accountId, signIn, ready } = useWallet();
  const router = useRouter();

  useEffect(() => {
    if (accountId) router.replace(`/u/${accountId}`);
  }, [accountId, router]);

  return (
    <div className="mx-auto max-w-xl px-4 sm:px-6 py-16 sm:py-24 text-center">
      <h1 className="font-display text-4xl sm:text-5xl font-semibold text-ink">Your profile</h1>
      <p className="mt-4 text-lg text-text">
        Connect a NEAR wallet to make your profile. Your name, city and what you&apos;re saving for show up next to
        you in every circle, along with a savings record nobody can edit.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button className="btn btn-primary" onClick={signIn} disabled={!ready || !!accountId}>
          {accountId ? "Opening…" : "Connect wallet"}
        </button>
        <Link href="/demo" className="btn btn-quiet">
          Try the demo first
        </Link>
      </div>
      <p className="mt-6 text-sm text-muted">
        No wallet yet? <a className="link" href="https://testnet.mynearwallet.com/" target="_blank" rel="noreferrer">Create a free testnet account</a> in a minute.
      </p>
    </div>
  );
}
