import { ImageResponse } from "next/og";

// The card people see when a Passpot link is shared on X or WhatsApp.
export const alt = "Passpot: the savings circle nobody can run off with";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  const seats = Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    return { x: 210 + Math.cos(a) * 150, y: 210 + Math.sin(a) * 150, pot: i === 0 };
  });
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#000000", color: "#fff", padding: 72, alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingRight: 40 }}>
          <div style={{ fontSize: 34, fontWeight: 700, color: "#f0b23a", marginBottom: 28 }}>Passpot</div>
          <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.04, letterSpacing: -2 }}>The savings circle nobody can run off with.</div>
          <div style={{ fontSize: 28, marginTop: 28, color: "#a1a1a6", lineHeight: 1.35 }}>
            Committee, susu, tanda, chama, hui. On NEAR, with the pot in a DAO no one controls.
          </div>
        </div>
        <div style={{ width: 420, height: 420, position: "relative", display: "flex" }}>
          <div style={{ position: "absolute", left: 60, top: 60, width: 300, height: 300, borderRadius: 300, border: "3px dashed rgba(255,255,255,0.35)" }} />
          <div style={{ position: "absolute", left: 140, top: 140, width: 140, height: 140, borderRadius: 140, background: "#e3a21a" }} />
          {seats.map((s, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: s.x - 28,
                top: s.y - 28,
                width: 56,
                height: 56,
                borderRadius: 56,
                background: s.pot ? "#e3a21a" : "#f5f6f2",
                border: "4px solid #000000",
              }}
            />
          ))}
        </div>
      </div>
    ),
    size,
  );
}
