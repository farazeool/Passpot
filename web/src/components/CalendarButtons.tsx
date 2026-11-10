"use client";

import { canRemind, downloadIcs, googleLink } from "@/lib/calendar";
import type { Committee } from "@/lib/types";

/** "Add every payment to my calendar", for members of a running circle. */
export function CalendarButtons({ circle: c, unpaid, compact }: { circle: Committee; unpaid: boolean; compact?: boolean }) {
  if (!canRemind(c)) return null;
  const url = typeof window !== "undefined" ? `${window.location.origin}/c/${c.id}` : "";
  const google = googleLink(c, url, unpaid);
  if (!google) return null;
  const icon = (
    <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4">
      <rect x="3" y="4.5" width="14" height="12" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 8.5h14M7 3v3M13 3v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
  return (
    <div className={compact ? "flex flex-wrap gap-2" : "card p-5 sm:p-6"}>
      {!compact && (
        <>
          <h2 className="font-display text-xl font-semibold text-ink">Never miss a payment</h2>
          <p className="mt-1 text-text">
            Add every remaining due date to your calendar, with a reminder before each one.
          </p>
        </>
      )}
      <div className={compact ? "contents" : "mt-4 flex flex-wrap gap-2"}>
        <a className={`btn btn-quiet ${compact ? "btn-sm" : ""}`} href={google} target="_blank" rel="noreferrer">
          {icon}
          Google Calendar
        </a>
        <button className={`btn btn-quiet ${compact ? "btn-sm" : ""}`} onClick={() => downloadIcs(c, url, unpaid)}>
          {icon}
          Apple / Outlook
        </button>
      </div>
    </div>
  );
}
