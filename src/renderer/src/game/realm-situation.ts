import type { AgentEvent, Letter, UnitState, WorldState } from "@shared/events";
import {
  createWorldCommandBrief,
  type WorldCommandBrief,
  type WorldCommandReadState,
} from "../ui/hud/world-command";

export type RealmFront = {
  world: WorldState;
  brief: WorldCommandBrief;
  lastActivityAt: number;
};

export type RealmSituation = {
  overallState: Exclude<WorldCommandReadState, "sealed">;
  fronts: RealmFront[];
  focusableFronts: RealmFront[];
  counts: Record<WorldCommandReadState, number>;
};

const STATE_PRIORITY: Record<WorldCommandReadState, number> = {
  pressure: 4,
  hold: 3,
  active: 2,
  calm: 1,
  sealed: 0,
};

function latestWorldActivity(
  world: WorldState,
  units: Record<string, UnitState>
): number {
  return world.unitIds.reduce(
    (latest, unitId) => Math.max(latest, units[unitId]?.lastActivity ?? 0),
    0
  );
}

export function createRealmSituation(args: {
  worlds: Record<string, WorldState>;
  units: Record<string, UnitState>;
  letters: readonly Letter[];
  events: readonly AgentEvent[];
  now?: number;
}): RealmSituation {
  const { worlds, units, letters, events, now = Date.now() } = args;
  const fronts = Object.values(worlds)
    .map((world) => ({
      world,
      brief: createWorldCommandBrief({ world, units, letters, events, now }),
      lastActivityAt: latestWorldActivity(world, units),
    }))
    .sort((a, b) => {
      const stateDelta =
        STATE_PRIORITY[b.brief.readState] - STATE_PRIORITY[a.brief.readState];
      if (stateDelta !== 0) return stateDelta;
      const pressureDelta = b.brief.pressureScore - a.brief.pressureScore;
      if (pressureDelta !== 0) return pressureDelta;
      const activityDelta = b.lastActivityAt - a.lastActivityAt;
      if (activityDelta !== 0) return activityDelta;
      return a.world.label.localeCompare(b.world.label);
    });

  const counts: RealmSituation["counts"] = {
    calm: 0,
    active: 0,
    hold: 0,
    pressure: 0,
    sealed: 0,
  };
  for (const front of fronts) counts[front.brief.readState] += 1;

  const focusableFronts = fronts.filter(
    (front) =>
      front.brief.readState === "pressure" ||
      front.brief.readState === "hold" ||
      front.brief.readState === "active"
  );
  const overallState = counts.pressure
    ? "pressure"
    : counts.hold
      ? "hold"
      : counts.active
        ? "active"
        : "calm";

  return { overallState, fronts, focusableFronts, counts };
}

export function nextRealmFrontId(
  situation: RealmSituation,
  currentWorldId: string | null
): string | undefined {
  const fronts = situation.focusableFronts;
  if (fronts.length === 0) return undefined;
  const currentIndex = fronts.findIndex(
    (front) => front.world.id === currentWorldId
  );
  return fronts[(currentIndex + 1) % fronts.length]?.world.id;
}
