import { create } from "zustand";
import type {
  AgentEvent,
  UnitState,
  UnitRole,
  WorldState,
  Heartless,
  WorldAlertLevel,
  DriveForm,
  PersistedState,
  Letter,
  LetterAction,
} from "@shared/events";
import { archetypeFor, nameFor, EMPTY_PERSISTED } from "@shared/events";
import { MutedSessionIdsSchema } from "@shared/schemas";
import { play } from "./audio/sounds";
import {
  createStandingOrder,
  dismissInformationalLetters,
  haltStandingOrderById,
  hydrateStandingOrders,
  isPermissionLetter,
  ordersToPersisted,
  permissionResolutionForAction,
  recordStandingOrderTickById,
  type StandingOrder,
} from "./store-domain";
import {
  unitIdentityFor,
  unitIdentityForUnit,
} from "./unit-identity";

export { unitIdentityFor, unitIdentityForUnit } from "./unit-identity";
export type { StandingOrder } from "./store-domain";

export type ComfortReceipt = "ok" | "no-munny" | "cooldown" | "full-hp" | "fallen";

type Store = {
  events: AgentEvent[];
  eventCount: number;
  units: Record<string, UnitState>;
  worlds: Record<string, WorldState>;
  selectedUnitId: string | null;
  // The most recently focused world. Drives UnitInspector filtering and
  // is stamped by selectWorld. In the unified-map architecture (Q40)
  // there's no longer a single "active scene"; this field is just the
  // last-clicked-world bookmark.
  activeWorldId: string | null;
  mutedSessionIds: Record<string, true>;
  persisted: PersistedState;
  letters: Letter[];
  // KingdomScene reads this to pan its camera. Set by clicking a wielder
  // card / letter in the side panel, or a planet on the map. Stamped with
  // a monotonic version so the same target can be re-clicked to re-pan.
  cameraTarget: string | null;
  cameraTargetVersion: number;
  // DecreeModal is open for this unitId when non-null (Phase 2B #14).
  decreeUnitId: string | null;
  // Active recurring Decrees (Phase 2B #14b). Keyed by orderId. NOT
  // persisted in this iteration — orders end on app restart. Persistence
  // is a follow-up commit per Q12 schema sketch.
  standingOrders: Record<string, StandingOrder>;

  ingest(event: AgentEvent): void;
  selectUnit(id: string | null): void;
  selectWorld(id: string | null): void;
  setCameraTarget(worldId: string | null): void;
  openDecreeFor(unitId: string): void;
  closeDecree(): void;
  startStandingOrder(unitId: string, prompt: string, intervalMs: number, maxIterations?: number): string;
  recordOrderTick(orderId: string, ok: boolean): void;
  haltStandingOrder(orderId: string): void;
  toggleMute(sessionId: string): void;
  hydratePersisted(state: PersistedState): void;
  sealKeyhole(worldId: string): void;
  comfort(sessionId: string): ComfortReceipt;
  dismissLetter(letterId: string): void;
  dismissInformationalLetters(): void;
  applyLetterAction(letter: Letter, action: LetterAction): void;
  resetKingdom(): Promise<void>;
};

const MUTED_KEY = "keykeeper:muted-sessions";
function loadMuted(): Record<string, true> {
  try {
    const raw = localStorage.getItem(MUTED_KEY);
    if (!raw) return {};
    const parsed = MutedSessionIdsSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return {};
    const out: Record<string, true> = {};
    for (const id of parsed.data) out[id] = true;
    return out;
  } catch {
    return {};
  }
}
function saveMuted(m: Record<string, true>) {
  try {
    localStorage.setItem(MUTED_KEY, JSON.stringify(Object.keys(m)));
  } catch {
    // ignore
  }
}

const MAX_EVENTS = 500;

// Combat tuning. Heartless TTL = how long a mob lingers if the unit ignores
// it (long enough to feel threatening, short enough to not pile up forever).
// HEARTLESS_LIMIT caps the on-screen mob count per world so a flapping error
// stream can't spawn 1000 shadows.
const HEARTLESS_TTL_MS = 30_000;
const HEARTLESS_LIMIT = 12;
const MUNNY_PER_KILL = 5;

// World id derives from the repo root the main bus stamped on the event;
// fall back to cwd for events that pre-date the stamp (older sessions
// loaded from log replay, etc.).
function worldIdFor(event: AgentEvent): string {
  const base = event.repoRoot ?? event.cwd;
  return base.replace(/[^a-zA-Z0-9]+/g, "_") || "root";
}

function worldLabelFor(event: AgentEvent): string {
  const base = event.repoRoot ?? event.cwd;
  const parts = base.split("/").filter(Boolean);
  return parts[parts.length - 1] || base;
}

function worldPathFor(event: AgentEvent): string {
  return event.repoRoot ?? event.cwd;
}

function newHeartlessId(worldId: string): string {
  return `h-${worldId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// Per-theme heartless mix — used by store to pick which heartless
// type spawns when an error fires.
const HEARTLESS_MIX_BY_THEME: Record<
  string,
  { shadow: number; soldier: number; largebody: number }
> = {
  disney: { shadow: 0.7, soldier: 0.3, largebody: 0 },
  hollow: { shadow: 0.3, soldier: 0.5, largebody: 0.2 },
  traverse: { shadow: 0.6, soldier: 0.35, largebody: 0.05 },
  destiny: { shadow: 0.95, soldier: 0.05, largebody: 0 },
  twilight: { shadow: 0.5, soldier: 0.45, largebody: 0.05 },
  halloween: { shadow: 0.7, soldier: 0.25, largebody: 0.05 },
};

function pickHeartlessType(
  worldId: string,
  recentErrorCount: number
): "shadow" | "soldier" | "large_body" {
  // Re-derive theme from worldId via the same hash gummi-worlds uses,
  // without importing the renderer-only module here.
  let h = 0;
  for (let i = 0; i < worldId.length; i++) {
    h = (Math.imul(31, h) + worldId.charCodeAt(i)) | 0;
  }
  const themes = ["disney", "hollow", "traverse", "destiny", "twilight", "halloween"];
  const theme = themes[Math.abs(h) % themes.length];
  const mix = HEARTLESS_MIX_BY_THEME[theme] ?? HEARTLESS_MIX_BY_THEME.disney;

  // Trigger escalation: if errors are stacking up, bias toward bigger
  // heartless even on lighter-themed worlds.
  let shadowW = mix.shadow;
  let soldierW = mix.soldier;
  let largeW = mix.largebody;
  if (recentErrorCount >= 3) {
    largeW += 0.2;
    soldierW += 0.2;
    shadowW = Math.max(0, shadowW - 0.4);
  } else if (recentErrorCount >= 2) {
    soldierW += 0.2;
    shadowW = Math.max(0, shadowW - 0.2);
  }
  const total = shadowW + soldierW + largeW;
  const r = Math.random() * total;
  if (r < shadowW) return "shadow";
  if (r < shadowW + soldierW) return "soldier";
  return "large_body";
}

function spawnHeartless(
  list: Heartless[],
  worldId: string,
  targetUnitId: string | undefined,
  count: number,
  recentErrorCount = 1
): Heartless[] {
  const next = [...list];
  for (let i = 0; i < count && next.length < HEARTLESS_LIMIT; i++) {
    next.push({
      id: newHeartlessId(worldId),
      type: pickHeartlessType(worldId, recentErrorCount),
      worldId,
      targetUnitId,
      hp: 1,
      spawnedAt: Date.now(),
    });
  }
  return next;
}

function expireHeartless(list: Heartless[], now: number): Heartless[] {
  if (list.length === 0) return list;
  const cutoff = now - HEARTLESS_TTL_MS;
  let changed = false;
  const next: Heartless[] = [];
  for (const h of list) {
    if (h.spawnedAt < cutoff) {
      changed = true;
      continue;
    }
    next.push(h);
  }
  return changed ? next : list;
}

function killOldestHeartless(list: Heartless[]): Heartless[] {
  if (list.length === 0) return list;
  return list.slice(1);
}

function computeAlertLevel(
  world: WorldState,
  units: Record<string, UnitState>
): WorldAlertLevel {
  const live = world.unitIds
    .map((id) => units[id])
    .filter((u): u is UnitState => !!u && u.status !== "fallen");
  const everyDone =
    world.unitIds.length > 0 &&
    world.unitIds.every((id) => {
      const u = units[id];
      return u && (u.status === "complete" || u.status === "fallen");
    });
  const heartlessCount = world.heartless.length;
  if (everyDone && heartlessCount === 0) return "cleared";
  if (live.length === 0) return "idle";
  const minHp = Math.min(...live.map((u) => u.hp));
  if (heartlessCount > 5 || minHp < 30) return "danger";
  if (heartlessCount > 0 || minHp < 70) return "warning";
  if (live.some((u) => u.status === "working" || u.status === "casting"))
    return "active";
  return "idle";
}

// Letters cap — keeps the throne feed bounded.
const MAX_LETTERS = 50;
const HP_CRITICAL_THRESHOLD = 25;

// Per-session comfort cooldown timestamps (ms when next allowed).
const _comfortCooldown = new Map<string, number>();
const COMFORT_COST = 50;
const COMFORT_HP = 30;
const COMFORT_COOLDOWN_MS = 30_000;

// Per-session "we already dropped a critical-HP letter" marker so we don't
// flood when a low-HP unit takes more errors.
const _hpLowFor = new Set<string>();

// Stuck-loop detection (Phase 2B #13a / Q10). Per-session rolling
// window of recent tool_use events to spot oscillation: same tool +
// same arg 3+ times in 60s, OR 3+ tool_use without an assistant_text
// between. _stuckLetterAt rate-limits the resulting letter so a long
// stuck loop only fires once until the wielder thinks again.
type RecentToolEntry = { ts: number; toolName: string; argKey: string };
const _recentTools = new Map<string, RecentToolEntry[]>();
const _consecutiveTools = new Map<string, number>();
const _stuckLetterAt = new Map<string, number>();
const STUCK_WINDOW_MS = 60_000;
const STUCK_THRESHOLD = 3;
const STUCK_LETTER_COOLDOWN_MS = 90_000;

/**
 * Stable key for a tool_use input — folds payloads into a comparable
 * string so the same Edit on the same file (regardless of edit details)
 * counts as a repeat. Returns "*" for unknown shapes.
 */
/**
 * MP cost per tool_use (Phase 2A real-token MP, light version). Weighted
 * by tool type — Read/Glob/Grep are cheap (observation); Bash/Edit/
 * MultiEdit are heavier (mutation); Task is the costliest (spawns a
 * subagent). Falls back to 4 for unknown tools (matches the pre-Phase-2A
 * fixed cost).
 */
const TOOL_MP_BASE: Record<string, number> = {
  Read: 2, Glob: 2, Grep: 2, TodoWrite: 1,
  Bash: 6, BashOutput: 4,
  Edit: 5, MultiEdit: 7, Write: 5, NotebookEdit: 5,
  Task: 12, Agent: 12,
  WebFetch: 6, WebSearch: 6,
};
function mpCostForToolUse(toolName: string): number {
  return TOOL_MP_BASE[toolName] ?? 4;
}

/**
 * Extra MP drain on tool_result, proportional to output size. Heavy
 * file reads + verbose Bash output cost more than empty acks. Capped
 * so a single 1MB log doesn't zero MP.
 */
function mpCostForToolResult(output: unknown): number {
  let len = 0;
  if (typeof output === "string") len = output.length;
  else if (output && typeof output === "object") {
    const r = output as Record<string, unknown>;
    if (typeof r.stdout === "string") len = r.stdout.length;
    else if (typeof r.text === "string") len = r.text.length;
    else if (typeof r.content === "string") len = r.content.length;
  }
  if (len < 1000) return 0;
  return Math.min(8, Math.floor(len / 5000));
}

/**
 * Short human description of a permission_request's tool input, for the
 * Critical letter body. Mirrors argKeyFor's coverage but renders for
 * humans rather than as a comparable string.
 */
function summarizePermissionInput(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const r = input as Record<string, unknown>;
  if (typeof r.command === "string") return r.command.slice(0, 200);
  if (typeof r.file_path === "string") return r.file_path;
  if (typeof r.path === "string") return r.path;
  if (typeof r.url === "string") return r.url.slice(0, 200);
  if (typeof r.pattern === "string") return r.pattern;
  return "";
}

function isObservationOnlyPermission(event: AgentEvent): boolean {
  if (event.tool === "cursor") return true;
  return false;
}

/**
 * Phase 2B #13c — risk-level classification for permission letters.
 * Quick heuristic on tool + input shape. Three buckets (LOW / ELEVATED
 * / HIGH) so the King has a glance-able cue beyond the Critical
 * severity color.
 *
 * - HIGH: destructive shell, sudo/chmod/chown, writes to system paths
 *   or ~/.ssh / ~/.aws / etc.
 * - ELEVATED: any Bash command, Write/Edit anywhere outside the cwd
 * - LOW: Read, Glob, Grep, WebFetch — observation rather than mutation
 */
function classifyRisk(toolName: string, input: unknown): import("@shared/events").LetterRisk {
  const tool = toolName.toLowerCase();
  const r = (input as Record<string, unknown>) || {};
  if (tool === "read" || tool === "glob" || tool === "grep" || tool === "webfetch" || tool === "websearch") {
    return "low";
  }
  if (tool === "bash") {
    const cmd = String(r.command ?? "").toLowerCase();
    if (
      /\bsudo\b/.test(cmd) ||
      /\bchmod\b.+(?:777|-r)/.test(cmd) ||
      /\bchown\b/.test(cmd) ||
      /\brm\b.+\b-(?:rf|fr|Rf)\b/.test(cmd) ||
      /\bdd\b\s+if=/.test(cmd) ||
      /\bmkfs\b/.test(cmd) ||
      /\bgit\s+push\s+(?:--force|-f)\b/.test(cmd) ||
      /\bgit\s+reset\s+--hard\b/.test(cmd)
    ) {
      return "high";
    }
    return "elevated";
  }
  if (tool === "write" || tool === "edit" || tool === "multiedit") {
    const path = String(r.file_path ?? r.path ?? "");
    if (
      path.startsWith("/etc/") ||
      path.startsWith("/usr/") ||
      path.startsWith("/System/") ||
      path.startsWith("/var/") ||
      /\.(ssh|aws|gnupg)\//.test(path) ||
      /\.(bash_profile|zshrc|zprofile|netrc)$/.test(path)
    ) {
      return "high";
    }
    return "elevated";
  }
  return "elevated";
}

/**
 * Phase 2B #13c — extract the wielder's most recent assistant_text
 * before this event, as the "reasoning" context for a permission
 * letter. Walks the event log newest-first; bounded.
 */
function extractRecentReasoning(events: AgentEvent[], sessionId: string): string {
  for (const ev of events) {
    if (ev.sessionId !== sessionId) continue;
    if (ev.kind !== "assistant_text") continue;
    const text = String(ev.payload.text ?? "").trim();
    if (!text) continue;
    return text.length > 480 ? text.slice(0, 480) + "…" : text;
  }
  return "";
}

function argKeyFor(input: unknown): string {
  if (!input || typeof input !== "object") return "*";
  const r = input as Record<string, unknown>;
  if (typeof r.file_path === "string") return `file:${r.file_path}`;
  if (typeof r.path === "string") return `file:${r.path}`;
  if (typeof r.command === "string") return `cmd:${r.command.slice(0, 80)}`;
  if (typeof r.pattern === "string") return `glob:${r.pattern}`;
  if (typeof r.url === "string") return `url:${r.url.slice(0, 80)}`;
  return "*";
}

/**
 * Walk the recent tool window for a session; if a (tool, argKey) pair
 * appeared ≥ STUCK_THRESHOLD times OR the consecutive-tools count
 * crossed the threshold, return a description for the stuck-loop
 * letter. Otherwise null.
 */
function detectStuckLoop(sessionId: string): { reason: string; toolName: string } | null {
  const list = _recentTools.get(sessionId) ?? [];
  // Same (tool, arg) repeat detection
  const counts = new Map<string, { count: number; toolName: string; argKey: string }>();
  for (const e of list) {
    const k = `${e.toolName}|${e.argKey}`;
    const cur = counts.get(k) ?? { count: 0, toolName: e.toolName, argKey: e.argKey };
    cur.count += 1;
    counts.set(k, cur);
  }
  let topPair: { count: number; toolName: string; argKey: string } | null = null;
  for (const v of counts.values()) {
    if (!topPair || v.count > topPair.count) topPair = v;
  }
  if (topPair && topPair.count >= STUCK_THRESHOLD) {
    const argHuman =
      topPair.argKey.startsWith("file:") ? "`" + topPair.argKey.slice(5) + "`" :
      topPair.argKey.startsWith("cmd:") ? "command `" + topPair.argKey.slice(4) + "`" :
      topPair.argKey.startsWith("glob:") ? "pattern `" + topPair.argKey.slice(5) + "`" :
      topPair.argKey.startsWith("url:") ? "URL `" + topPair.argKey.slice(4) + "`" :
      "the same input";
    return {
      reason: `tried \`${topPair.toolName}\` on ${argHuman} ${topPair.count}× in ~1m`,
      toolName: topPair.toolName,
    };
  }
  // Consecutive-without-thinking detection
  const consec = _consecutiveTools.get(sessionId) ?? 0;
  if (consec >= STUCK_THRESHOLD * 2) {
    const lastTool = list[list.length - 1]?.toolName ?? "tools";
    return {
      reason: `${consec} tool calls in a row with no thinking between (last: \`${lastTool}\`)`,
      toolName: lastTool,
    };
  }
  return null;
}

function makeLetter(
  severity: Letter["severity"],
  title: string,
  opts: Partial<Letter> = {}
): Letter {
  return {
    id: `L${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    severity,
    title,
    actions: [],
    ...opts,
  };
}

/** Add a letter to the feed. For informational letters, collapse the
 * stream to one-per-wielder: remove any prior informational letter for
 * the same sessionId so the new one replaces it. Permission letters
 * stay distinct (each is its own decision). */
function pushLetter(state: Store, letter: Letter): Letter[] {
  let next = state.letters;
  if (!isPermissionLetter(letter) && letter.sessionId) {
    const sid = letter.sessionId;
    next = next.filter(
      (l) => l.sessionId !== sid || isPermissionLetter(l)
    );
  }
  return [letter, ...next].slice(0, MAX_LETTERS);
}

// Read-only / observation tools don't "fight back" — they don't clear
// heartless. Only concrete progress (edits, shells, web fetches, summons,
// long results) does. Tool names span all provider rosters.
const COMBAT_TOOL_RESULT_NAMES = new Set([
  // Claude
  "Edit",
  "Write",
  "MultiEdit",
  "NotebookEdit",
  "Bash",
  "WebFetch",
  "WebSearch",
  "Task",
  "Agent",
  // Cursor
  "edit_file",
  "search_replace",
  "multi_apply",
  "run_terminal_command_v2",
  "run_terminal_command",
  "fetch_pull_request",
  "web_search",
  // Codex
  "apply_patch",
  "edit",
  "write",
  "shell",
  "exec",
]);

// Four-keyblader system: archetype is locked per (tool, repoRoot)
// wielder identity, not per tool-call. The same wielder always renders
// the same archetype + name across sessions.
function roleFor(
  tool: AgentEvent["tool"],
  repoRoot: string,
  current?: UnitRole
): UnitRole {
  return current ?? archetypeFor(tool, repoRoot);
}

// Batch incoming events into one store update per animation frame so
// bursts (e.g. Cursor turn emits 20 tool_use events in <100ms) don't
// trigger 20 separate re-renders.
const _queue: AgentEvent[] = [];
let _flushScheduled = false;

// Pending Task/Agent calls — when a parent fires this and a new session
// starts within PARENT_LINK_WINDOW_MS in the same cwd, treat the new unit
// as the parent's child.
type PendingTask = { parentSessionId: string; cwd: string; time: number };
const _pendingTasks: PendingTask[] = [];
const PARENT_LINK_WINDOW_MS = 8000;
const TASK_NAMES = new Set([
  "Task",
  "Agent",
  "task_v2",
  "task",
  "invoke_agent",
  "invoke_subagent",
]);

// Drive form streak tracking. Per-session counters that reset on error or
// session_end. Kept off UnitState because they're transient simulation
// state, not data the UI needs to read.
type StreakState = {
  successCount: number;
  bashCount: number;
  bashSince: number;
};
const _streaks = new Map<string, StreakState>();
const VALOR_THRESHOLD = 5;
const WISDOM_BASH_COUNT = 3;
const WISDOM_BASH_WINDOW_MS = 10_000;
const DRIVE_DURATION_MS = 14_000;
const BASH_NAMES = new Set([
  "Bash",
  "shell",
  "exec",
  "run_terminal_command",
  "run_terminal_command_v2",
]);

function getStreak(id: string): StreakState {
  let s = _streaks.get(id);
  if (!s) {
    s = { successCount: 0, bashCount: 0, bashSince: 0 };
    _streaks.set(id, s);
  }
  return s;
}

function chooseDriveForm(
  event: AgentEvent,
  streak: StreakState,
  _currentRole: UnitRole
): { form: DriveForm; until: number } | null {
  // Final Form is reserved for subagent spawns.
  if (event.kind === "subagent_spawn") {
    return { form: "final", until: event.timestamp + DRIVE_DURATION_MS };
  }
  // Wisdom Form: a burst of shells/bash within WISDOM_BASH_WINDOW_MS.
  if (
    event.kind === "tool_use" &&
    typeof event.payload.name === "string" &&
    BASH_NAMES.has(event.payload.name)
  ) {
    if (
      streak.bashSince > 0 &&
      event.timestamp - streak.bashSince <= WISDOM_BASH_WINDOW_MS &&
      streak.bashCount >= WISDOM_BASH_COUNT
    ) {
      return { form: "wisdom", until: event.timestamp + DRIVE_DURATION_MS };
    }
  }
  // Valor Form: streak of clean tool_results. Only awarded once threshold met.
  if (event.kind === "tool_result" && streak.successCount >= VALOR_THRESHOLD) {
    return { form: "valor", until: event.timestamp + DRIVE_DURATION_MS };
  }
  return null;
}

function applyOneEvent(state: Store, event: AgentEvent): Partial<Store> {
  const id = event.sessionId;
  const worldId = worldIdFor(event);
  const events = [event, ...state.events].slice(0, MAX_EVENTS);
  const eventCount = state.eventCount + 1;
  const existing = state.units[id];
  const lastToolName =
    event.kind === "tool_use" ? (event.payload.name as string | undefined) : existing?.lastTool;
  // Wielder identity = (tool, repoRoot) — drives both archetype + name.
  const repoRootStable = event.repoRoot ?? event.cwd;
  const role = roleFor(event.tool, repoRootStable, existing?.role);
  const displayName = existing?.displayName ?? nameFor(role, event.tool, repoRootStable);
  const unit: UnitState = existing
    ? { ...existing, repoRoot: existing.repoRoot ?? repoRootStable }
    : {
        id,
        sessionId: id,
        tool: event.tool,
        role,
        displayName,
        cwd: event.cwd,
        repoRoot: repoRootStable,
        worldId,
        hp: 100,
        mp: 100,
        status: "idle",
        lastActivity: event.timestamp,
        spawnedAt: event.timestamp,
        spawnedHere: false,
      };
  if (event.kind === "session_start" && event.source === "spawned") {
    unit.spawnedHere = true;
  }
  // Renown stats: count a "visit" the first time we see this wielder
  // identity in this session. Tracked via existing-vs-new check above.
  // Only on actual session_start to avoid double-counting on
  // mid-session events.
  if (event.kind === "session_start" && !existing) {
    const identity = unitIdentityFor(event.tool, repoRootStable);
    const prior = state.persisted.wielders[identity];
    state = {
      ...state,
      persisted: {
        ...state.persisted,
        wielders: {
          ...state.persisted.wielders,
          [identity]: {
            tool: event.tool,
            repoRoot: repoRootStable,
            visits: (prior?.visits ?? 0) + 1,
            seals: prior?.seals ?? 0,
            falls: prior?.falls ?? 0,
            totalMunny: prior?.totalMunny ?? 0,
            lastSeen: event.timestamp,
          },
        },
      },
    };
    void window.kh.savePersisted(state.persisted).catch(() => {});
  }
  // session_end with hp=0 = a fall.
  if (event.kind === "session_end" && existing && existing.hp <= 0) {
    const identity = unitIdentityFor(event.tool, repoRootStable);
    const prior = state.persisted.wielders[identity];
    if (prior) {
      state = {
        ...state,
        persisted: {
          ...state.persisted,
          wielders: {
            ...state.persisted.wielders,
            [identity]: {
              ...prior,
              falls: prior.falls + 1,
              lastSeen: event.timestamp,
            },
          },
        },
      };
      void window.kh.savePersisted(state.persisted).catch(() => {});
    }
  }
  // Subagent linkage: an explicit parentSessionId on the event wins;
  // otherwise on session_start, look for a recently-fired Task in this cwd.
  const explicitParent = event.payload.parentSessionId as string | undefined;
  if (explicitParent && !unit.parentSessionId) {
    unit.parentSessionId = explicitParent;
  } else if (event.kind === "session_start" && !unit.parentSessionId) {
    const now = event.timestamp;
    while (
      _pendingTasks.length > 0 &&
      now - _pendingTasks[0].time > PARENT_LINK_WINDOW_MS
    ) {
      _pendingTasks.shift();
    }
    const match = _pendingTasks.find(
      (p) => p.cwd === event.cwd && p.parentSessionId !== id
    );
    if (match) unit.parentSessionId = match.parentSessionId;
  }
  // Record pending Task call so the next session_start in this cwd can link.
  if (
    (event.kind === "tool_use" || event.kind === "permission_request") &&
    typeof event.payload.name === "string" &&
    TASK_NAMES.has(event.payload.name)
  ) {
    _pendingTasks.push({
      parentSessionId: id,
      cwd: event.cwd,
      time: event.timestamp,
    });
  }
  unit.role = role;
  unit.lastActivity = event.timestamp;
  unit.lastTool = lastToolName;
  unit.cwd = event.cwd;
  unit.worldId = worldId;
  switch (event.kind) {
    case "session_start":
      unit.status = "idle";
      unit.hp = 100;
      unit.mp = 100;
      break;
    case "session_end":
      unit.status = unit.hp <= 0 ? "fallen" : "complete";
      _streaks.delete(id);
      break;
    case "subagent_spawn":
      // No archetype change — drive form (Final) is the visual cue
      // that a subagent was summoned. Two-keyblader system doesn't
      // have a third archetype to promote into.
      break;
    case "tool_use": {
      unit.status = event.payload.name === "Bash" ? "casting" : "working";
      unit.mp = Math.max(0, unit.mp - mpCostForToolUse(String(event.payload.name ?? "")));
      // Track for stuck-loop detection (Q10 + #13a).
      const now = event.timestamp;
      const list = _recentTools.get(id) ?? [];
      list.push({
        ts: now,
        toolName: String(event.payload.name ?? "?"),
        argKey: argKeyFor(event.payload.input),
      });
      // Trim to window
      const trimmed = list.filter((e) => now - e.ts <= STUCK_WINDOW_MS);
      _recentTools.set(id, trimmed);
      _consecutiveTools.set(id, (_consecutiveTools.get(id) ?? 0) + 1);
      break;
    }
    case "tool_result": {
      unit.status = "idle";
      // Extra MP drain proportional to output size — heavy file reads
      // and verbose Bash output cost more than empty acknowledgements.
      const extra = mpCostForToolResult(event.payload.output);
      if (extra > 0) {
        unit.mp = Math.max(0, unit.mp - extra);
      }
      break;
    }
    case "assistant_text":
      // Reset consecutive-tools counter — the wielder is thinking, not
      // mashing the same button.
      _consecutiveTools.set(id, 0);
      break;
    case "error":
      unit.hp = Math.max(0, unit.hp - 12);
      if (unit.hp <= 0) unit.status = "fallen";
      break;
    case "user_prompt":
      unit.status = "working";
      break;
  }

  // Drive form streak tracking. Update counters first, then ask
  // chooseDriveForm whether this event triggers a transformation.
  const streak = getStreak(id);
  if (event.kind === "tool_result") {
    streak.successCount += 1;
  } else if (event.kind === "error") {
    streak.successCount = 0;
    streak.bashCount = 0;
    streak.bashSince = 0;
  } else if (
    event.kind === "tool_use" &&
    typeof event.payload.name === "string" &&
    BASH_NAMES.has(event.payload.name)
  ) {
    if (
      streak.bashSince === 0 ||
      event.timestamp - streak.bashSince > WISDOM_BASH_WINDOW_MS
    ) {
      streak.bashSince = event.timestamp;
      streak.bashCount = 1;
    } else {
      streak.bashCount += 1;
    }
  }
  const drive = chooseDriveForm(event, streak, unit.role);
  if (drive) {
    unit.driveForm = drive.form;
    unit.driveFormUntil = drive.until;
    if (drive.form === "valor") streak.successCount = 0;
  } else if (
    unit.driveFormUntil !== undefined &&
    event.timestamp > unit.driveFormUntil
  ) {
    unit.driveForm = undefined;
    unit.driveFormUntil = undefined;
  }
  // No parent-promotion in two-keyblader system — archetype is locked
  // per (tool, repoRoot). Subagent visualization is the Final drive
  // form on the parent + tether between sprites.
  const extraUnits: Record<string, UnitState> = {};

  const worlds = { ...state.worlds };
  const existingWorld = worlds[worldId];
  const unitIds = existingWorld
    ? Array.from(new Set([...existingWorld.unitIds, id]))
    : [id];

  let heartless = existingWorld?.heartless ?? [];
  heartless = expireHeartless(heartless, event.timestamp);
  let munny = existingWorld?.munny ?? 0;

  if (event.kind === "error") {
    // Errors are heartless invasions. Type biased by world theme + how
    // many heartless are already present (≈ how stressed this world is).
    const recentErrorCount = heartless.length + 1;
    heartless = spawnHeartless(heartless, worldId, id, 1, recentErrorCount);
  } else if (
    event.kind === "tool_result" &&
    lastToolName &&
    COMBAT_TOOL_RESULT_NAMES.has(lastToolName) &&
    heartless.length > 0
  ) {
    // Successful combat-relevant work pushes back the dark.
    heartless = killOldestHeartless(heartless);
    munny += MUNNY_PER_KILL;
  } else if (event.kind === "session_end" && unit.hp > 0) {
    // Victory clears any lingering shadows; defeat (hp=0) leaves them on
    // the field as a visible reminder that the world fell.
    heartless = [];
  }

  const nextWorld: WorldState = {
    id: worldId,
    path: worldPathFor(event),
    label: worldLabelFor(event),
    unitIds,
    heartless,
    munny,
    alertLevel: existingWorld?.alertLevel ?? "idle",
  };
  const nextUnits = { ...state.units, [id]: unit, ...extraUnits };
  nextWorld.alertLevel = computeAlertLevel(nextWorld, nextUnits);
  worlds[worldId] = nextWorld;

  // ── Letter generation (decision-moment signals) ────────────────
  let nextLetters = state.letters;
  // Letters use the wielder's auto-generated name, not the raw role
  // identifier ("keyblader1" → "Vaelen"/"Aren"/etc.).
  const palette = unit.displayName;

  // HP critical — once per session crossing the threshold.
  if (
    event.kind === "error" &&
    unit.hp > 0 &&
    unit.hp < HP_CRITICAL_THRESHOLD &&
    !_hpLowFor.has(id)
  ) {
    _hpLowFor.add(id);
    nextLetters = pushLetter(
      { ...state, letters: nextLetters },
      makeLetter("critical", `${palette} is in danger`, {
        body: `${palette} in ${nextWorld.label} dropped to ${unit.hp}HP. Comfort to restore.`,
        sessionId: id,
        worldId,
        actions: [
          { label: "♥ comfort (50µ)", action: { kind: "comfort", sessionId: id } },
          { label: "dismiss", action: { kind: "dismiss" } },
        ],
      })
    );
  }
  // Reset the marker if this unit recovers above threshold (so a future
  // crash refires the letter cleanly).
  if (event.kind !== "error" && unit.hp >= HP_CRITICAL_THRESHOLD) {
    _hpLowFor.delete(id);
  }

  // session_end → seal / iterate (clean exit) or fallen (KO).
  if (event.kind === "session_end") {
    if (unit.hp > 0) {
      play("letter");
      nextLetters = pushLetter(
        { ...state, letters: nextLetters },
        makeLetter("important", `${palette} finished in ${nextWorld.label}`, {
          body: "Plan complete? Seal the keyhole or iterate.",
          sessionId: id,
          worldId,
          actions: [
            { label: "✦ seal keyhole", action: { kind: "seal", worldId } },
            { label: "↻ iterate", action: { kind: "iterate", sessionId: id } },
            { label: "dismiss", action: { kind: "dismiss" } },
          ],
        })
      );
    } else {
      play("ko");
      nextLetters = pushLetter(
        { ...state, letters: nextLetters },
        makeLetter("critical", `${palette} fell in ${nextWorld.label}`, {
          body: "World needs help. Dispatch a new wielder.",
          sessionId: id,
          worldId,
          actions: [
            { label: "+ dispatch", action: { kind: "dispatch", worldId } },
            { label: "dismiss", action: { kind: "dismiss" } },
          ],
        })
      );
    }
  }

  // World transition into danger (one-shot per transition).
  const prevAlert = existingWorld?.alertLevel ?? "idle";
  if (prevAlert !== "danger" && nextWorld.alertLevel === "danger") {
    nextLetters = pushLetter(
      { ...state, letters: nextLetters },
      makeLetter("important", `${nextWorld.label} fell into danger`, {
        body: "Heartless are overwhelming the world.",
        worldId,
        actions: [{ label: "dismiss", action: { kind: "dismiss" } }],
      })
    );
  }

  // Permission request (Phase 2B #18) — Critical letter, no rate-limit
  // since each request is a distinct decision. Includes the tool name +
  // a short description of the input as context (#13c permission-context
  // sub-feature). The hook socket waits until the user answers or the
  // provider/app closes the request.
  if (event.kind === "permission_request" && event.payload.requestId) {
    const reqId = event.payload.requestId;
    const toolName = String(event.payload.name ?? "tool");
    const inputSummary = summarizePermissionInput(event.payload.input);
    const risk = classifyRisk(toolName, event.payload.input);
    // Walk events excluding the just-arrived permission_request itself.
    const reasoning = extractRecentReasoning(state.events, id);
    // Cursor letters are observational. Gemini BeforeTool letters are
    // actionable when the managed Gemini policy is installed: Keykeeper
    // decides, then Gemini's native policy auto-allows past its own prompt.
    const observeOnlyProvider = isObservationOnlyPermission(event);
    const providerLabel = event.tool === "gemini" ? "Gemini" : "Cursor";
    const title = observeOnlyProvider
      ? `${palette} asks to use ${toolName} (decide in ${providerLabel})`
      : `${palette} asks to use ${toolName}`;
    const body = observeOnlyProvider
      ? inputSummary
        ? `${toolName}: ${inputSummary} · approve in ${providerLabel}'s UI`
        : `Wielder is asking ${providerLabel} for permission to use ${toolName}. Decide in ${providerLabel}'s native yes/no.`
      : inputSummary
      ? `${toolName}: ${inputSummary}`
      : `Wielder is requesting permission to use ${toolName}.`;
    const actions: Letter["actions"] = observeOnlyProvider
      ? [{ label: "ack", action: { kind: "permission-observe", requestId: reqId } }]
      : [
          { label: "✓ allow", action: { kind: "permission-allow", requestId: reqId } },
          { label: "✗ deny", action: { kind: "permission-deny", requestId: reqId } },
          { label: "dismiss", action: { kind: "dismiss" } },
        ];
    nextLetters = pushLetter(
      { ...state, letters: nextLetters },
      makeLetter("critical", title, {
        body,
        sessionId: id,
        worldId,
        risk,
        reasoning: reasoning || undefined,
        actions,
      })
    );
  }

  // Permission resolved outside the GUI (timeout / socket error / user
  // answered Claude's terminal prompt). Drop any letter whose deny/allow
  // action carries the same requestId so we don't show stale buttons.
  if (event.kind === "permission_resolved" && event.payload.requestId) {
    const reqId = event.payload.requestId;
    nextLetters = nextLetters.filter((l) => {
      for (const a of l.actions) {
        if (
          (a.action.kind === "permission-allow" ||
            a.action.kind === "permission-deny") &&
          a.action.requestId === reqId
        ) {
          return false;
        }
      }
      return true;
    });
  }

  // Heuristic dismissal: if a tool_result, session_end, or fresh
  // permission_request arrives for the same session as a pending
  // permission letter that *predates* this event, the user resolved
  // the original ask elsewhere (their terminal prompt) — Claude moved
  // on to running the tool / ending / asking again. Drop the stale
  // letter so the GUI doesn't lag the bridge's 65s safety timer.
  if (
    event.kind === "tool_result" ||
    event.kind === "session_end" ||
    event.kind === "permission_request"
  ) {
    const sessId = event.sessionId;
    const ts = event.timestamp;
    nextLetters = nextLetters.filter((l) => {
      if (l.sessionId !== sessId) return true;
      if (l.createdAt >= ts) return true; // not older than this event
      const isPermLetter = l.actions.some(
        (a) =>
          a.action.kind === "permission-allow" ||
          a.action.kind === "permission-deny" ||
          a.action.kind === "permission-observe"
      );
      if (!isPermLetter) return true;
      // For permission_request: only drop if this is a *different*
      // request, otherwise the just-created letter would be filtered.
      if (event.kind === "permission_request" && event.payload.requestId) {
        const newReqId = event.payload.requestId;
        const matchesThisReq = l.actions.some(
          (a) =>
            (a.action.kind === "permission-allow" ||
              a.action.kind === "permission-deny" ||
              a.action.kind === "permission-observe") &&
            a.action.requestId === newReqId
        );
        if (matchesThisReq) return true;
      }
      return false;
    });
  }

  // Stuck loop — notable letter, rate-limited per session (Q10 + #13a).
  if (event.kind === "tool_use") {
    const stuck = detectStuckLoop(id);
    const lastSent = _stuckLetterAt.get(id) ?? 0;
    if (stuck && event.timestamp - lastSent > STUCK_LETTER_COOLDOWN_MS) {
      _stuckLetterAt.set(id, event.timestamp);
      nextLetters = pushLetter(
        { ...state, letters: nextLetters },
        makeLetter("notable", `${palette} may be stuck`, {
          body: `${palette} ${stuck.reason}. Send a hint or let them work?`,
          sessionId: id,
          worldId,
          actions: [
            { label: "send hint", action: { kind: "send-word", sessionId: id } },
            { label: "dismiss", action: { kind: "dismiss" } },
          ],
        })
      );
    }
  }

  // Drive activation — notable, info only.
  if (drive && unit.driveForm) {
    play("drive");
    nextLetters = pushLetter(
      { ...state, letters: nextLetters },
      makeLetter("notable", `${palette} entered ${unit.driveForm.toUpperCase()} FORM`, {
        sessionId: id,
        worldId,
        actions: [{ label: "dismiss", action: { kind: "dismiss" } }],
      })
    );
  }

  // Bind any unbound persisted Standing Orders to this wielder if its
  // identity matches. Lets a Standing Order survive an app restart and
  // resume the moment its target session reappears.
  const identity = unitIdentityFor(event.tool, repoRootStable);
  let nextOrders = state.standingOrders;
  for (const o of Object.values(state.standingOrders)) {
    if (!o.unitId && o.unitIdentity === identity && o.status === "active") {
      nextOrders = { ...nextOrders, [o.id]: { ...o, unitId: id } };
    }
  }

  return {
    events,
    eventCount,
    units: nextUnits,
    worlds,
    letters: nextLetters,
    standingOrders: nextOrders,
  };
}


export const useStore = create<Store>((set) => ({
  events: [],
  eventCount: 0,
  units: {},
  worlds: {},
  selectedUnitId: null,
  activeWorldId: null,
  mutedSessionIds: loadMuted(),
  persisted: EMPTY_PERSISTED,
  letters: [],
  cameraTarget: null,
  cameraTargetVersion: 0,
  decreeUnitId: null,
  standingOrders: {},

  ingest(event) {
    _queue.push(event);
    if (_flushScheduled) return;
    _flushScheduled = true;
    requestAnimationFrame(() => {
      _flushScheduled = false;
      const batch = _queue.splice(0);
      set((state) => {
        let next: Store = state;
        for (const ev of batch) {
          const delta = applyOneEvent(next, ev);
          next = { ...next, ...delta };
        }
        return next;
      });
    });
  },

  selectUnit(id) {
    if (id) play("select");
    set({ selectedUnitId: id });
  },
  selectWorld(id) {
    // In the unified-map architecture, "selecting a world" means panning
    // the camera to that world on the Star Chart. The activeWorldId field
    // is preserved for legacy callers but Q40 made the camera target the
    // primary signal.
    set((s) => ({
      activeWorldId: id,
      cameraTarget: id,
      cameraTargetVersion: id ? s.cameraTargetVersion + 1 : s.cameraTargetVersion,
    }));
  },
  setCameraTarget(worldId) {
    set((s) => ({
      cameraTarget: worldId,
      cameraTargetVersion: s.cameraTargetVersion + 1,
    }));
  },
  openDecreeFor(unitId) {
    set({ decreeUnitId: unitId });
  },
  closeDecree() {
    set({ decreeUnitId: null });
  },
  startStandingOrder(unitId, prompt, intervalMs, maxIterations = 24) {
    const now = Date.now();
    const id = `so-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const unit = useStore.getState().units[unitId];
    // Identity must match the bus-stamped repoRoot used by applyOneEvent
    // when rebinding orders to wielders on restart. Earlier bug: this
    // used `unit.cwd`, which differs from `event.repoRoot` whenever the
    // session started in a subdirectory of a repo — order persisted
    // but never re-attached. Fall back to cwd for units that pre-date
    // the repoRoot field on UnitState.
    const order = createStandingOrder({
      id,
      unitId,
      unit,
      prompt,
      intervalMs,
      maxIterations,
      now,
    });
    set((s) => {
      const standingOrders = { ...s.standingOrders, [id]: order };
      const nextPersisted = {
        ...s.persisted,
        standingOrders: ordersToPersisted(standingOrders),
      };
      void window.kh.savePersisted(nextPersisted).catch(() => {});
      return { standingOrders, persisted: nextPersisted };
    });
    return id;
  },
  recordOrderTick(orderId, ok) {
    set((s) => {
      const standingOrders = recordStandingOrderTickById(
        s.standingOrders,
        orderId,
        ok,
        Date.now()
      );
      if (!standingOrders) return s;
      const nextPersisted = {
        ...s.persisted,
        standingOrders: ordersToPersisted(standingOrders),
      };
      void window.kh.savePersisted(nextPersisted).catch(() => {});
      return { standingOrders, persisted: nextPersisted };
    });
  },
  haltStandingOrder(orderId) {
    set((s) => {
      const standingOrders = haltStandingOrderById(s.standingOrders, orderId);
      if (!standingOrders) return s;
      const nextPersisted = {
        ...s.persisted,
        standingOrders: ordersToPersisted(standingOrders),
      };
      void window.kh.savePersisted(nextPersisted).catch(() => {});
      return { standingOrders, persisted: nextPersisted };
    });
  },
  toggleMute(sessionId) {
    set((state) => {
      const next = { ...state.mutedSessionIds };
      if (next[sessionId]) delete next[sessionId];
      else next[sessionId] = true;
      saveMuted(next);
      return { mutedSessionIds: next };
    });
  },
  hydratePersisted(persisted) {
    // Restore Standing Orders from disk. They come in with stale unitIds
    // (the prior session's), so we re-create them with empty unitId and
    // let applyOneEvent bind them when a wielder with matching identity
    // appears. Only "active" orders survive (halted/exhausted/failed
    // were terminal states).
    const standingOrders = hydrateStandingOrders(persisted.standingOrders ?? []);
    set({ persisted, standingOrders });
  },
  comfort(sessionId) {
    const state = useStore.getState();
    const unit = state.units[sessionId];
    if (!unit) return "no-munny";
    if (unit.status === "fallen") return "fallen";
    if (unit.hp >= 100) return "full-hp";
    const now = Date.now();
    const cd = _comfortCooldown.get(sessionId) ?? 0;
    if (now < cd) return "cooldown";
    const world = state.worlds[unit.worldId];
    if (!world || world.munny < COMFORT_COST) return "no-munny";
    _comfortCooldown.set(sessionId, now + COMFORT_COOLDOWN_MS);
    play("comfort");
    set((s) => {
      const u = s.units[sessionId];
      const w = s.worlds[unit.worldId];
      if (!u || !w) return s;
      return {
        units: {
          ...s.units,
          [sessionId]: { ...u, hp: Math.min(100, u.hp + COMFORT_HP) },
        },
        worlds: {
          ...s.worlds,
          [unit.worldId]: { ...w, munny: w.munny - COMFORT_COST },
        },
      };
    });
    return "ok";
  },
  dismissLetter(letterId) {
    set((s) => ({ letters: s.letters.filter((l) => l.id !== letterId) }));
  },
  /** Drop every informational letter at once. Permission letters
   * (alerts) are preserved — those are decisions, not history. */
  dismissInformationalLetters() {
    set((s) => ({
      letters: dismissInformationalLetters(s.letters),
    }));
  },
  applyLetterAction(letter, action) {
    const s = useStore.getState();
    switch (action.kind) {
      case "dive":
        s.selectWorld(action.worldId);
        break;
      case "comfort":
        s.comfort(action.sessionId);
        break;
      case "seal":
        s.sealKeyhole(action.worldId);
        break;
      case "iterate":
        // For v1: just dismiss; the user manually issues a follow-up via
        // CommandInput. Wired more deeply in polish phase (modal pre-fill).
        break;
      case "dispatch":
        // Send the user to the gummi map / world to dispatch. Cinematic
        // dispatch flow comes in P9.
        s.selectWorld(action.worldId);
        break;
      case "send-word":
        // Stub; CommandInput is the main path for now.
        break;
      case "recall":
        void window.kh.killAgent(action.sessionId).catch(() => {});
        break;
      case "permission-allow":
      case "permission-deny":
        {
          const req = permissionResolutionForAction(action);
          if (req) void window.kh.resolvePermission(req).catch(() => {});
        }
        break;
      case "permission-observe":
        // Observation-only provider letters — no upstream resolution;
        // just dismiss locally.
        break;
      case "dismiss":
        break;
    }
    s.dismissLetter(letter.id);
  },
  sealKeyhole(worldId) {
    play("seal");
    // Pan the unified-map camera to the sealed world so the fanfare
    // (gold-keyhole materialization) plays in context.
    set((s) => ({
      cameraTarget: worldId,
      cameraTargetVersion: s.cameraTargetVersion + 1,
    }));
    set((state) => {
      const world = state.worlds[worldId];
      if (!world) return state;
      const repoRoot = world.path;
      const existingWorld = state.persisted.worlds[repoRoot];

      // Bump seals on every wielder currently in this world.
      const nextWielders = { ...state.persisted.wielders };
      for (const unitId of world.unitIds) {
        const unit = state.units[unitId];
        if (!unit) continue;
        const identity = unitIdentityForUnit(unit);
        const prior = nextWielders[identity];
        if (prior) {
          nextWielders[identity] = {
            ...prior,
            seals: prior.seals + 1,
            lastSeen: Date.now(),
          };
        }
      }

      const nextPersisted: PersistedState = {
        ...state.persisted,
        wielders: nextWielders,
        worlds: {
          ...state.persisted.worlds,
          [repoRoot]: {
            repoRoot,
            lastVisit: existingWorld?.lastVisit ?? Date.now(),
            totalSeals: (existingWorld?.totalSeals ?? 0) + 1,
            totalClears: (existingWorld?.totalClears ?? 0) + 1,
            totalFalls: existingWorld?.totalFalls ?? 0,
            sealedAt: Date.now(),
          },
        },
      };
      // Persist out — main writes JSON debounced.
      void window.kh.savePersisted(nextPersisted).catch(() => {});
      // Mark the live world as cleared too.
      const nextWorlds = { ...state.worlds };
      nextWorlds[worldId] = { ...world, alertLevel: "cleared", heartless: [] };
      return { persisted: nextPersisted, worlds: nextWorlds };
    });
  },
  async resetKingdom() {
    const fresh = await window.kh.resetPersisted();
    set({ persisted: fresh });
  },
}));

// Listen for unit lifecycle events to maintain the persisted wielder /
// world stats. Subscribed once; lives until the page unloads.
let _lastEventCount = -1;
let _persistDebounce: ReturnType<typeof setTimeout> | null = null;
useStore.subscribe((state) => {
  const ec = state.eventCount;
  if (ec === _lastEventCount) return;
  _lastEventCount = ec;
  if (_persistDebounce) clearTimeout(_persistDebounce);
  _persistDebounce = setTimeout(() => {
    const s = useStore.getState();
    // Compute lifetime munny = sum of current world.munny + previously-sealed
    // worlds' baked totals. Cheap approximation: take current per-world munny.
    let live = 0;
    for (const w of Object.values(s.worlds)) live += w.munny;
    const next: PersistedState = {
      ...s.persisted,
      totalMunnyEver: Math.max(s.persisted.totalMunnyEver, live),
    };
    if (next !== s.persisted) {
      void window.kh.savePersisted(next).catch(() => {});
      useStore.setState({ persisted: next });
    }
  }, 1000);
});
