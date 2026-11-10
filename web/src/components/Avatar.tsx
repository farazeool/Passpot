"use client";

import { useState } from "react";
import { avatarUrl, nameOf, useProfile } from "@/lib/profile";

const HUES = [28, 160, 210, 265, 330, 95, 190, 5];

function hue(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length];
}

/** The person's photo if they set one, else their initials on a colour that's always theirs. */
export function Avatar({ id, size = 40, className = "" }: { id: string; size?: number; className?: string }) {
  const p = useProfile(id);
  const url = avatarUrl(p);
  const [broken, setBroken] = useState(false);
  const name = nameOf(id, p);
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  const h = hue(id);
  const style = { width: size, height: size, fontSize: size * 0.38 };
  if (url && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt=""
        onError={() => setBroken(true)}
        className={`rounded-full object-cover shrink-0 border border-rule ${className}`}
        style={style}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`rounded-full shrink-0 inline-flex items-center justify-center font-semibold select-none ${className}`}
      style={{ ...style, background: `hsl(${h} 70% 88%)`, color: `hsl(${h} 55% 26%)` }}
    >
      {initials}
    </span>
  );
}
