/**
 * Speech-bubble lines for canvas wielders. Picked randomly per event
 * so the same trigger doesn't repeat itself instantly. KH-flavored
 * tone — short, paladin-y, occasionally brooding. Lines are written
 * for a generic "keyblade-bearer" voice; per-archetype voices are a
 * follow-up.
 *
 * Triggers we bark on (per design discussion 2026-04-29):
 *   session_start, subagent_spawn, permission_request,
 *   session_end (success and KO branches), error
 *
 * NOT barked on: tool_use / tool_result / assistant_text. Those would
 * spam the canvas — there's the activity log + Messages tab for that.
 */

const LINES = {
  session_start: [
    "My keyblade and I, at your service.",
    "Heart, set on the path.",
    "Ready when you are, your majesty.",
    "I will see this through to the end.",
    "The light is calling.",
    "By Yen Sid's word — I'm here.",
  ],
  subagent_spawn: [
    "Lend me your strength!",
    "Together, we shine.",
    "Two hearts, one purpose.",
    "Stand with me, friend.",
    "The road's not walked alone.",
  ],
  permission_request: [
    "May I, my liege?",
    "I await your word.",
    "Your call, your majesty.",
    "Should I proceed?",
    "Awaiting your decree.",
  ],
  session_end_success: [
    "Sealed. The light holds.",
    "Another world set right.",
    "By the keyblade.",
    "It is done, your majesty.",
    "The path is clear.",
    "May this kingdom prosper.",
  ],
  session_end_ko: [
    "Forgive me…",
    "The darkness… too strong…",
    "I will not… falter…",
    "Take care of the others.",
    "My heart… still beats…",
    "I'll come back. I promise.",
  ],
  error: [
    "Heartless!",
    "I sense darkness here.",
    "Something is not right.",
    "By the keyblade — what was that?",
    "The shadows grow.",
    "Stand back, your majesty.",
  ],
} as const;

export type BarkKind = keyof typeof LINES;

/** Pick a random line from the pool for a given trigger kind. */
export function pickBarkLine(kind: BarkKind): string {
  const pool = LINES[kind];
  return pool[Math.floor(Math.random() * pool.length)];
}
