"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const KEY = "rota.theme";

/** Runs before first paint (inlined in <head>) so the page never flashes the wrong theme. */
export const themeScript = `(function(){try{var t=localStorage.getItem("${KEY}");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){}})();`;

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme((document.documentElement.dataset.theme as Theme) ?? "light");
    // Follow the system while the person hasn't chosen.
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      try {
        if (localStorage.getItem(KEY)) return;
      } catch {}
      apply(mq.matches ? "dark" : "light", false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function apply(next: Theme, remember = true) {
    const root = document.documentElement;
    root.classList.add("theme-switching");
    root.dataset.theme = next;
    setTheme(next);
    window.setTimeout(() => root.classList.remove("theme-switching"), 260);
    if (remember) {
      try {
        localStorage.setItem(KEY, next);
      } catch {}
    }
  }

  const dark = theme === "dark";
  return (
    <button
      type="button"
      className="btn btn-ghost !min-h-[38px] !w-[38px] !p-0"
      onClick={() => apply(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Light theme" : "Dark theme"}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        {dark ? (
          <>
            <circle cx="12" cy="12" r="4.2" />
            {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
              <line key={a} x1="12" y1="2.8" x2="12" y2="5" transform={`rotate(${a} 12 12)`} />
            ))}
          </>
        ) : (
          <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
        )}
      </svg>
    </button>
  );
}
