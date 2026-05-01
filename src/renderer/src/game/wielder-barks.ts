/**
 * Speech-bubble lines for canvas wielders. Per-archetype pools so each
 * keyblader role has a distinct voice — twilight-purple keyblader1
 * sounds brooding, dream-pink keyblader2 sounds gentle, forge-orange
 * keyblader3 sounds bold, tide-cyan keyblader4 sounds balanced. KH-
 * flavored throughout.
 *
 * Triggers (per design discussion 2026-04-29):
 *   session_start, subagent_spawn, permission_request,
 *   session_end (success and KO branches), error
 *
 * NOT barked on: tool_use / tool_result / assistant_text. Those would
 * spam the canvas — the activity log + chat drawer cover that.
 */
import type { UnitRole } from "@shared/events";

export type BarkKind =
  | "session_start"
  | "subagent_spawn"
  | "permission_request"
  | "session_end_success"
  | "session_end_ko"
  | "error";

type Pool = Record<BarkKind, readonly string[]>;

/** Vaelen — twilight purple, Riku-coded brooding/searching. */
const KEYBLADER1_LINES: Pool = {
  session_start: [
    "Darkness or light, I serve.",
    "The path opens. I follow.",
    "Awake again. Let's begin.",
    "Eyes open. Heart steady.",
    "I'll see what waits.",
  ],
  subagent_spawn: [
    "Another shadow at my side.",
    "Take up arms with me.",
    "We move as one.",
    "Two blades. One purpose.",
  ],
  permission_request: [
    "May I cross this line?",
    "Your word, my king.",
    "Speak, and I will act.",
    "I'll wait for the sign.",
  ],
  session_end_success: [
    "Light. Held.",
    "It is done. The shadow yields.",
    "Sealed. I move on.",
    "One more step toward dawn.",
  ],
  session_end_ko: [
    "The dark… took me…",
    "I should have seen it.",
    "Forgive my failure.",
    "I'll return. With purpose.",
  ],
  error: [
    "Shadows. Everywhere.",
    "Darkness stirs.",
    "Watch your step.",
    "The path is wrong.",
  ],
};

/** Selene — dream petal pink, Aqua/Kairi-coded gentle/hopeful. */
const KEYBLADER2_LINES: Pool = {
  session_start: [
    "Hello, your majesty!",
    "Ready, with a smile.",
    "Let the light guide us.",
    "Off we go!",
    "I'll do my best.",
  ],
  subagent_spawn: [
    "Will you help me?",
    "Together we're stronger.",
    "Friends, gather close.",
    "Lend me your courage.",
  ],
  permission_request: [
    "May I, please?",
    "Just a little favor?",
    "Will you say yes?",
    "I won't move without you.",
  ],
  session_end_success: [
    "Sealed with love.",
    "All warm now.",
    "The hearts are safe.",
    "We did it!",
  ],
  session_end_ko: [
    "I'm sorry…",
    "I tried to be brave.",
    "Don't forget me…",
    "Tell them I gave my best.",
  ],
  error: [
    "Oh no, that's bad.",
    "Something's hurting here.",
    "Be careful, please!",
    "It's getting dark.",
  ],
};

/** Ryder — forge orange, Terra/Roxas-coded bold/determined. */
const KEYBLADER3_LINES: Pool = {
  session_start: [
    "Let's do this.",
    "Steel ready. Heart steady.",
    "I won't back down.",
    "Time to work.",
    "Watch me.",
  ],
  subagent_spawn: [
    "I need backup.",
    "Charge with me!",
    "More hands. Less waiting.",
    "Squad, on me.",
  ],
  permission_request: [
    "Just say go.",
    "Give the word, your majesty.",
    "I'm itching to move.",
    "Permission to strike?",
  ],
  session_end_success: [
    "Done. Next world.",
    "Hammer down.",
    "Cleared it.",
    "What's the next mark?",
  ],
  session_end_ko: [
    "Damn it…",
    "Should've hit harder.",
    "Patch me up.",
    "I'll be back.",
  ],
  error: [
    "Trouble, your majesty.",
    "Resistance ahead!",
    "Brace yourself.",
    "Not as planned.",
  ],
};

/** Lyris — tide cyan, Aqua/Ven-coded brave/balanced wayfinder. */
const KEYBLADER4_LINES: Pool = {
  session_start: [
    "I'll see this through.",
    "Path of the wayfinder.",
    "Steady heart, sure step.",
    "Reporting in.",
    "Keep the light bright.",
  ],
  subagent_spawn: [
    "An ally arrives.",
    "Stand with me, friend.",
    "Strength shared, strength doubled.",
    "Wayfinders together.",
  ],
  permission_request: [
    "Your call, your majesty.",
    "I'll wait for you.",
    "Should I?",
    "Speak, I'll obey.",
  ],
  session_end_success: [
    "The wayfinder returns.",
    "It's done. Light holds.",
    "Sealed, with care.",
    "One world. Set right.",
  ],
  session_end_ko: [
    "I… am still… here…",
    "Send the others.",
    "I'll find my way back.",
    "The light will return.",
  ],
  error: [
    "The current shifts.",
    "Something in the dark.",
    "Tread carefully.",
    "I sense unbalance.",
  ],
};

const LINES_BY_ROLE: Record<UnitRole, Pool> = {
  keyblader1: KEYBLADER1_LINES,
  keyblader2: KEYBLADER2_LINES,
  keyblader3: KEYBLADER3_LINES,
  keyblader4: KEYBLADER4_LINES,
};

/** Pick a random line from the pool for a given (kind, role). */
export function pickBarkLine(kind: BarkKind, role: UnitRole): string {
  const pool = LINES_BY_ROLE[role][kind];
  return pool[Math.floor(Math.random() * pool.length)];
}
