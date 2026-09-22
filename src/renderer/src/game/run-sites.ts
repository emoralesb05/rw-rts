import type { UnitState, WorldState } from "@shared/events";
import type { OrchestrationRun } from "@shared/orchestration";

export function participantsForRun(
  run: OrchestrationRun,
  units: Record<string, UnitState>
) {
  return Object.values(units)
    .filter(
      (unit) =>
        run.providerSessions.some(
          (link) => link.tool === unit.tool && link.sessionId === unit.sessionId
        ) ||
        (run.template === "standing-order" && run.params?.unitId === unit.id)
    )
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Repository placement is context, never evidence that an agent belongs to a run. */
export function worldForRun(
  run: OrchestrationRun,
  worlds: Record<string, WorldState>,
  units: Record<string, UnitState>
) {
  const path = run.repoRoot ?? run.cwd;
  const matches = Object.values(worlds).filter(
    (world) => path && world.path === path
  );
  if (matches.length === 1) return matches[0].id;
  if (matches.length > 1) return undefined;
  if (path) return undefined;
  const linked = [
    ...new Set(participantsForRun(run, units).map((unit) => unit.worldId)),
  ].filter((id) => worlds[id]);
  return linked.length === 1 ? linked[0] : undefined;
}

export function runsForWorld(
  worldId: string,
  runs: Record<string, OrchestrationRun>,
  worlds: Record<string, WorldState>,
  units: Record<string, UnitState>
) {
  return Object.values(runs)
    .filter((run) => worldForRun(run, worlds, units) === worldId)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

export function runSiteReadout(run: OrchestrationRun, unavailable = false) {
  const status = unavailable ? "unavailable" : run.status;
  const color =
    status === "paused"
      ? "#ffd18a"
      : status === "failed"
        ? "#ffaaa7"
        : status === "completed"
          ? "#a3d9cb"
          : status === "running"
            ? "#94ddf5"
            : "#b0acc7";
  return {
    status,
    color,
    title: run.title,
    completedSteps: run.steps.filter((step) => step.status === "completed")
      .length,
    totalSteps: run.steps.length,
  };
}

/** Keep active work visible; completed history remains in the district inspector. */
export function visibleRunSites(runs: OrchestrationRun[]) {
  const active = runs.filter((run) =>
    ["queued", "running", "paused"].includes(run.status)
  );
  const history = runs
    .filter((run) => !["queued", "running", "paused"].includes(run.status))
    .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
  return [...active, ...history].slice(0, 3);
}
