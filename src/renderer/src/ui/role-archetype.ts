/**
 * Wielder behavior archetype — derived from the mix of tools the
 * wielder has been using recently. Pure function; recomputed on each
 * render. Categories chosen to map RPG-y mental models onto real
 * coding behavior:
 *
 *   Tank   — Bash-heavy: long shell runs, tests, builds (takes hits)
 *   Healer — Read/Glob/Grep-heavy: inspecting, code-aware lookups
 *   DPS    — Edit/Write/MultiEdit-heavy: makes changes
 *   Roamer — too few tool calls (<5) or no clear majority
 *
 * Threshold to claim a class: that bucket holds >=40% of categorized
 * tool calls in the last WINDOW events for the session.
 */
import type { AgentEvent } from "@shared/events";

export type Archetype = "tank" | "healer" | "dps" | "roamer";

const WINDOW = 50;
const MIN_TOOLS = 5;
const CLAIM_THRESHOLD = 0.4;

const TANK_TOOLS = new Set(["Bash", "BashOutput"]);
const HEALER_TOOLS = new Set(["Read", "Glob", "Grep"]);
const DPS_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

export function classifyArchetype(
  sessionId: string,
  events: AgentEvent[]
): Archetype {
  let tank = 0;
  let healer = 0;
  let dps = 0;
  let total = 0;
  // Walk newest-first; bail when we have WINDOW events.
  for (const ev of events) {
    if (total >= WINDOW) break;
    if (ev.sessionId !== sessionId) continue;
    if (ev.kind !== "tool_use") continue;
    const name = String(ev.payload.name ?? "");
    if (!name) continue;
    let counted = false;
    if (TANK_TOOLS.has(name)) {
      tank++;
      counted = true;
    } else if (HEALER_TOOLS.has(name)) {
      healer++;
      counted = true;
    } else if (DPS_TOOLS.has(name)) {
      dps++;
      counted = true;
    }
    if (counted) total++;
  }
  if (total < MIN_TOOLS) return "roamer";
  const tankFrac = tank / total;
  const healerFrac = healer / total;
  const dpsFrac = dps / total;
  // Pick whichever is highest AND clears the threshold.
  let best: Archetype = "roamer";
  let bestFrac = CLAIM_THRESHOLD - 0.0001;
  if (tankFrac > bestFrac) {
    best = "tank";
    bestFrac = tankFrac;
  }
  if (healerFrac > bestFrac) {
    best = "healer";
    bestFrac = healerFrac;
  }
  if (dpsFrac > bestFrac) {
    best = "dps";
    bestFrac = dpsFrac;
  }
  return best;
}

export const ARCHETYPE_LABEL: Record<Archetype, string> = {
  tank: "Tank",
  healer: "Healer",
  dps: "DPS",
  roamer: "Roamer",
};

export const ARCHETYPE_GLYPH: Record<Archetype, string> = {
  tank: "🛡",
  healer: "✚",
  dps: "⚔",
  roamer: "·",
};

export const ARCHETYPE_TITLE: Record<Archetype, string> = {
  tank: "Tank — leans on Bash, builds, tests",
  healer: "Healer — leans on Read, Grep, Glob (inspection)",
  dps: "DPS — leans on Edit, Write, MultiEdit (changes)",
  roamer: "Roamer — no clear behavior class yet",
};
