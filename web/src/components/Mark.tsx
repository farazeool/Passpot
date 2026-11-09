/** Logo: members around a circle, one holding the pot. */
export function Mark({ size = 28 }: { size?: number }) {
  const dots = Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    return { x: 16 + Math.cos(a) * 11, y: 16 + Math.sin(a) * 11, pot: i === 0 };
  });
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="11" fill="none" stroke="var(--ink)" strokeWidth="1.5" />
      {dots.map((d, i) => (
        <circle
          key={i}
          cx={d.x}
          cy={d.y}
          r={d.pot ? 4.2 : 2.6}
          fill={d.pot ? "var(--marigold)" : "var(--ink)"}
          stroke={d.pot ? "var(--paper)" : "none"}
          strokeWidth={d.pot ? 1.5 : 0}
        />
      ))}
    </svg>
  );
}
