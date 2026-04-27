import { create } from "zustand";
import type {
  AgentEvent,
  UnitState,
  UnitRole,
  WorldState,
  Heartless,
  WorldAlertLevel,
  DriveForm,
} from "@shared/events";
import { ROLE_BY_TOOL, ROLE_FALLBACK } from "@shared/events";
import { play } from "./audio/sounds";


type Store = {
  events: AgentEvent[];
  eventCount: number;
  units: Record<string, UnitState>;
  worlds: Record<string, WorldState>;
  selectedUnitId: string | null;
  activeWorldId: string | null;
  mutedSessionIds: Record<string, true>;

  ingest(event: AgentEvent): void;
  selectUnit(id: string | null): void;
  selectWorld(id: string | null): void;
  toggleMute(sessionId: string): void;
};

const MUTED_KEY = "kh-rts:muted-sessions";
function loadMuted(): Record<string, true> {
  try {
    const raw = localStorage.getItem(MUTED_KEY);
    if (!raw) return {};
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return {};
    const out: Record<string, true> = {};
    for (const id of arr) if (typeof id === "string") out[id] = true;
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

function spawnHeartless(
  list: Heartless[],
  worldId: string,
  targetUnitId: string | undefined,
  count: number
): Heartless[] {
  const next = [...list];
  for (let i = 0; i < count && next.length < HEARTLESS_LIMIT; i++) {
    next.push({
      id: newHeartlessId(worldId),
      type: "shadow",
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

// Read-only / observation tools don't "fight back" — they don't clear
// heartless. Only concrete progress (edits, shells, web fetches, summons,
// long results) does. Tool names span all three rosters.
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

function roleFor(
  tool: AgentEvent["tool"],
  lastToolName?: string,
  current?: UnitRole
): UnitRole {
  if (lastToolName) {
    const map = ROLE_BY_TOOL[tool];
    const matched = map?.[lastToolName];
    if (matched) return matched;
  }
  return current ?? ROLE_FALLBACK[tool];
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
const TASK_NAMES = new Set(["Task", "Agent", "task_v2", "task"]);

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
  currentRole: UnitRole
): { form: DriveForm; until: number } | null {
  // Final Form is reserved for subagent spawns — Mickey + Sora pair-up.
  if (event.kind === "subagent_spawn" || currentRole === "mickey") {
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
  const role = roleFor(event.tool, lastToolName, existing?.role);
  const unit: UnitState = existing
    ? { ...existing }
    : {
        id,
        sessionId: id,
        tool: event.tool,
        role,
        cwd: event.cwd,
        worldId,
        hp: 100,
        mp: 100,
        status: "idle",
        lastActivity: event.timestamp,
        spawnedHere: false,
      };
  if (event.kind === "session_start" && event.source === "spawned") {
    unit.spawnedHere = true;
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
    event.kind === "tool_use" &&
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
      // Hook bridge maps Claude's SubagentStop here. Promote the parent
      // (this unit) to Mickey — the king summoning his court back.
      if (unit.tool === "claude") unit.role = "mickey";
      break;
    case "tool_use":
      unit.status = event.payload.name === "Bash" ? "casting" : "working";
      unit.mp = Math.max(0, unit.mp - 4);
      break;
    case "tool_result":
      unit.status = "idle";
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
  // If a subagent (this unit has a parent) just ended, promote the parent
  // to Mickey to mark "court returned to the king".
  const extraUnits: Record<string, UnitState> = {};
  if (
    event.kind === "session_end" &&
    unit.parentSessionId &&
    unit.tool === "claude"
  ) {
    const parent = state.units[unit.parentSessionId];
    if (parent && parent.role !== "mickey") {
      extraUnits[unit.parentSessionId] = { ...parent, role: "mickey" };
    }
  }

  const worlds = { ...state.worlds };
  const existingWorld = worlds[worldId];
  const unitIds = existingWorld
    ? Array.from(new Set([...existingWorld.unitIds, id]))
    : [id];

  let heartless = existingWorld?.heartless ?? [];
  heartless = expireHeartless(heartless, event.timestamp);
  let munny = existingWorld?.munny ?? 0;

  if (event.kind === "error") {
    // Errors are heartless invasions. Spawn one shadow targeting this unit.
    heartless = spawnHeartless(heartless, worldId, id, 1);
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

  return {
    events,
    eventCount,
    units: nextUnits,
    worlds,
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
    set({ activeWorldId: id });
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
}));
