export type AgentTool = "claude" | "cursor" | "codex";

// Four keyblader archetypes:
//   keyblader1 — Vaelen (masculine, twilight-purple)
//   keyblader2 — Selene (feminine, dream-petal pink)
//   keyblader3 — Ryder  (masculine, forge orange / iron)
//   keyblader4 — Lyris  (feminine, tide cyan / sea)
// Each session is assigned one deterministically from its (tool,
// repoRoot) wielder identity, plus an auto-generated display name
// from a per-archetype name pool.
export type UnitRole =
  | "keyblader1"
  | "keyblader2"
  | "keyblader3"
  | "keyblader4";

export type AgentEventKind =
  | "session_start"
  | "session_end"
  | "user_prompt"
  | "assistant_text"
  | "tool_use"
  | "tool_result"
  | "subagent_spawn"
  | "error"
  | "permission_request";

export type AgentEvent = {
  sessionId: string;
  tool: AgentTool;
  cwd: string;
  // Repo root for cwd — stamped by the main-process event bus before emit.
  // The renderer keys worlds by this, so any subdir of the same repo lands
  // on the same KH world. Falls back to cwd when no repo root is found.
  repoRoot?: string;
  timestamp: number;
  kind: AgentEventKind;
  payload: {
    name?: string;
    input?: unknown;
    output?: unknown;
    text?: string;
    error?: string;
    parentSessionId?: string;
    // Set on permission_request: opaque id used to route the user's
    // allow/deny decision back to the open hook socket. Resolved
    // (or timed out) on the main side.
    requestId?: string;
  };
  source: "spawned" | "hook";
};

export type DriveForm = "valor" | "wisdom" | "final";

export type UnitState = {
  id: string;
  sessionId: string;
  tool: AgentTool;
  role: UnitRole;
  // Auto-generated wielder name (e.g., "Vaelen", "Selene", "Aren").
  // Stable per (tool, repoRoot) — same wielder identity always gets
  // the same name across sessions.
  displayName: string;
  cwd: string;
  worldId: string;
  hp: number;
  mp: number;
  status: "idle" | "working" | "casting" | "moving" | "complete" | "fallen";
  lastActivity: number;
  lastTool?: string;
  spawnedHere: boolean;
  parentSessionId?: string;
  driveForm?: DriveForm;
  driveFormUntil?: number;
};

export type HeartlessType = "shadow" | "soldier" | "large_body";

export type Heartless = {
  id: string;
  type: HeartlessType;
  worldId: string;
  targetUnitId?: string;
  hp: number;
  spawnedAt: number;
};

// Letter feed item shown in the Throne Room. Severity drives color.
// Action is what the verb buttons do when clicked.
export type LetterSeverity = "critical" | "important" | "notable";
export type LetterAction =
  | { kind: "dive"; worldId: string }
  | { kind: "comfort"; sessionId: string }
  | { kind: "seal"; worldId: string }
  | { kind: "iterate"; sessionId: string }
  | { kind: "dispatch"; worldId: string }
  | { kind: "send-word"; sessionId: string }
  | { kind: "recall"; sessionId: string }
  | { kind: "permission-allow"; requestId: string }
  | { kind: "permission-deny"; requestId: string }
  | { kind: "dismiss" };

export type LetterRisk = "low" | "elevated" | "high";

export type Letter = {
  id: string;
  createdAt: number;
  severity: LetterSeverity;
  title: string;
  body?: string;
  worldId?: string;
  sessionId?: string;
  // Available verb buttons on the letter.
  actions: { label: string; action: LetterAction }[];
  // Internal: counts collapsed-identical-letters within the rate limit
  // window. Set by the store, displayed as a small badge.
  count?: number;
  // Phase 2B #13c — set on permission_request letters. Risk-level chip
  // gives the King at-a-glance "how careful should I be" signal.
  risk?: LetterRisk;
  // Phase 2B #13c — wielder's last assistant_text (if any) when the
  // permission was requested. The "thinking that led to this ask".
  // Rendered as expandable "what they were thinking" in the letter.
  reasoning?: string;
};

export type WorldAlertLevel =
  | "idle"
  | "active"
  | "warning"
  | "danger"
  | "cleared";

// Per-wielder persistent stats (Sims-style memory across sessions).
// Identity = `${tool}::${repoRoot}`.
export type WielderStats = {
  tool: AgentTool;
  repoRoot: string;
  visits: number;
  seals: number;
  falls: number;
  totalMunny: number;
  lastSeen: number;
};

// Per-world (repo root) persistent stats.
export type WorldStats = {
  repoRoot: string;
  lastVisit: number;
  totalSeals: number;
  totalClears: number;
  totalFalls: number;
  sealedAt?: number;
};

// Standing Order — Phase 2B #14b. Persisted shape mirrors the in-store
// type but trimmed to just what survives a restart (status + counters
// will be re-validated by the runner on hydrate).
export type PersistedStandingOrder = {
  id: string;
  unitIdentity: string; // `${tool}::${repoRoot}` — survives session-id changes
  prompt: string;
  intervalMs: number;
  maxIterations: number;
  iterationsRun: number;
  startedAt: number;
};

export type PersistedState = {
  schemaVersion: 2;
  kingdomFoundedAt: number;
  totalMunnyEver: number;
  wielders: Record<string, WielderStats>;
  worlds: Record<string, WorldStats>;
  standingOrders: PersistedStandingOrder[];
};

export const EMPTY_PERSISTED: PersistedState = {
  schemaVersion: 2,
  kingdomFoundedAt: 0,
  totalMunnyEver: 0,
  standingOrders: [],
  wielders: {},
  worlds: {},
};

export type WorldState = {
  id: string;
  path: string;
  label: string;
  unitIds: string[];
  heartless: Heartless[];
  alertLevel: WorldAlertLevel;
  munny: number;
};

// Auto-generated name pools — original names, no IP. The game picks
// one deterministically from a wielder's (tool, repoRoot) identity hash
// so the same wielder gets the same name every session. One pool per
// archetype, themed loosely to the character's element.
export const KEYBLADER1_NAMES: readonly string[] = [
  "Vaelen", "Aren", "Kael", "Ryn", "Tarek", "Loric", "Brael", "Cyran",
  "Daeron", "Faolan", "Theron", "Orion", "Rhys", "Niko", "Sable", "Soren",
];

export const KEYBLADER2_NAMES: readonly string[] = [
  "Selene", "Nyra", "Aria", "Ember", "Lyra", "Maela", "Sera", "Vela",
  "Kira", "Aurelia", "Nova", "Thalia", "Niva", "Aelis", "Aerin", "Mira",
];

export const KEYBLADER3_NAMES: readonly string[] = [
  "Ryder", "Krell", "Bran", "Dorin", "Garron", "Hadrik", "Joren", "Marek",
  "Talon", "Volk", "Roan", "Zane", "Cael", "Thane", "Erran", "Magnus",
];

export const KEYBLADER4_NAMES: readonly string[] = [
  "Lyris", "Marin", "Cara", "Brynn", "Cove", "Maris", "Naia", "Nerys",
  "Oceane", "Pelin", "Reva", "Saela", "Talia", "Vesper", "Yara", "Asha",
];

const NAME_POOLS: Record<UnitRole, readonly string[]> = {
  keyblader1: KEYBLADER1_NAMES,
  keyblader2: KEYBLADER2_NAMES,
  keyblader3: KEYBLADER3_NAMES,
  keyblader4: KEYBLADER4_NAMES,
};

const ARCHETYPES: readonly UnitRole[] = [
  "keyblader1",
  "keyblader2",
  "keyblader3",
  "keyblader4",
];

// Hash a string to a non-negative integer. Used for deterministic name
// + role assignment per wielder identity.
function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// Pick the archetype for a given identity. Roughly 25/25/25/25 split
// across the four wielders via the hash.
export function archetypeFor(tool: AgentTool, repoRoot: string): UnitRole {
  const h = djb2(`${tool}::${repoRoot}`);
  return ARCHETYPES[h % ARCHETYPES.length];
}

// Pick the display name for a wielder identity.
export function nameFor(role: UnitRole, tool: AgentTool, repoRoot: string): string {
  const pool = NAME_POOLS[role];
  const h = djb2(`name::${tool}::${repoRoot}`);
  return pool[h % pool.length];
}
