/**
 * Background chiptune loop. Slow Aeolian arpeggio progression
 * (i — VI — III — VII in A minor — the "Dearly Beloved" cadence)
 * played as triangle/sine voices at very low volume so it sits under
 * SFX as ambient texture rather than music you'd consciously listen to.
 *
 * Auto-starts on the first user interaction (browsers gate AudioContext
 * on a user gesture). Pauses when the window is hidden. Respects the
 * existing mute toggle from sounds.ts.
 */

import { isMuted } from "./sounds";

type ChordSpec = {
  // Root frequency (Hz) — bass octave.
  bass: number;
  // Arpeggio frequencies, played sequentially across the bar.
  arp: number[];
  // Pad chord (sustained sine triad).
  pad: number[];
};

// Frequencies (equal-temperament, A4=440).
const F = {
  A2: 110,    A3: 220,    A4: 440,
  C3: 130.81, C4: 261.63, C5: 523.25,
  E3: 164.81, E4: 329.63, E5: 659.25,
  F3: 174.61, F4: 349.23, F5: 698.46,
  G3: 196,    G4: 392,    G5: 783.99,
  D4: 293.66, D5: 587.33,
  B4: 493.88,
};

// i — VI — III — VII in A minor (Am — F — C — G).
const PROGRESSION: ChordSpec[] = [
  // Am: A C E
  { bass: F.A2, arp: [F.A4, F.C5, F.E5, F.C5], pad: [F.A3, F.C4, F.E4] },
  // F:  F A C
  { bass: F.F3, arp: [F.F4, F.A4, F.C5, F.A4], pad: [F.F3, F.A3, F.C4] },
  // C:  C E G
  { bass: F.C3, arp: [F.C5, F.E5, F.G5, F.E5], pad: [F.C4, F.E4, F.G4] },
  // G:  G B D
  { bass: F.G3, arp: [F.G4, F.B4, F.D5, F.B4], pad: [F.G3, F.B4, F.D4] },
];

const BAR_SECONDS = 2.4;            // slow ballad pulse, ~100 BPM
const NOTES_PER_BAR = 4;            // arpeggio = 4 eighth-notes per chord
const SCHEDULE_AHEAD_S = 1.5;       // schedule 1.5s ahead, tick every 0.5s
const TICK_MS = 500;
const MASTER_GAIN = 0.055;          // ambient — sits well under SFX

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let nextBarTime = 0;                // audio-context time for next bar onset
let chordIndex = 0;                 // current position in PROGRESSION
let tickHandle: ReturnType<typeof setInterval> | null = null;
let started = false;

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      const C = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!C) return null;
      ctx = new C();
      masterGain = ctx.createGain();
      masterGain.gain.value = MASTER_GAIN;
      masterGain.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function scheduleNote(
  freq: number,
  start: number,
  duration: number,
  type: OscillatorType,
  peak: number
) {
  if (!ctx || !masterGain) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const attack = 0.01;
  const release = Math.min(0.25, duration * 0.5);
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(peak, start + attack);
  g.gain.setValueAtTime(peak, start + duration - release);
  g.gain.linearRampToValueAtTime(0, start + duration);
  osc.connect(g);
  g.connect(masterGain);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

function scheduleBar(chord: ChordSpec, barStart: number) {
  // Bass on beats 1 and 3.
  scheduleNote(chord.bass, barStart, BAR_SECONDS / 2 - 0.05, "triangle", 0.55);
  scheduleNote(chord.bass, barStart + BAR_SECONDS / 2, BAR_SECONDS / 2 - 0.05, "triangle", 0.5);
  // Arpeggio across the bar.
  const noteDur = BAR_SECONDS / NOTES_PER_BAR - 0.04;
  for (let i = 0; i < NOTES_PER_BAR; i++) {
    const t = barStart + i * (BAR_SECONDS / NOTES_PER_BAR);
    scheduleNote(chord.arp[i], t, noteDur, "sine", 0.32);
  }
  // Sustained pad triad — quiet, full bar.
  for (const f of chord.pad) {
    scheduleNote(f, barStart, BAR_SECONDS - 0.04, "sine", 0.08);
  }
}

function tick() {
  if (!ctx || !masterGain) return;
  // If muted, fade master to 0 (audible feedback when toggling); when
  // un-muted, fade back. We still schedule notes so resume is seamless.
  const target = isMuted() ? 0 : MASTER_GAIN;
  const now = ctx.currentTime;
  masterGain.gain.cancelScheduledValues(now);
  masterGain.gain.linearRampToValueAtTime(target, now + 0.1);

  // Schedule any bars that fall within the lookahead window.
  while (nextBarTime < now + SCHEDULE_AHEAD_S) {
    const chord = PROGRESSION[chordIndex % PROGRESSION.length];
    scheduleBar(chord, nextBarTime);
    nextBarTime += BAR_SECONDS;
    chordIndex++;
  }
}

export function startMusic() {
  if (started) return;
  const c = ensureCtx();
  if (!c) return;
  started = true;
  nextBarTime = c.currentTime + 0.2;
  chordIndex = 0;
  tick();
  tickHandle = setInterval(tick, TICK_MS);
}

export function stopMusic() {
  if (tickHandle) clearInterval(tickHandle);
  tickHandle = null;
  started = false;
  if (masterGain && ctx) {
    const now = ctx.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.linearRampToValueAtTime(0, now + 0.2);
  }
}

/**
 * Hook the loop into the document lifecycle: start on first user
 * gesture (required by browser autoplay policies), pause when the tab
 * is hidden to save CPU.
 */
export function attachMusicLoop() {
  if (typeof window === "undefined") return;
  const onGesture = () => {
    startMusic();
    window.removeEventListener("pointerdown", onGesture);
    window.removeEventListener("keydown", onGesture);
  };
  window.addEventListener("pointerdown", onGesture, { once: false });
  window.addEventListener("keydown", onGesture, { once: false });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopMusic();
    } else if (!started) {
      // Restart on tab return only if the user already interacted once.
      // A clean reload requires another gesture (browser policy).
      if (ctx) startMusic();
    }
  });
}
