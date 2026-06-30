import { create } from "zustand";
import type {
  AgentEvent,
  UnitState,
  WorldState,
  PersistedState,
  Letter,
  LetterAction,
} from "@shared/events";
import { EMPTY_PERSISTED } from "@shared/events";
import { MutedSessionIdsSchema } from "@shared/schemas";
import { play } from "./audio/sounds";
import { applyOneEvent } from "./store-domain/event-reducer";
import {
  dismissInformationalLetters,
  isPermissionChoiceAction,
  permissionResolutionForAction,
  userInputResolutionForAction,
} from "./store-domain/permissions";
import {
  createStandingOrder,
  haltStandingOrderById,
  hydrateStandingOrders,
  ordersToPersisted,
  recordStandingOrderTickById,
  type StandingOrder,
} from "./store-domain/standing-orders";
import { unitIdentityForUnit } from "./unit-identity";

export { unitIdentityFor, unitIdentityForUnit } from "./unit-identity";

export type ComfortReceipt =
  | "ok"
  | "no-glimmer"
  | "cooldown"
  | "full-hp"
  | "fallen";

export type WorldCommandAnchor = {
  worldId: string;
  x: number;
  y: number;
  worldX: number;
  worldY: number;
  visible: boolean;
};

export type Store = {
  events: AgentEvent[];
  eventCount: number;
  units: Record<string, UnitState>;
  worlds: Record<string, WorldState>;
  selectedUnitId: string | null;
  // The most recently focused world. Auras UnitInspector filtering and
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
  // Phaser publishes the selected world's current screen position so
  // the React world command can render as a contextual map popover.
  worldCommandAnchor: WorldCommandAnchor | null;
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
  setWorldCommandAnchor(anchor: WorldCommandAnchor | null): void;
  openDecreeFor(unitId: string): void;
  closeDecree(): void;
  startStandingOrder(
    unitId: string,
    prompt: string,
    intervalMs: number,
    maxIterations?: number
  ): string;
  recordOrderTick(orderId: string, ok: boolean): void;
  haltStandingOrder(orderId: string): void;
  toggleMute(sessionId: string): void;
  hydratePersisted(state: PersistedState): void;
  sealRealm(worldId: string): void;
  comfort(sessionId: string): ComfortReceipt;
  dismissLetter(letterId: string): void;
  dismissInformationalLetters(): void;
  applyLetterAction(letter: Letter, action: LetterAction): void;
  resetKingdom(): Promise<void>;
};

const MUTED_KEY = "realmkeeper:muted-sessions";
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

// Per-session comfort cooldown timestamps (ms when next allowed).
const _comfortCooldown = new Map<string, number>();
const COMFORT_COST = 50;
const COMFORT_HP = 30;
const COMFORT_COOLDOWN_MS = 30_000;

// Batch incoming events into one store update per animation frame so
// bursts (e.g. Cursor turn emits 20 tool_use events in <100ms) do not
// trigger 20 separate re-renders.
const _queue: AgentEvent[] = [];
let _flushScheduled = false;
let _flushRaf: number | null = null;
let _flushTimer: ReturnType<typeof setTimeout> | null = null;

function roundAnchorPoint(n: number) {
  return Math.round(n * 10) / 10;
}

function sameWorldCommandAnchor(
  a: WorldCommandAnchor | null,
  b: WorldCommandAnchor | null
) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.worldId === b.worldId &&
    roundAnchorPoint(a.x) === roundAnchorPoint(b.x) &&
    roundAnchorPoint(a.y) === roundAnchorPoint(b.y) &&
    roundAnchorPoint(a.worldX) === roundAnchorPoint(b.worldX) &&
    roundAnchorPoint(a.worldY) === roundAnchorPoint(b.worldY) &&
    a.visible === b.visible
  );
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
  worldCommandAnchor: null,
  decreeUnitId: null,
  standingOrders: {},

  ingest(event) {
    _queue.push(event);
    if (_flushScheduled) return;
    _flushScheduled = true;
    const flush = () => {
      if (!_flushScheduled) return;
      _flushScheduled = false;
      if (_flushRaf != null) {
        cancelAnimationFrame(_flushRaf);
        _flushRaf = null;
      }
      if (_flushTimer) {
        clearTimeout(_flushTimer);
        _flushTimer = null;
      }
      const batch = _queue.splice(0);
      set((state) => {
        let next: Store = state;
        for (const ev of batch) {
          const delta = applyOneEvent(next, ev);
          next = { ...next, ...delta };
        }
        return next;
      });
    };
    _flushRaf = requestAnimationFrame(flush);
    _flushTimer = setTimeout(flush, 50);
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
      cameraTargetVersion: id
        ? s.cameraTargetVersion + 1
        : s.cameraTargetVersion,
      worldCommandAnchor: id ? s.worldCommandAnchor : null,
    }));
  },
  setCameraTarget(worldId) {
    set((s) => ({
      cameraTarget: worldId,
      cameraTargetVersion: s.cameraTargetVersion + 1,
    }));
  },
  setWorldCommandAnchor(anchor) {
    const next = anchor
      ? {
          ...anchor,
          x: roundAnchorPoint(anchor.x),
          y: roundAnchorPoint(anchor.y),
          worldX: roundAnchorPoint(anchor.worldX),
          worldY: roundAnchorPoint(anchor.worldY),
        }
      : null;
    set((s) =>
      sameWorldCommandAnchor(s.worldCommandAnchor, next)
        ? s
        : { worldCommandAnchor: next }
    );
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
      void window.rw.savePersisted(nextPersisted).catch(() => {});
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
      void window.rw.savePersisted(nextPersisted).catch(() => {});
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
      void window.rw.savePersisted(nextPersisted).catch(() => {});
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
    const standingOrders = hydrateStandingOrders(
      persisted.standingOrders ?? []
    );
    set({ persisted, standingOrders });
  },
  comfort(sessionId) {
    const state = useStore.getState();
    const unit = state.units[sessionId];
    if (!unit) return "no-glimmer";
    if (unit.status === "fallen") return "fallen";
    if (unit.hp >= 100) return "full-hp";
    const now = Date.now();
    const cd = _comfortCooldown.get(sessionId) ?? 0;
    if (now < cd) return "cooldown";
    const world = state.worlds[unit.worldId];
    if (!world || world.glimmer < COMFORT_COST) return "no-glimmer";
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
          [unit.worldId]: { ...w, glimmer: w.glimmer - COMFORT_COST },
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
        s.sealRealm(action.worldId);
        break;
      case "iterate":
        // For v1: just dismiss; the user manually issues a follow-up via
        // CommandInput. Wired more deeply in polish phase (modal pre-fill).
        break;
      case "dispatch":
        // Send the user to the realm map / world to dispatch. Cinematic
        // dispatch flow comes in P9.
        s.selectWorld(action.worldId);
        break;
      case "send-word":
        // Stub; CommandInput is the main path for now.
        break;
      case "recall":
        void window.rw.killAgent(action.sessionId).catch(() => {});
        break;
      case "permission-allow":
      case "permission-deny":
        {
          const req = permissionResolutionForAction(action);
          if (req) void window.rw.resolvePermission(req).catch(() => {});
        }
        break;
      case "permission-choice":
        {
          const req = {
            requestId: action.requestId,
            choiceId: action.choiceId,
            optionId: action.optionId,
            message: action.message,
          };
          if (isPermissionChoiceAction(action)) {
            void window.rw.applyPermissionChoice(req).catch(() => {});
          }
        }
        break;
      case "permission-observe":
        // Observation-only provider letters — no upstream resolution;
        // just dismiss locally.
        break;
      case "user-input-submit":
        {
          const req = userInputResolutionForAction(action);
          if (req) void window.rw.resolveUserInput(req).catch(() => {});
        }
        break;
      case "dismiss":
        break;
    }
    s.dismissLetter(letter.id);
  },
  sealRealm(worldId) {
    play("seal");
    // Pan the unified-map camera to the sealed world so the fanfare
    // (gold-realm-seal materialization) plays in context.
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
      void window.rw.savePersisted(nextPersisted).catch(() => {});
      // Mark the live world as cleared too.
      const nextWorlds = { ...state.worlds };
      nextWorlds[worldId] = { ...world, alertLevel: "cleared", riftling: [] };
      return { persisted: nextPersisted, worlds: nextWorlds };
    });
  },
  async resetKingdom() {
    const fresh = await window.rw.resetPersisted();
    set({ persisted: fresh });
  },
}));

if (import.meta.env.DEV && typeof window !== "undefined") {
  window.__rwStore = useStore;
}

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
    // Compute lifetime glimmer = sum of current world.glimmer + previously-sealed
    // worlds' baked totals. Cheap approximation: take current per-world glimmer.
    let live = 0;
    for (const w of Object.values(s.worlds)) live += w.glimmer;
    const next: PersistedState = {
      ...s.persisted,
      totalGlimmerEver: Math.max(s.persisted.totalGlimmerEver, live),
    };
    if (next !== s.persisted) {
      void window.rw.savePersisted(next).catch(() => {});
      useStore.setState({ persisted: next });
    }
  }, 1000);
});
