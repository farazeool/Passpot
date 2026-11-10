"use client";

import { useRef } from "react";

/**
 * A card that tilts toward the pointer in 3D, with a soft light following it.
 * Only on mouse/trackpad, and never when the person prefers reduced motion.
 */
export function Tilt({
  children,
  className = "",
  max = 7,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  max?: number;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  function move(e: React.PointerEvent) {
    if (e.pointerType !== "mouse") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      el.style.transform = `perspective(900px) rotateX(${(0.5 - y) * max}deg) rotateY(${(x - 0.5) * max}deg) translateY(-4px)`;
      el.style.setProperty("--gx", `${x * 100}%`);
      el.style.setProperty("--gy", `${y * 100}%`);
      el.style.setProperty("--glare", "1");
    });
  }

  function leave() {
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(frame.current);
    el.style.transform = "";
    el.style.setProperty("--glare", "0");
  }

  return (
    <div ref={ref} onPointerMove={move} onPointerLeave={leave} className={`tilt ${className}`} style={style}>
      {children}
      <span aria-hidden className="tilt-glare" />
    </div>
  );
}
