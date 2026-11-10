"use client";

// Tiny synthesized sounds (no audio files): a coin clink when someone pays,
// a rising chime when the pot goes out. Off when the person mutes it.

const KEY = "rota.sound";
let ctx: AudioContext | null = null;

export function soundOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSound(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {}
  window.dispatchEvent(new Event("rota-sound"));
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

/** Browsers only allow sound after a click; warm the audio up on the first one. */
export function unlockSoundOnFirstClick() {
  if (typeof window === "undefined") return;
  const unlock = () => {
    audio();
    window.removeEventListener("pointerdown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
}

function ping(a: AudioContext, freq: number, at: number, length = 0.18, volume = 0.12) {
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, a.currentTime + at);
  gain.gain.setValueAtTime(0, a.currentTime + at);
  gain.gain.linearRampToValueAtTime(volume, a.currentTime + at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + at + length);
  osc.connect(gain).connect(a.destination);
  osc.start(a.currentTime + at);
  osc.stop(a.currentTime + at + length + 0.05);
}

export function playCoin() {
  if (!soundOn()) return;
  const a = audio();
  if (!a) return;
  ping(a, 1760, 0, 0.12, 0.08);
  ping(a, 2350, 0.06, 0.16, 0.06);
}

export function playWin() {
  if (!soundOn()) return;
  const a = audio();
  if (!a) return;
  [523, 659, 784, 1047].forEach((f, i) => ping(a, f, i * 0.09, 0.35, 0.09));
}
