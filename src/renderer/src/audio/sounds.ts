/**
 * Sound loader. Probes /sounds/kh/{name}.{ext} for each sound name; if present,
 * plays via HTMLAudio. If absent, falls back to a synthesized cue from
 * audio/synth.ts so the app has audio feedback out of the box.
 */
import { playCue, type SynthCue } from "./synth";

export type SoundName =
  | "tool"
  | "edit"
  | "bash"
  | "web"
  | "summon"
  | "session_start"
  | "session_end"
  | "world_warp"
  | "error"
  | "select"
  | "seal"
  | "ko"
  | "drive"
  | "comfort"
  | "letter";

const FORMATS = ["wav", "mp3", "ogg"];
const cache = new Map<SoundName, HTMLAudioElement | null>();
const muteKey = "kh-rts:muted";
let _muted = localStorage.getItem(muteKey) === "1";

async function probe(name: SoundName): Promise<HTMLAudioElement | null> {
  for (const ext of FORMATS) {
    const url = `/sounds/kh/${name}.${ext}`;
    try {
      const head = await fetch(url, { method: "HEAD" });
      if (head.ok) {
        const audio = new Audio(url);
        audio.preload = "auto";
        return audio;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

export async function preloadSounds() {
  const names: SoundName[] = [
    "tool",
    "edit",
    "bash",
    "web",
    "summon",
    "session_start",
    "session_end",
    "world_warp",
    "error",
    "select",
    "seal",
    "ko",
    "drive",
    "comfort",
    "letter",
  ];
  await Promise.all(
    names.map(async (n) => {
      const a = await probe(n);
      cache.set(n, a);
    })
  );
}

export function play(name: SoundName, volume = 0.6) {
  if (_muted) return;
  const audio = cache.get(name);
  if (audio) {
    try {
      const clone = audio.cloneNode(true) as HTMLAudioElement;
      clone.volume = volume;
      void clone.play().catch(() => {});
    } catch {
      // ignore
    }
    return;
  }
  // No file — fall back to synthesized cue.
  playCue(name as SynthCue);
}

export function isMuted() {
  return _muted;
}

export function setMuted(m: boolean) {
  _muted = m;
  localStorage.setItem(muteKey, m ? "1" : "0");
}

export function toggleMuted() {
  setMuted(!_muted);
  return _muted;
}

export function hasSound(name: SoundName) {
  return !!cache.get(name);
}
