"use client";

import { useEffect, useState } from "react";
import { setSound, soundOn, unlockSoundOnFirstClick } from "@/lib/sound";

export function SoundToggle() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    setOn(soundOn());
    unlockSoundOnFirstClick();
    const sync = () => setOn(soundOn());
    window.addEventListener("rota-sound", sync);
    return () => window.removeEventListener("rota-sound", sync);
  }, []);
  return (
    <button className="btn btn-quiet" aria-pressed={!on} onClick={() => setSound(!on)}>
      {on ? "Mute sounds" : "Sounds off"}
    </button>
  );
}
