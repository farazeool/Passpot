"use client";

import { useEffect, useRef, useState } from "react";
import { TOKEN_SYMBOL } from "@/lib/config";
import { countdown, money } from "@/lib/format";
import { useName } from "@/lib/profile";
import { playCoin, playWin } from "@/lib/sound";
import type { Committee } from "@/lib/types";

// The scene: members sitting on a woven floor mat around a brass pot,
// the way committees actually meet. Seen from slightly above.
const W = 560;
const H = 440;
const CX = W / 2;
const CY = 236;
const MAT_RX = 214;
const MAT_RY = 122;
const SEAT_RX = 196;
const SEAT_RY = 112;

const SKIN = ["#8d5a3b", "#c68a5e", "#a86b45", "#e0ac80", "#6e4430", "#b97c55", "#d39a6a", "#7b4a32"];
const CLOTH = ["#22306b", "#2e7d5b", "#b8432f", "#6d4a8f", "#1f6f8b", "#8a5a2b", "#3d5a40", "#9c3d5e"];
const CUSHION = ["#d9c7a3", "#c9b28a", "#e3d2ad", "#cdb994"];
const DUPATTA = ["#d8577a", "#4aa3a2", "#e07a3f", "#9b7fd1", "#f2efe6", "#7fb069", "#c94f4f"];
const HAIR = ["#2b2420", "#3b2a20", "#1f1a17", "#4a3326"];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

interface Props {
  circle: Committee;
  /** When set, plays the draw: a light passes around the circle, then the coins go to the winner. */
  celebrate?: { accountId: string; key: string } | null;
  /** Plays sounds for payments and payouts (the committee page; not the hero). */
  sound?: boolean;
}

function Person({ seed, x, y, lit, empty, back }: { seed: string; x: number; y: number; lit: boolean; empty: boolean; back: boolean }) {
  const h = hash(seed);
  const skin = SKIN[h % SKIN.length];
  const cloth = CLOTH[(h >>> 3) % CLOTH.length];
  const style = (h >>> 6) % 3; // 0 dupatta, 1 cap, 2 short hair
  const cushion = CUSHION[(h >>> 9) % CUSHION.length];
  const scarf = DUPATTA[(h >>> 12) % DUPATTA.length];
  const hair = HAIR[(h >>> 15) % HAIR.length];
  if (empty) {
    return (
      <g transform={`translate(${x} ${y})`}>
        <ellipse cx="0" cy="2" rx="26" ry="9" fill="none" stroke="var(--ink-soft)" strokeWidth="1.2" strokeDasharray="3 4" />
        <text y="6" textAnchor="middle" fontSize="13" fill="var(--ink-soft)">
          +
        </text>
      </g>
    );
  }
  return (
    <g transform={`translate(${x} ${y}) scale(1.45)`}>
      {lit && <ellipse cx="0" cy="0" rx="36" ry="14" fill="var(--marigold)" opacity="0.55" />}
      <ellipse cx="0" cy="3" rx="27" ry="9" fill={cushion} />
      {/* crossed legs */}
      <ellipse cx="0" cy="-2" rx="22" ry="8" fill={cloth} />
      <ellipse cx="0" cy="-2" rx="22" ry="8" fill="#000" opacity="0.18" />
      {/* torso */}
      <path d="M -15 -4 C -16 -24 -10 -33 0 -33 C 10 -33 16 -24 15 -4 Z" fill={cloth} />
      {/* dupatta: falls behind the head onto the shoulders */}
      {style === 0 && (
        <path d="M -13 -42 C -14 -56 14 -56 13 -42 C 16 -30 19 -18 18 -6 L -18 -6 C -19 -18 -16 -30 -13 -42 Z" fill={scarf} />
      )}
      {/* head */}
      {/* Seen from behind when sitting at the front of the mat. */}
      <circle cx="0" cy="-42" r="10" fill={back ? (style === 0 ? scarf : hair) : skin} />
      {back && style === 1 && <path d="M -10 -45 C -10 -54 10 -54 10 -45 Z" fill="#f2efe6" stroke="#cfc8b5" strokeWidth="0.8" />}
      {!back && style === 0 && <path d="M -10.5 -44 C -10 -55 10 -55 10.5 -44 C 7 -49 -7 -49 -10.5 -44 Z" fill={scarf} />}
      {!back && style === 1 && <path d="M -10 -45 C -10 -54 10 -54 10 -45 Z" fill="#f2efe6" stroke="#cfc8b5" strokeWidth="0.8" />}
      {!back && style === 2 && <path d="M -10 -43 C -11 -54 11 -54 10 -43 C 6 -48 -6 -48 -10 -43 Z" fill={hair} />}
    </g>
  );
}

function Pot({ coins }: { coins: number }) {
  // Coins sit in stacks of up to five in front of the pot.
  const stacks: number[] = [];
  for (let left = coins; left > 0; left -= 5) stacks.push(Math.min(5, left));
  const at = (i: number) => (i % 2 === 0 ? 1 : -1) * (62 + Math.floor(i / 2) * 22);
  return (
    <g transform={`translate(${CX} ${CY})`}>
      <ellipse cx="0" cy="26" rx="54" ry="13" fill="#000" opacity="0.12" />
      {/* brass handi */}
      <path d="M -40 -6 C -46 22 -26 30 0 30 C 26 30 46 22 40 -6 C 36 -20 22 -26 0 -26 C -22 -26 -36 -20 -40 -6 Z" fill="#c8901c" />
      <path d="M -40 -6 C -46 22 -26 30 0 30 C 4 30 8 30 12 29 C -14 26 -32 16 -32 -4 C -32 -16 -24 -22 -16 -24 C -30 -22 -38 -16 -40 -6 Z" fill="#a8740f" />
      <path d="M -24 -16 C -18 -22 -6 -24 6 -23" stroke="#f6d27a" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.8" />
      <ellipse cx="0" cy="-26" rx="24" ry="7" fill="#e3a21a" />
      <ellipse cx="0" cy="-26" rx="17" ry="4.5" fill="#6b4a0c" />
      <ellipse cx="0" cy="-30" rx="27" ry="4" fill="none" stroke="#d99a16" strokeWidth="3" />
      {stacks.map((n, s) => (
        <g key={s} transform={`translate(${at(s)} 18)`}>
          {Array.from({ length: n }, (_, k) => (
            <g key={k} transform={`translate(0 ${-k * 4})`}>
              <ellipse cx="0" cy="0" rx="9" ry="4" fill="#b07d12" />
              <ellipse cx="0" cy="-1.5" rx="9" ry="4" fill="#f0b93a" stroke="#b07d12" strokeWidth="0.6" />
            </g>
          ))}
        </g>
      ))}
    </g>
  );
}

function Mat() {
  return (
    <g>
      <ellipse cx={CX} cy={CY + 8} rx={MAT_RX + 6} ry={MAT_RY + 6} fill="#000" opacity="0.06" />
      <ellipse cx={CX} cy={CY} rx={MAT_RX} ry={MAT_RY} fill="#8c3a32" />
      <ellipse cx={CX} cy={CY} rx={MAT_RX - 10} ry={MAT_RY - 7} fill="none" stroke="#e8c27a" strokeWidth="2" strokeDasharray="10 6" />
      <ellipse cx={CX} cy={CY} rx={MAT_RX - 22} ry={MAT_RY - 14} fill="#a44a3e" />
      <ellipse cx={CX} cy={CY} rx={MAT_RX - 60} ry={MAT_RY - 36} fill="none" stroke="#e8c27a" strokeWidth="1.5" opacity="0.7" />
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * Math.PI * 2;
        const x = CX + Math.cos(a) * (MAT_RX - 40);
        const y = CY + Math.sin(a) * (MAT_RY - 24);
        return <path key={i} d={`M ${x} ${y - 5} L ${x + 5} ${y} L ${x} ${y + 5} L ${x - 5} ${y} Z`} fill="#e8c27a" opacity="0.75" />;
      })}
      <ellipse cx={CX} cy={CY} rx={MAT_RX - 96} ry={MAT_RY - 58} fill="#8c3a32" />
    </g>
  );
}

/**
 * The circle: members around the mat, the pot in the middle.
 * A green tick = paid this round. A gold coin badge = has received the pot.
 */
export function Circle({ circle: c, celebrate, sound = false }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [phase, setPhase] = useState<"idle" | "drawing" | "passing">("idle");
  const [flicker, setFlicker] = useState(-1);
  const paidCount = c.members.filter((m) => m.paid_this_round).length;
  const lastPaid = useRef(paidCount);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (sound && paidCount > lastPaid.current) playCoin();
    lastPaid.current = paidCount;
  }, [paidCount, sound]);

  const n = Math.max(c.size, c.members.length, 2);
  // Seat 0 sits at the front; the rest go around the mat.
  const seats = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + Math.PI / 2;
    return { x: CX + Math.cos(a) * SEAT_RX, y: CY + Math.sin(a) * SEAT_RY, angle: a, member: c.members[i], index: i };
  });
  const winnerIndex = celebrate ? c.members.findIndex((m) => m.account_id === celebrate.accountId) : -1;

  useEffect(() => {
    if (!celebrate || winnerIndex < 0) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setPhase("passing");
      if (sound) playWin();
      return;
    }
    setPhase("drawing");
    let step = 0;
    const steps = 2 * c.members.length + winnerIndex;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setFlicker(step % c.members.length);
      step++;
      if (step <= steps) timer = setTimeout(tick, 80 + step * 14);
      else {
        setFlicker(-1);
        setPhase("passing");
        if (sound) playWin();
        timer = setTimeout(() => setPhase("idle"), 2200);
      }
    };
    timer = setTimeout(tick, 60);
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
  // Back row first, so people in front overlap the ones behind.
  const order = [...seats].sort((a, b) => a.y - b.y);
  const coins = c.status === "Running" ? paidCount : c.status === "Open" ? 0 : 0;

  return (
    <figure className="w-full max-w-[640px] mx-auto" aria-label={`${c.name}: ${centerTitle}, pot ${money(c.pot)} ${TOKEN_SYMBOL}`}>
      <svg viewBox={`-60 0 ${W + 120} ${H}`} className="w-full h-auto overflow-visible" role="img">
        <title>{`${c.name}: ${centerTitle}`}</title>
        <Mat />

        {/* Back half of the circle sits behind the pot. */}
        {order
          .filter((s) => s.y < CY)
          .map((s) => (
            <Seat key={s.index} s={s} c={c} lit={phase === "drawing" && s.index === flicker} won={phase === "passing" && s.index === winnerIndex} />
          ))}
        <Pot coins={phase === "passing" ? 0 : coins} />
        {order
          .filter((s) => s.y >= CY)
          .map((s) => (
            <Seat key={s.index} s={s} c={c} lit={phase === "drawing" && s.index === flicker} won={phase === "passing" && s.index === winnerIndex} />
          ))}

        {/* The pot's coins travel to the winner. */}
        {phase === "passing" && winnerSeat && (
          <g key={celebrate?.key}>
            {[0, 1, 2, 3, 4].map((k) => (
              <ellipse key={k} rx="9" ry="4" fill="#f0b93a" stroke="#b07d12" strokeWidth="0.8">
                <animate attributeName="cx" from={CX + (k - 2) * 8} to={winnerSeat.x} dur="0.75s" begin={`${k * 0.07}s`} fill="freeze" />
                <animate attributeName="cy" values={`${CY + 30};${(CY + winnerSeat.y) / 2 - 60};${winnerSeat.y - 20}`} dur="0.75s" begin={`${k * 0.07}s`} fill="freeze" />
                <animate attributeName="opacity" values="1;1;0" keyTimes="0;0.85;1" dur="1.2s" begin={`${k * 0.07}s`} fill="freeze" />
              </ellipse>
            ))}
          </g>
        )}

        {seats.map((s) => (
          <SeatLabel key={`l${s.index}`} s={s} />
        ))}

        {/* Pot amount */}
        <g transform={`translate(${CX} ${CY - 70})`}>
          <rect x="-58" y="-19" width="116" height="34" rx="17" fill="var(--sheet)" stroke="var(--marigold)" strokeWidth="1.5" />
          <text y="5" textAnchor="middle" className="font-display num" fontSize="17" fontWeight="600" fill="var(--ink)">
            {money(c.pot)} {TOKEN_SYMBOL}
          </text>
        </g>
      </svg>
      <figcaption className="text-center -mt-1">
        <div className="font-display text-lg font-semibold text-ink">{centerTitle}</div>
        <div className="text-sm text-muted num" aria-live="polite">
          {centerSub}
        </div>
      </figcaption>
    </figure>
  );
}

function Seat({
  s,
  c,
  lit,
  won,
}: {
  s: { x: number; y: number; member: Committee["members"][number] | undefined; index: number };
  c: Committee;
  lit: boolean;
  won: boolean;
}) {
  const m = s.member;
  const received = m?.paid_out_round != null;
  const paid = !!m?.paid_this_round && c.status === "Running";
  const front = s.y >= CY;
  return (
    <g>
      <Person seed={m?.account_id ?? `seat-${s.index}`} x={s.x} y={s.y} lit={lit || won} empty={!m} back={front} />
      {paid && (
        <g transform={`translate(${s.x + 24} ${s.y - 66})`}>
          <title>Paid this round</title>
          <circle r="8" fill="var(--paid)" stroke="var(--sheet)" strokeWidth="1.5" />
          <path d="M -3.5 0 L -1 2.6 L 3.6 -2.4" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
      {received && (
        <g transform={`translate(${s.x - 24} ${s.y - 66})`}>
          <title>{`Received the pot in round ${m!.paid_out_round}`}</title>
          <circle r="8" fill="#f0b93a" stroke="#b07d12" strokeWidth="1.2" />
          <text y="3.5" textAnchor="middle" fontSize="9" fontWeight="700" fill="#5a3d05">
            {m!.paid_out_round}
          </text>
        </g>
      )}
    </g>
  );
}

/** Names go on top of everything, with a paper halo so the mat never hides them. */
function SeatLabel({ s }: { s: { x: number; y: number; member: Committee["members"][number] | undefined } }) {
  const m = s.member;
  const named = useName(m?.account_id ?? "");
  const label = m ? named.split(" ")[0] : "Open seat";
  const front = s.y >= CY;
  const side = Math.abs(s.x - CX) > SEAT_RX * 0.8;
  const right = s.x > CX;
  // Side seats: name outside the mat, level with the person. Front: below. Back: above.
  const x = side ? s.x + (right ? 42 : -42) : s.x;
  const y = side ? s.y - 18 : front ? s.y + 34 : s.y - 84;
  return (
    <text
      x={x}
      y={y}
      textAnchor={side ? (right ? "start" : "end") : "middle"}
      fontSize="18"
      fontWeight={m ? 600 : 400}
      fill={m ? "var(--text)" : "var(--muted)"}
      stroke="var(--paper)"
      strokeWidth="4"
      paintOrder="stroke"
      strokeLinejoin="round"
    >
      {label}
    </text>
  );
}
