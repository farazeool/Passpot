"use client";

import { actionCreators } from "@near-js/transactions";
import type { WalletSelector } from "@near-wallet-selector/core";
import type { WalletSelectorModal } from "@near-wallet-selector/modal-ui";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Actor, CallResult } from "./actions";
import { CONTRACT, NETWORK, TGAS } from "./config";
import { readOutcome } from "./outcome";

interface WalletState {
  ready: boolean;
  accountId: string | null;
  signIn: () => void;
  signOut: () => Promise<void>;
  /** The signed-in person as an Actor, or null. */
  actor: Actor | null;
}

const WalletContext = createContext<WalletState>({
  ready: false,
  accountId: null,
  signIn: () => {},
  signOut: async () => {},
  actor: null,
});

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [selector, setSelector] = useState<WalletSelector | null>(null);
  const [modal, setModal] = useState<WalletSelectorModal | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      const [{ setupWalletSelector }, { setupModal }, myNear, meteor, here, intear] = await Promise.all([
        import("@near-wallet-selector/core"),
        import("@near-wallet-selector/modal-ui"),
        import("@near-wallet-selector/my-near-wallet"),
        import("@near-wallet-selector/meteor-wallet"),
        import("@near-wallet-selector/here-wallet"),
        import("@near-wallet-selector/intear-wallet"),
      ]);
      const s = await setupWalletSelector({
        network: NETWORK,
        modules: [
          myNear.setupMyNearWallet(),
          meteor.setupMeteorWallet(),
          intear.setupIntearWallet(),
          here.setupHereWallet(),
        ],
      });
      if (cancelled) return;
      const m = setupModal(s, {
        contractId: CONTRACT,
        theme: "auto",
        description: "Passpot uses your NEAR testnet account to join and pay into savings circles.",
      });
      const sync = () => {
        const active = s.store.getState().accounts.find((a) => a.active);
        setAccountId(active?.accountId ?? null);
      };
      sync();
      const sub = s.store.observable.subscribe(sync);
      unsubscribe = () => sub.unsubscribe();
      setSelector(s);
      setModal(m);
    })().catch((e) => console.error("Wallet setup failed", e));
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const signIn = useCallback(() => modal?.show(), [modal]);
  const signOut = useCallback(async () => {
    if (!selector) return;
    const w = await selector.wallet();
    await w.signOut();
  }, [selector]);

  const actor = useMemo<Actor | null>(() => {
    if (!selector || !accountId) return null;
    return {
      accountId,
      kind: "wallet",
      async call(receiverId, methodName, args, gasTgas, deposit): Promise<CallResult> {
        const w = await selector.wallet();
        const outcome = await w.signAndSendTransaction({
          signerId: accountId,
          receiverId,
          actions: [actionCreators.functionCall(methodName, args, BigInt(gasTgas) * TGAS, deposit)],
        });
        return readOutcome(outcome);
      },
    };
  }, [selector, accountId]);

  const value = useMemo(
    () => ({ ready: !!selector, accountId, signIn, signOut, actor }),
    [selector, accountId, signIn, signOut, actor],
  );
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export const useWallet = () => useContext(WalletContext);
