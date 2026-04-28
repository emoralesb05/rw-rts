/**
 * Tiny Web Audio synth — short original tones used as default cues when
 * the user hasn't dropped real audio files into assets/sounds/kh/.
 *
 * Kept deliberately minimal: each cue is a 1–3 oscillator burst with an
 * envelope, ~30–250ms. The aim is "subtle game UI feedback", not music.
 */

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      const C = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!C) return null;
      ctx = new C();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.18;
      masterGain.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
  return ctx;
}

type ToneSpec = {
  freq: number;
  durationMs: number;
  type?: OscillatorType;
  attackMs?: number;
  releaseMs?: number;
  detune?: number;
};

function playTone(spec: ToneSpec, when: number = 0) {
  const c = getCtx();
  if (!c || !masterGain) return;
  const start = c.currentTime + when;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = spec.type ?? "sine";
  osc.frequency.value = spec.freq;
  if (spec.detune) osc.detune.value = spec.detune;
  const attack = (spec.attackMs ?? 5) / 1000;
  const release = (spec.releaseMs ?? 30) / 1000;
  const total = spec.durationMs / 1000;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(1, start + attack);
  gain.gain.setValueAtTime(1, start + total - release);
  gain.gain.linearRampToValueAtTime(0, start + total);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(start);
  osc.stop(start + total + 0.05);
}

function playChord(specs: ToneSpec[]) {
  for (const s of specs) playTone(s);
}

function playSequence(specs: ToneSpec[], stepMs: number) {
  specs.forEach((s, i) => playTone(s, (i * stepMs) / 1000));
}

export type SynthCue =
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

export function playCue(cue: SynthCue) {
  switch (cue) {
    case "tool":
      playTone({ freq: 660, durationMs: 60, type: "sine" });
      return;
    case "edit":
      // bright two-tone "ping" — keyblade hit
      playSequence(
        [
          { freq: 880, durationMs: 70, type: "triangle" },
          { freq: 1320, durationMs: 90, type: "triangle", attackMs: 2 },
        ],
        50
      );
      return;
    case "bash":
      // low boom — Bash / shell call (Riku magic feel)
      playChord([
        { freq: 110, durationMs: 220, type: "square", releaseMs: 120 },
        { freq: 165, durationMs: 220, type: "sine", releaseMs: 120 },
      ]);
      return;
    case "web":
      // shimmer arpeggio — Donald magic
      playSequence(
        [
          { freq: 880, durationMs: 60, type: "sine" },
          { freq: 1175, durationMs: 60, type: "sine" },
          { freq: 1568, durationMs: 80, type: "sine", releaseMs: 60 },
        ],
        40
      );
      return;
    case "summon":
      // ascending octave — Kairi/Mickey court summon
      playSequence(
        [
          { freq: 440, durationMs: 80, type: "triangle" },
          { freq: 660, durationMs: 80, type: "triangle" },
          { freq: 880, durationMs: 120, type: "triangle", releaseMs: 80 },
        ],
        70
      );
      return;
    case "session_start":
      // gentle uplift
      playSequence(
        [
          { freq: 392, durationMs: 90, type: "sine" },
          { freq: 523, durationMs: 90, type: "sine" },
          { freq: 659, durationMs: 140, type: "sine", releaseMs: 90 },
        ],
        80
      );
      return;
    case "session_end":
      // gentle downstep
      playSequence(
        [
          { freq: 659, durationMs: 80, type: "sine" },
          { freq: 523, durationMs: 80, type: "sine" },
          { freq: 392, durationMs: 140, type: "sine", releaseMs: 90 },
        ],
        80
      );
      return;
    case "world_warp":
      // gummi-ship style swoop — descending sine sweep
      {
        const c = getCtx();
        if (!c || !masterGain) return;
        const start = c.currentTime;
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(880, start);
        osc.frequency.exponentialRampToValueAtTime(220, start + 0.35);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.7, start + 0.02);
        gain.gain.linearRampToValueAtTime(0, start + 0.35);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(start);
        osc.stop(start + 0.4);
      }
      return;
    case "error":
      // dissonant low — heartless emerge
      playChord([
        { freq: 130, durationMs: 200, type: "sawtooth", releaseMs: 140 },
        { freq: 138, durationMs: 200, type: "sawtooth", releaseMs: 140, detune: 30 },
      ]);
      return;
    case "select":
      playTone({ freq: 1100, durationMs: 35, type: "triangle", attackMs: 1, releaseMs: 20 });
      return;
    case "seal":
      // Triumphant rising 5th + sustained tone — KH "Dearly Beloved" flavor.
      playSequence(
        [
          { freq: 523, durationMs: 130, type: "triangle" }, // C5
          { freq: 659, durationMs: 130, type: "triangle" }, // E5
          { freq: 784, durationMs: 130, type: "triangle" }, // G5
          { freq: 1047, durationMs: 380, type: "triangle", releaseMs: 220 }, // C6 sustain
        ],
        120
      );
      return;
    case "ko":
      // Falling minor 3rd — defeat sting.
      playSequence(
        [
          { freq: 392, durationMs: 90, type: "sawtooth" }, // G4
          { freq: 311, durationMs: 90, type: "sawtooth" }, // Eb4
          { freq: 196, durationMs: 250, type: "sawtooth", releaseMs: 180 }, // G3
        ],
        90
      );
      return;
    case "drive":
      // Sharp ascending arpeggio — drive form transformation.
      playSequence(
        [
          { freq: 587, durationMs: 50, type: "square" },
          { freq: 740, durationMs: 50, type: "square" },
          { freq: 880, durationMs: 50, type: "square" },
          { freq: 1175, durationMs: 110, type: "square", releaseMs: 80 },
        ],
        45
      );
      return;
    case "comfort":
      // Soft healing chime — KH Cure flavor.
      playChord([
        { freq: 880, durationMs: 220, type: "sine", releaseMs: 160 },
        { freq: 1109, durationMs: 220, type: "sine", releaseMs: 160 },
        { freq: 1318, durationMs: 220, type: "sine", releaseMs: 160 },
      ]);
      return;
    case "letter":
      // Gentle paper-rustle ping when a letter arrives.
      playTone({ freq: 988, durationMs: 35, type: "triangle", attackMs: 1, releaseMs: 25 });
      return;
  }
}
