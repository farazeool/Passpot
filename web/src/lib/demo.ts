"use client";

import type { Actor } from "./actions";

export interface DemoInfo {
  enabled: boolean;
  members: string[];
  organizer: string | null;
  daoAvailable: boolean;
}

export async function getDemoInfo(): Promise<DemoInfo> {
  const res = await fetch("/api/demo", { cache: "no-store" });
  if (!res.ok) return { enabled: false, members: [], organizer: null, daoAvailable: false };
  return res.json();
}

/** A demo member, signed on our server. */
export function demoActor(accountId: string): Actor {
  return {
    accountId,
    kind: "demo",
    async call(receiverId, methodName, args, gasTgas, deposit) {
      const res = await fetch("/api/demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ as: accountId, receiverId, methodName, args, gasTgas, deposit: deposit.toString() }),
      });
      const body = await res.json().catch(() => ({ error: `Demo server error ${res.status}` }));
      if (!res.ok || body.error) throw new Error(body.error ?? `Demo server error ${res.status}`);
      return body;
    },
  };
}

const KEY = "circle.demo";

/** Committees created through the demo, newest first, remembered per browser. */
export function rememberDemoCommittee(id: number) {
  try {
    const ids: number[] = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    localStorage.setItem(KEY, JSON.stringify([id, ...ids.filter((x) => x !== id)].slice(0, 10)));
  } catch {}
}

export function isDemoCommittee(id: number, members: string[], demoMembers: string[]): boolean {
  return members.length > 0 && members.every((m) => demoMembers.includes(m));
}
