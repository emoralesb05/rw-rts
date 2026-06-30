import type { AgentEvent, Letter, UnitState, WorldState } from "@shared/events";

export type WorldCommandReadState =
  | "calm"
  | "active"
  | "hold"
  | "pressure"
  | "sealed";

export type WorldCommandBrief = {
  readState: WorldCommandReadState;
  objective: string;
  pressureScore: number;
  unitCounts: {
    total: number;
    live: number;
    working: number;
    casting: number;
    fallen: number;
    complete: number;
  };
  worldUnits: UnitState[];
  liveUnits: UnitState[];
  activeUnits: UnitState[];
  primaryUnit?: UnitState;
  spawnedPrimaryUnit?: UnitState;
  comfortTarget?: UnitState;
  recallTarget?: UnitState;
  pendingLetters: Letter[];
  recentEvents: AgentEvent[];
  canSeal: boolean;
};

const RECENT_WINDOW_MS = 8000;

export function isPermissionLikeLetter(letter: Letter): boolean {
  return letter.actions.some(
    (entry) =>
      entry.action.kind === "permission-allow" ||
      entry.action.kind === "permission-deny" ||
      entry.action.kind === "permission-choice" ||
      entry.action.kind === "permission-observe"
  );
}

function byNewestActivity(a: UnitState, b: UnitState): number {
  return b.lastActivity - a.lastActivity;
}

function isLive(unit: UnitState): boolean {
  return unit.status !== "complete" && unit.status !== "fallen";
}

function unitIsActive(unit: UnitState): boolean {
  return (
    unit.status === "working" ||
    unit.status === "casting" ||
    unit.status === "moving"
  );
}

function letterTargetsWorld(letter: Letter, world: WorldState): boolean {
  if (letter.worldId === world.id) return true;
  return !!letter.sessionId && world.unitIds.includes(letter.sessionId);
}

function eventTargetsWorld(event: AgentEvent, world: WorldState): boolean {
  return world.unitIds.includes(event.sessionId);
}

export function createWorldCommandBrief(args: {
  world: WorldState;
  units: Record<string, UnitState>;
  letters: readonly Letter[];
  events: readonly AgentEvent[];
  now?: number;
}): WorldCommandBrief {
  const { world, units, letters, events, now = Date.now() } = args;
  const worldUnits = world.unitIds
    .map((id) => units[id])
    .filter((unit): unit is UnitState => !!unit)
    .sort(byNewestActivity);
  const liveUnits = worldUnits.filter(isLive);
  const activeUnits = worldUnits.filter(unitIsActive);
  const spawnedLiveUnits = liveUnits.filter((unit) => unit.spawnedHere);
  const working = worldUnits.filter((unit) => unit.status === "working").length;
  const casting = worldUnits.filter((unit) => unit.status === "casting").length;
  const fallen = worldUnits.filter((unit) => unit.status === "fallen").length;
  const complete = worldUnits.filter(
    (unit) => unit.status === "complete"
  ).length;
  const pendingLetters = letters
    .filter((letter) => isPermissionLikeLetter(letter))
    .filter((letter) => letterTargetsWorld(letter, world))
    .sort((a, b) => b.createdAt - a.createdAt);
  const recentEvents = events
    .filter((event) => eventTargetsWorld(event, world))
    .slice(0, 5);
  const recentError = recentEvents.some(
    (event) =>
      event.kind === "error" && now - event.timestamp <= RECENT_WINDOW_MS
  );
  const recentPermission = recentEvents.some(
    (event) =>
      event.kind === "permission_request" &&
      now - event.timestamp <= RECENT_WINDOW_MS
  );

  let readState: WorldCommandReadState = "calm";
  if (world.alertLevel === "cleared") {
    readState = "sealed";
  } else if (
    world.alertLevel === "danger" ||
    world.riftling.length >= 3 ||
    fallen > 0 ||
    recentError
  ) {
    readState = "pressure";
  } else if (pendingLetters.length > 0 || recentPermission) {
    readState = "hold";
  } else if (
    world.alertLevel === "warning" ||
    world.riftling.length > 0 ||
    activeUnits.length > 0
  ) {
    readState = activeUnits.length > 0 ? "active" : "pressure";
  }

  const pressureScore = Math.min(
    100,
    world.riftling.length * 18 +
      fallen * 28 +
      pendingLetters.length * 20 +
      activeUnits.length * 8 +
      (world.alertLevel === "danger" ? 24 : 0)
  );

  const objective =
    readState === "sealed"
      ? "Realm seal secured; keep the route quiet."
      : pendingLetters.length > 0
        ? "Permission hold: resolve the pending ask."
        : fallen > 0
          ? "Recover the fallen wielder before pressure spreads."
          : world.riftling.length > 0
            ? "Clear the riftling and stabilize the world."
            : activeUnits.length > 0
              ? "Hold the mission line while work resolves."
              : liveUnits.length > 0
                ? "Wielders are on standby at the base."
                : "Dispatch a wielder to establish a mission line.";

  const comfortTarget = liveUnits
    .filter((unit) => unit.hp < 100)
    .sort((a, b) => a.hp - b.hp)[0];
  const spawnedPrimaryUnit = spawnedLiveUnits[0];

  return {
    readState,
    objective,
    pressureScore,
    unitCounts: {
      total: worldUnits.length,
      live: liveUnits.length,
      working,
      casting,
      fallen,
      complete,
    },
    worldUnits,
    liveUnits,
    activeUnits,
    primaryUnit: liveUnits[0] ?? worldUnits[0],
    spawnedPrimaryUnit,
    comfortTarget,
    recallTarget: spawnedPrimaryUnit,
    pendingLetters,
    recentEvents,
    canSeal:
      world.alertLevel !== "cleared" &&
      world.riftling.length === 0 &&
      worldUnits.length > 0,
  };
}
