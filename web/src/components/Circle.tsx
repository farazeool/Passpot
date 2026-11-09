"use client";

import { useEffect, useState } from "react";
import { TOKEN_SYMBOL } from "@/lib/config";
import { countdown, displayName, money } from "@/lib/format";
import type { Committee } from "@/lib/types";

const SIZE = 420;
const C = SIZE / 2;
const R = 150;

interface Props {
  committee: Committee;
  /** When set, plays the draw: flicker across the waiting members, then pass the pot. */
  celebrate?: { accountId: string; key: string } | null;
}

/**
 * The committee as a circle: members around the ring, the pot in the middle.
 * Marigold = has received the pot. Green ring = paid this round.
 */
export function Circle({ committee: c, celebrate }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [phase, setPhase] = useState<"idle" | "drawing" | "passing">("idle");
  const [flicker, setFlicker] = useState(-1);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const n = Math.max(c.size, c.members.length, 2);
  const seats = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x: C + Math.cos(a) * R, y: C + Math.sin(a) * R, angle: a, member: c.members[i] };
  });
  const winnerIndex = celebrate ? c.members.findIndex((m) => m.account_id === celebrate.accountId) : -1;

  useEffect(() => {
    if (!celebrate || winnerIndex < 0) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setPhase("passing");
      return;
    }
    setPhase("drawing");
    let step = 0;
    const steps = 14 + winnerIndex;
    const tick = () => {
      setFlicker(step % c.members.length);
      step++;
      if (step <= steps) timer = setTimeout(tick, 70 + step * 9);
      else {
        setFlicker(-1);
        setPhase("passing");
      }
    };
    let timer = setTimeout(tick, 60);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebrate?.key]);

  const remaining = c.round_ends_ms - now;
  const centerTitle =
    c.status === "Open"
      ? `${c.members.length} of ${c.size} joined`
      : c.status === "Finished"
        ? "Every member has had the pot"
        : `Round ${c.round} of ${c.size}`;
  const centerSub =
    c.status === "Running"
      ? c.can_advance || remaining <= 0
        ? "Ready to pay out"
        : `Closes in ${countdown(remaining)}`
      : c.status === "Open"
        ? "Waiting for members"
        : "Finished";

  const winnerSeat = winnerIndex >= 0 ? seats[winnerIndex] : null;

  return (
    <figure className="w-full max-w-[420px] mx-auto" aria-label={`${c.name}: ${centerTitle}, pot ${money(c.pot)} ${TOKEN_SYMBOL}`}>
      <svg viewBox={`-40 -10 ${SIZE + 80} ${SIZE + 20}`} className="w-full h-auto overflow-visible" role="img">
        <title>{`${c.name} — ${centerTitle}`}</title>
        <circle cx={C} cy={C} r={R} fill="none" stroke="var(--rule-strong)" strokeWidth="1.5" strokeDasharray="2 6" />

        {/* The pot */}
        <circle cx={C} cy={C} r={74} fill="var(--marigold-wash)" stroke="var(--marigold)" strokeWidth="2" />
        <text x={C} y={C - 16} textAnchor="middle" className="font-display" fontSize="13" fill="var(--muted)">
          Pot
        </text>
        <text x={C} y={C + 14} textAnchor="middle" className="font-display num" fontSize="30" fontWeight="600" fill="var(--ink)">
          {money(c.pot)}
        </text>
        <text x={C} y={C + 34} textAnchor="middle" fontSize="12" fill="var(--muted)">
          {TOKEN_SYMBOL}
        </text>

        {seats.map((s, i) => {
          const m = s.member;
          const received = m?.paid_out_round != null;
          const isWinner = phase === "passing" && i === winnerIndex;
          const lit = phase === "drawing" && i === flicker;
          const paid = m?.paid_this_round;
          const label = m ? displayName(m.account_id) : "Open seat";
          // Labels sit outside the ring: above the top seat, below the bottom ones, beside the rest.
          const cos = Math.cos(s.angle);
          const sin = Math.sin(s.angle);
          const anchor = Math.abs(cos) < 0.35 ? "middle" : cos > 0 ? "start" : "end";
          const lx = s.x + (anchor === "middle" ? 0 : cos > 0 ? 34 : -34);
          const ly = anchor !== "middle" ? s.y + 5 : sin < 0 ? s.y - 52 : s.y + 46;
          return (
            <g key={i}>
              {paid && c.status === "Running" && (
                <circle cx={s.x} cy={s.y} r={30} fill="none" stroke="var(--paid)" strokeWidth="3" />
              )}
              <circle
                cx={s.x}
                cy={s.y}
                r={24}
                fill={!m ? "var(--paper)" : received || isWinner || lit ? "var(--marigold)" : "var(--sheet)"}
                stroke={!m ? "var(--rule-strong)" : "var(--ink)"}
                strokeWidth={m ? 1.5 : 1}
                strokeDasharray={m ? undefined : "3 4"}
                style={{ transition: "fill 120ms" }}
              />
              <text
                x={s.x}
                y={s.y + 6}
                textAnchor="middle"
                className="font-display"
                fontSize="17"
                fontWeight="600"
                fill={!m ? "var(--muted)" : "var(--ink)"}
              >
                {m ? label.charAt(0) : "+"}
              </text>
              <text
                x={lx}
                y={ly}
                textAnchor={anchor}
                fontSize="13"
                fontWeight={m ? 600 : 400}
                fill={m ? "var(--text)" : "var(--muted)"}
              >
                {label}
              </text>
              {received && (
                <text x={lx} y={ly + 15} textAnchor={anchor} fontSize="11" fill="var(--muted)">
                  Pot in round {m!.paid_out_round}
                </text>
              )}
            </g>
          );
        })}

        {/* One orchestrated moment: the pot travels to the winner. */}
        {phase === "passing" && winnerSeat && (
          <circle key={celebrate?.key} r={12} fill="var(--marigold)" stroke="var(--ink)" strokeWidth="1.5">
            <animate attributeName="cx" from={C} to={winnerSeat.x} dur="0.7s" fill="freeze" />
            <animate attributeName="cy" from={C} to={winnerSeat.y} dur="0.7s" fill="freeze" />
            <animate attributeName="opacity" values="1;1;0" keyTimes="0;0.8;1" dur="1.1s" fill="freeze" />
          </circle>
        )}
      </svg>
      <figcaption className="text-center -mt-2">
        <div className="font-display text-lg font-semibold text-ink">{centerTitle}</div>
        <div className="text-sm text-muted num" aria-live="polite">
          {centerSub}
        </div>
      </figcaption>
    </figure>
  );
}
