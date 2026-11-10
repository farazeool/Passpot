"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ProfileForm, readDraft } from "@/components/ProfileForm";
import type { Profile } from "@/lib/profile";
import { getProfile } from "@/lib/profile";
import { useTitle } from "@/lib/useTitle";
import { useWallet } from "@/lib/wallet";

/** /profile: make your profile first; connect a wallet only to save it. */
export default function MyProfile() {
  useTitle("Create your profile");
  const { accountId, actor, signIn } = useWallet();
  const router = useRouter();
  // undefined = still checking; null = nothing to resume
  const [draft, setDraft] = useState<Profile | null | undefined>(undefined);

  useEffect(() => {
    setDraft(readDraft());
  }, []);

  // Signed in with nothing to finish, and already has a profile: go to it.
  useEffect(() => {
    if (!accountId || draft === undefined) return;
    if (draft?.name) return;
    getProfile(accountId)
      .then((p) => {
        if (p?.name) router.replace(`/u/${accountId}`);
      })
      .catch(() => {});
  }, [accountId, draft, router]);

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-10 sm:py-14">
      <h1 className="font-display text-4xl sm:text-5xl font-semibold text-ink">
        {actor && draft?.name ? "One last step" : "Create your profile"}
      </h1>
      <p className="mt-3 text-lg text-text">
        {actor && draft?.name
          ? "Your wallet is connected. Save your profile and it's yours, on your NEAR account."
          : "This is how other members see you in every circle you join. It takes a minute."}
      </p>
      <div className="mt-8">
        {draft !== undefined && (
          <ProfileForm
            key={actor ? "with-wallet" : "draft"}
            actor={actor}
            initial={draft}
            first
            onConnect={signIn}
            onSaved={() => router.push(`/u/${actor!.accountId}`)}
          />
        )}
      </div>
      <p className="mt-6 text-sm text-muted">
        No NEAR account yet?{" "}
        <a className="link" href="https://testnet.mynearwallet.com/" target="_blank" rel="noreferrer">
          Make a free testnet one
        </a>{" "}
        or{" "}
        <Link href="/demo" className="link">
          try the demo first
        </Link>
        .
      </p>
    </div>
  );
}
