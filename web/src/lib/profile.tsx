"use client";

// Member profiles, stored on NEAR Social (SocialDB): the same profile a person
// has across NEAR apps. Passpot reads name, about, city and what they're saving for.
import { useEffect, useState } from "react";
import { NEAR, type Actor } from "./actions";
import { SOCIAL_DB } from "./config";
import { displayName } from "./format";
import { view } from "./near";

export type Gender = "male" | "female";

export interface Profile {
  gender?: Gender;
  name?: string;
  description?: string;
  location?: string;
  /** Passpot-specific: what this person is saving for. */
  saving_for?: string;
  image?: { url?: string; ipfs_cid?: string };
}

type Raw = Record<string, { profile?: Profile }>;

const cache = new Map<string, Profile | null>();
const listeners = new Set<() => void>();
let queue = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

function notify() {
  listeners.forEach((l) => l());
}

async function flush() {
  timer = null;
  const ids = [...queue];
  queue = new Set();
  if (!ids.length) return;
  try {
    const raw = await view<Raw>(SOCIAL_DB, "get", { keys: ids.map((id) => `${id}/profile/**`) });
    for (const id of ids) cache.set(id, raw?.[id]?.profile ?? null);
  } catch {
    for (const id of ids) if (!cache.has(id)) cache.set(id, null);
  }
  notify();
}

function request(id: string) {
  if (cache.has(id) || queue.has(id)) return;
  queue.add(id);
  if (!timer) timer = setTimeout(flush, 30);
}

/** Read one profile fresh from the chain (skips the cache). */
export async function getProfile(id: string): Promise<Profile | null> {
  const raw = await view<Raw>(SOCIAL_DB, "get", { keys: [`${id}/profile/**`] });
  const p = raw?.[id]?.profile ?? null;
  cache.set(id, p);
  notify();
  return p;
}

/** A profile, loaded in batches and shared across the page. undefined while loading. */
export function useProfile(id: string | null | undefined): Profile | null | undefined {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((x) => x + 1);
    listeners.add(l);
    if (id) request(id);
    return () => {
      listeners.delete(l);
    };
  }, [id]);
  return id ? cache.get(id) : null;
}

export function nameOf(id: string, p: Profile | null | undefined): string {
  return p?.name?.trim() || displayName(id);
}

/** The person's chosen name, or a readable fallback from their account. */
export function useName(id: string): string {
  return nameOf(id, useProfile(id));
}

export function Name({ id, first }: { id: string; first?: boolean }) {
  const n = useName(id);
  return <>{first ? n.split(" ")[0] : n}</>;
}

export function avatarUrl(p: Profile | null | undefined): string | null {
  if (p?.image?.url) return p.image.url;
  if (p?.image?.ipfs_cid) return `https://ipfs.near.social/ipfs/${p.image.ipfs_cid}`;
  return null;
}

/** Save to NEAR Social. The small deposit pays for the storage; unused storage stays yours. */
export async function saveProfile(a: Actor, p: Profile) {
  const clean = (s?: string) => (s ?? "").trim();
  const profile: Record<string, unknown> = {
    name: clean(p.name),
    description: clean(p.description),
    location: clean(p.location),
    saving_for: clean(p.saving_for),
    gender: p.gender ?? "",
    image: { url: clean(p.image?.url) },
  };
  await a.call(SOCIAL_DB, "set", { data: { [a.accountId]: { profile } } }, 100, NEAR / 10n);
  cache.delete(a.accountId);
  return getProfile(a.accountId);
}
