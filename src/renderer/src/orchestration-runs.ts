import type {
  OrchestrationRun,
  OrchestrationRunStatus,
} from "@shared/orchestration";
import { useStore } from "./store";

const ACTIVE_STANDING_ORDER_STATUSES = new Set<OrchestrationRunStatus>([
  "queued",
  "running",
  "paused",
]);

export type StandingOrderRunView = {
  run: OrchestrationRun;
  intervalMs: number;
  iterationsRun: number;
  maxIterations: number;
};

function sortRuns(runs: OrchestrationRun[]): OrchestrationRun[] {
  return runs.sort(
    (a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt
  );
}

function stringParam(run: OrchestrationRun, key: string): string | null {
  const value = run.params?.[key];
  return typeof value === "string" ? value : null;
}

function numberParam(run: OrchestrationRun, key: string): number | null {
  const value = run.params?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function isActiveStandingOrderRunForUnit(
  run: OrchestrationRun,
  unitId: string
): boolean {
  return (
    run.template === "standing-order" &&
    ACTIVE_STANDING_ORDER_STATUSES.has(run.status) &&
    stringParam(run, "unitId") === unitId
  );
}

export function hasActiveStandingOrderRunForUnit(
  runs: Record<string, OrchestrationRun>,
  unitId: string
): boolean {
  return Object.values(runs).some((run) =>
    isActiveStandingOrderRunForUnit(run, unitId)
  );
}

export function standingOrderRunViewsForUnit(
  runs: Record<string, OrchestrationRun>,
  unitId: string
): StandingOrderRunView[] {
  return sortRuns(
    Object.values(runs).filter((run) =>
      isActiveStandingOrderRunForUnit(run, unitId)
    )
  ).map((run) => ({
    run,
    intervalMs: numberParam(run, "intervalMs") ?? 60_000,
    iterationsRun: run.steps.filter((step) => step.status === "completed")
      .length,
    maxIterations: run.budget.maxIterations ?? 24,
  }));
}

export function attachOrchestrationRunPoller(intervalMs = 5_000): () => void {
  let stopped = false;

  const refresh = () => {
    if (stopped) return;
    void useStore.getState().refreshOrchestrationRuns();
  };

  refresh();
  const timer = window.setInterval(refresh, intervalMs);
  window.addEventListener("focus", refresh);

  return () => {
    stopped = true;
    window.clearInterval(timer);
    window.removeEventListener("focus", refresh);
  };
}
