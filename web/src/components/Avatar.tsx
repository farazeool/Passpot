"use client";

import { useState } from "react";
import { avatarUrl, useProfile, type Gender } from "@/lib/profile";

const SKIN = ["#f1c7a3", "#e0a97e", "#c68a5e", "#a86c45", "#7d4b2c"];
const HAIR = ["#1d1611", "#3a2618", "#5a3a22", "#2b2b2b"];
const SHIRT = ["#3b6fd8", "#1f8a5b", "#c2412d", "#7a4fd0", "#d4940d", "#16838f"];
const BG = ["#e8eefc", "#e6f4ec", "#fbe9e5", "#efe8fb", "#fdf4e1", "#e2f4f5"];

function seed(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/** An illustrated person: a man, a woman, or a plain silhouette until they choose. */
export function Person({ id, gender, size = 40, className = "" }: { id: string; gender?: Gender; size?: number; className?: string }) {
  const h = seed(id || "rota");
  const skin = SKIN[h % SKIN.length];
  const hair = HAIR[(h >>> 3) % HAIR.length];
  const shirt = SHIRT[(h >>> 5) % SHIRT.length];
  const bg = BG[(h >>> 5) % BG.length];

  if (gender !== "male" && gender !== "female") {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className={`shrink-0 rounded-full ${className}`}>
        <circle cx="32" cy="32" r="32" fill="var(--rule)" />
        <circle cx="32" cy="25" r="11" fill="var(--muted)" opacity="0.75" />
        <path d="M10 60c2-12 11-18 22-18s20 6 22 18" fill="var(--muted)" opacity="0.75" />
      </svg>
    );
  }

  const female = gender === "female";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className={`shrink-0 rounded-full ${className}`}>
      <defs>
        <clipPath id={`av-${h}-${gender}`}>
          <circle cx="32" cy="32" r="32" />
        </clipPath>
      </defs>
      <g clipPath={`url(#av-${h}-${gender})`}>
        <rect width="64" height="64" fill={bg} />
        {/* long hair falls behind the shoulders */}
        {female && <path d="M17 26c0-10 7-16 15-16s15 6 15 16v20c0 4-3 6-7 6H24c-4 0-7-2-7-6z" fill={hair} />}
        {/* shoulders */}
        <path d="M8 66c1-12 10-19 24-19s23 7 24 19z" fill={shirt} />
        {/* neck */}
        <path d="M27 40h10v8c0 3-2 5-5 5s-5-2-5-5z" fill={skin} />
        <path d="M27 44c3 2 7 2 10 0v-3H27z" fill="#000" opacity="0.08" />
        {/* head */}
        <ellipse cx="32" cy="28" rx="11" ry="12.5" fill={skin} />
        <ellipse cx="21" cy="29" rx="2" ry="3" fill={skin} />
        <ellipse cx="43" cy="29" rx="2" ry="3" fill={skin} />
        {/* hair on top */}
        {female ? (
          <path d="M20.5 27c0-9 5-13.5 11.5-13.5S43.5 18 43.5 27c-3-1-7-4-9-8-3 4-8 7-14 8z" fill={hair} />
        ) : (
          <path d="M20.5 26c-.5-8 4-12.5 11.5-12.5S44 18 43.5 26c-1-3-2.5-5-4-6-4 2-10 2-15 0-1.5 1-3 3-4 6z" fill={hair} />
        )}
        {/* face */}
        <circle cx="28" cy="29" r="1.1" fill="#2a1d14" />
        <circle cx="36" cy="29" r="1.1" fill="#2a1d14" />
        <path d="M29 34c1.8 1.4 4.2 1.4 6 0" stroke="#2a1d14" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/** A member's avatar: their photo if they set one, else the illustrated person. */
export function Avatar({ id, size = 40, className = "" }: { id: string; size?: number; className?: string }) {
  const p = useProfile(id);
  const url = avatarUrl(p);
  const [broken, setBroken] = useState(false);
  if (url && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt=""
        onError={() => setBroken(true)}
        className={`rounded-full object-cover shrink-0 border border-rule ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return <Person id={id} gender={p?.gender} size={size} className={className} />;
}
