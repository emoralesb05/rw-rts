import type {
  AgentEvent,
  WardenAura,
  Riftling,
  Letter,
  PersistedState,
  UnitRole,
  UnitState,
  WorldState,
} from "@shared/events";
import { archetypeFor, nameFor } from "@shared/events";
import { play } from "../audio/sounds";
import { unitIdentityFor } from "../unit-identity";
import { mpCostForToolResult, mpCostForToolUse } from "./combat";
import {
  argKeyForToolInput,
  classifyPermissionRisk,
  extractRecentReasoning,
  isObservationOnlyPermission,
  isPermissionLetter,
  permissionActionsForEvent,
  summarizePermissionInput,
} from "./permissions";
import {
  bindStandingOrdersForUnit,
  type StandingOrder,
} from "./standing-orders";
import {
  computeAlertLevel,
  worldIdForEvent,
  worldLabelForEvent,
  worldPathForEvent,
} from "./worlds";

export type EventReducerState = {
  events: AgentEvent[];
  eventCount: number;
  units: Record<string, UnitState>;
  worlds: Record<string, WorldState>;
  persisted: PersistedState;
  letters: Letter[];
  standingOrders: Record<string, StandingOrder>;
};

const MAX_EVENTS = 500;

// Combat tuning. Riftling TTL = how long a mob lingers if the unit ignores
// it (long enough to feel threatening, short enough to not pile up forever).
// RIFTLING_LIMIT caps the on-screen mob count per world so a flapping error
// stream can't spawn 1000 shadows.
const RIFTLING_TTL_MS = 30_000;
const RIFTLING_LIMIT = 12;
const GLIMMER_PER_CLEAR = 5;

function newRiftlingId(worldId: string): string {
  return `h-${worldId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// Per-theme riftling mix — used by store to pick which riftling
// type spawns when an error fires.
const RIFTLING_MIX_BY_THEME: Record<
  string,
  { shadow: number; soldier: number; bulwark: number }
> = {
  citadel: { shadow: 0.7, soldier: 0.3, bulwark: 0 },
  bastion: { shadow: 0.3, soldier: 0.5, bulwark: 0.2 },
  crossroads: { shadow: 0.6, soldier: 0.35, bulwark: 0.05 },
  tide: { shadow: 0.95, soldier: 0.05, bulwark: 0 },
  dusk: { shadow: 0.5, soldier: 0.45, bulwark: 0.05 },
  lantern: { shadow: 0.7, soldier: 0.25, bulwark: 0.05 },
};

function pickRiftlingType(
  worldId: string,
  recentErrorCount: number
): "shadow" | "soldier" | "bulwark" {
  // Re-derive theme from worldId via the same hash realm-worlds uses,
  // without importing the renderer-only module here.
  let h = 0;
  for (let i = 0; i < worldId.length; i++) {
    h = (Math.imul(31, h) + worldId.charCodeAt(i)) | 0;
  }
  const themes = [
    "citadel",
    "bastion",
    "crossroads",
    "tide",
    "dusk",
    "lantern",
  ];
  const theme = themes[Math.abs(h) % themes.length];
  const mix = RIFTLING_MIX_BY_THEME[theme] ?? RIFTLING_MIX_BY_THEME.citadel;

  // Trigger escalation: if errors are stacking up, bias toward bigger
  // riftling even on lighter-themed worlds.
  let shadowW = mix.shadow;
  let soldierW = mix.soldier;
  let largeW = mix.bulwark;
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
  return "bulwark";
}

function spawnRiftling(
  list: Riftling[],
  worldId: string,
  targetUnitId: string | undefined,
  count: number,
  recentErrorCount = 1
): Riftling[] {
  const next = [...list];
  for (let i = 0; i < count && next.length < RIFTLING_LIMIT; i++) {
    next.push({
      id: newRiftlingId(worldId),
      type: pickRiftlingType(worldId, recentErrorCount),
      worldId,
      targetUnitId,
      hp: 1,
      spawnedAt: Date.now(),
    });
  }
  return next;
}

function expireRiftling(list: Riftling[], now: number): Riftling[] {
  if (list.length === 0) return list;
  const cutoff = now - RIFTLING_TTL_MS;
  let changed = false;
  const next: Riftling[] = [];
  for (const h of list) {
    if (h.spawnedAt < cutoff) {
      changed = true;
      continue;
    }
    next.push(h);
  }
  return changed ? next : list;
}

function killOldestRiftling(list: Riftling[]): Riftling[] {
  if (list.length === 0) return list;
  return list.slice(1);
}

// Letters cap — keeps the throne feed bounded.
const MAX_LETTERS = 50;
const HP_CRITICAL_THRESHOLD = 25;

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
 * Walk the recent tool window for a session; if a (tool, argKey) pair
 * appeared >= STUCK_THRESHOLD times OR the consecutive-tools count
 * crossed the threshold, return a description for the stuck-loop
 * letter. Otherwise null.
 */
function detectStuckLoop(
  sessionId: string
): { reason: string; toolName: string } | null {
  const list = _recentTools.get(sessionId) ?? [];
  // Same (tool, arg) repeat detection
  const counts = new Map<
    string,
    { count: number; toolName: string; argKey: string }
  >();
  for (const e of list) {
    const k = `${e.toolName}|${e.argKey}`;
    const cur = counts.get(k) ?? {
      count: 0,
      toolName: e.toolName,
      argKey: e.argKey,
    };
    cur.count += 1;
    counts.set(k, cur);
  }
  let topPair: { count: number; toolName: string; argKey: string } | null =
    null;
  for (const v of counts.values()) {
    if (!topPair || v.count > topPair.count) {
      topPair = v;
    }
  }
  if (topPair && topPair.count >= STUCK_THRESHOLD) {
    const argHuman = topPair.argKey.startsWith("file:")
      ? "`" + topPair.argKey.slice(5) + "`"
      : topPair.argKey.startsWith("cmd:")
        ? "command `" + topPair.argKey.slice(4) + "`"
        : topPair.argKey.startsWith("glob:")
          ? "pattern `" + topPair.argKey.slice(5) + "`"
          : topPair.argKey.startsWith("url:")
            ? "URL `" + topPair.argKey.slice(4) + "`"
            : "the same input";
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
function pushLetter(state: EventReducerState, letter: Letter): Letter[] {
  let next = state.letters;
  if (!isPermissionLetter(letter) && letter.sessionId) {
    const sid = letter.sessionId;
    next = next.filter((l) => l.sessionId !== sid || isPermissionLetter(l));
  }
  return [letter, ...next].slice(0, MAX_LETTERS);
}

// Read-only / observation tools don't "fight back" — they don't clear
// riftling. Only concrete progress (edits, shells, web fetches, summons,
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

// Four-warden system: archetype is locked per (tool, repoRoot)
// wielder identity, not per tool-call. The same wielder always renders
// the same archetype + name across sessions.
function roleFor(
  tool: AgentEvent["tool"],
  repoRoot: string,
  current?: UnitRole
): UnitRole {
  return current ?? archetypeFor(tool, repoRoot);
}

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

// Aura-state streak tracking. Per-session counters that reset on error or
// session_end. Kept off UnitState because they're transient simulation
// state, not data the UI needs to read.
type StreakState = {
  successCount: number;
  bashCount: number;
  bashSince: number;
};
const _streaks = new Map<string, StreakState>();
const GUARD_THRESHOLD = 5;
const FOCUS_BASH_COUNT = 3;
const FOCUS_BASH_WINDOW_MS = 10_000;
const AURA_DURATION_MS = 14_000;
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

function chooseWardenAura(
  event: AgentEvent,
  streak: StreakState,
  _currentRole: UnitRole
): { form: WardenAura; until: number } | null {
  // Link aura is reserved for subagent spawns.
  if (event.kind === "subagent_spawn") {
    return { form: "link", until: event.timestamp + AURA_DURATION_MS };
  }
  // Focus aura: a burst of shells/bash within FOCUS_BASH_WINDOW_MS.
  if (
    event.kind === "tool_use" &&
    typeof event.payload.name === "string" &&
    BASH_NAMES.has(event.payload.name)
  ) {
    if (
      streak.bashSince > 0 &&
      event.timestamp - streak.bashSince <= FOCUS_BASH_WINDOW_MS &&
      streak.bashCount >= FOCUS_BASH_COUNT
    ) {
      return { form: "focus", until: event.timestamp + AURA_DURATION_MS };
    }
  }
  // Guard aura: streak of clean tool_results. Only awarded once threshold met.
  if (event.kind === "tool_result" && streak.successCount >= GUARD_THRESHOLD) {
    return { form: "guard", until: event.timestamp + AURA_DURATION_MS };
  }
  return null;
}

export function applyOneEvent(
  state: EventReducerState,
  event: AgentEvent
): Partial<EventReducerState> {
  const id = event.sessionId;
  const worldId = worldIdForEvent(event);
  const events = [event, ...state.events].slice(0, MAX_EVENTS);
  const eventCount = state.eventCount + 1;
  const existing = state.units[id];
  const lastToolName =
    event.kind === "tool_use"
      ? (event.payload.name as string | undefined)
      : existing?.lastTool;
  // Wielder identity = (tool, repoRoot) — determines both archetype + name.
  const repoRootStable = event.repoRoot ?? event.cwd;
  const role = roleFor(event.tool, repoRootStable, existing?.role);
  const displayName =
    existing?.displayName ?? nameFor(role, event.tool, repoRootStable);
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
            totalGlimmer: prior?.totalGlimmer ?? 0,
            lastSeen: event.timestamp,
          },
        },
      },
    };
    void window.rw.savePersisted(state.persisted).catch(() => {});
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
      void window.rw.savePersisted(state.persisted).catch(() => {});
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
    if (match) {
      unit.parentSessionId = match.parentSessionId;
    }
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
      // No archetype change — the Link aura is the visual cue
      // that a subagent was summoned. Two-warden system doesn't
      // have a third archetype to promote into.
      break;
    case "tool_use": {
      unit.status = event.payload.name === "Bash" ? "casting" : "working";
      unit.mp = Math.max(
        0,
        unit.mp - mpCostForToolUse(String(event.payload.name ?? ""))
      );
      // Track for stuck-loop detection (Q10 + #13a).
      const now = event.timestamp;
      const list = _recentTools.get(id) ?? [];
      list.push({
        ts: now,
        toolName: String(event.payload.name ?? "?"),
        argKey: argKeyForToolInput(event.payload.input),
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
      if (unit.hp <= 0) {
        unit.status = "fallen";
      }
      break;
    case "user_prompt":
      unit.status = "working";
      break;
  }

  // Aura-state streak tracking. Update counters first, then ask
  // chooseWardenAura whether this event triggers a transformation.
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
      event.timestamp - streak.bashSince > FOCUS_BASH_WINDOW_MS
    ) {
      streak.bashSince = event.timestamp;
      streak.bashCount = 1;
    } else {
      streak.bashCount += 1;
    }
  }
  const aura = chooseWardenAura(event, streak, unit.role);
  if (aura) {
    unit.auraState = aura.form;
    unit.auraUntil = aura.until;
    if (aura.form === "guard") {
      streak.successCount = 0;
    }
  } else if (unit.auraUntil !== undefined && event.timestamp > unit.auraUntil) {
    unit.auraState = undefined;
    unit.auraUntil = undefined;
  }
  // No parent-promotion in two-warden system — archetype is locked
  // per (tool, repoRoot). Subagent visualization is the Link aura
  // form on the parent + tether between sprites.
  const extraUnits: Record<string, UnitState> = {};

  const worlds = { ...state.worlds };
  const existingWorld = worlds[worldId];
  const unitIds = existingWorld
    ? Array.from(new Set([...existingWorld.unitIds, id]))
    : [id];

  let riftling = existingWorld?.riftling ?? [];
  riftling = expireRiftling(riftling, event.timestamp);
  let glimmer = existingWorld?.glimmer ?? 0;

  if (event.kind === "error") {
    // Errors are riftling invasions. Type biased by world theme + how
    // many riftling are already present (≈ how stressed this world is).
    const recentErrorCount = riftling.length + 1;
    riftling = spawnRiftling(riftling, worldId, id, 1, recentErrorCount);
  } else if (
    event.kind === "tool_result" &&
    lastToolName &&
    COMBAT_TOOL_RESULT_NAMES.has(lastToolName) &&
    riftling.length > 0
  ) {
    // Successful combat-relevant work pushes back the dark.
    riftling = killOldestRiftling(riftling);
    glimmer += GLIMMER_PER_CLEAR;
  } else if (event.kind === "session_end" && unit.hp > 0) {
    // Victory clears any lingering shadows; defeat (hp=0) leaves them on
    // the field as a visible reminder that the world fell.
    riftling = [];
  }

  const nextWorld: WorldState = {
    id: worldId,
    path: worldPathForEvent(event),
    label: worldLabelForEvent(event),
    unitIds,
    riftling,
    glimmer,
    alertLevel: existingWorld?.alertLevel ?? "idle",
  };
  const nextUnits = { ...state.units, [id]: unit, ...extraUnits };
  nextWorld.alertLevel = computeAlertLevel(nextWorld, nextUnits);
  worlds[worldId] = nextWorld;

  // -- Letter generation (decision-moment signals)
  let nextLetters = state.letters;
  // Letters use the wielder's auto-generated name, not the raw role
  // identifier ("warden1" -> "Vaelen"/"Aren"/etc.).
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
          {
            label: "♥ comfort (50✧)",
            action: { kind: "comfort", sessionId: id },
          },
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

  // session_end -> seal / iterate (clean exit) or fallen (KO).
  if (event.kind === "session_end") {
    if (unit.hp > 0) {
      play("letter");
      nextLetters = pushLetter(
        { ...state, letters: nextLetters },
        makeLetter("important", `${palette} finished in ${nextWorld.label}`, {
          body: "Plan complete? Seal the realm or iterate.",
          sessionId: id,
          worldId,
          actions: [
            { label: "✦ seal realm", action: { kind: "seal", worldId } },
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
        body: "Riftling are overwhelming the world.",
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
    const toolName = String(event.payload.name ?? "tool");
    const inputSummary = summarizePermissionInput(event.payload.input);
    const risk = classifyPermissionRisk(toolName, event.payload.input);
    // Walk events excluding the just-arrived permission_request itself.
    const reasoning = extractRecentReasoning(state.events, id);
    // Cursor letters are observational. Gemini BeforeTool letters are
    // actionable when the managed Gemini policy is installed: Realmkeeper
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
      ? permissionActionsForEvent(event)
      : [
          ...permissionActionsForEvent(event),
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
      if (l.sessionId !== sessId) {
        return true;
      }
      if (l.createdAt >= ts) {
        return true;
      }
      const isPermLetter = l.actions.some(
        (a) =>
          a.action.kind === "permission-allow" ||
          a.action.kind === "permission-deny" ||
          a.action.kind === "permission-observe"
      );
      if (!isPermLetter) {
        return true;
      }
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
        if (matchesThisReq) {
          return true;
        }
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
            {
              label: "send hint",
              action: { kind: "send-word", sessionId: id },
            },
            { label: "dismiss", action: { kind: "dismiss" } },
          ],
        })
      );
    }
  }

  // Aura activation — notable, info only.
  if (aura && unit.auraState) {
    play("aura");
    nextLetters = pushLetter(
      { ...state, letters: nextLetters },
      makeLetter(
        "notable",
        `${palette} entered ${unit.auraState.toUpperCase()} AURA`,
        {
          sessionId: id,
          worldId,
          actions: [{ label: "dismiss", action: { kind: "dismiss" } }],
        }
      )
    );
  }

  // Bind any unbound persisted Standing Orders to this wielder if its
  // identity matches. Lets a Standing Order survive an app restart and
  // resume the moment its target session reappears.
  const nextOrders = bindStandingOrdersForUnit(state.standingOrders, unit);

  return {
    events,
    eventCount,
    units: nextUnits,
    worlds,
    persisted: state.persisted,
    letters: nextLetters,
    standingOrders: nextOrders,
  };
}
