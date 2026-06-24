import type {
  AgentEvent,
  UnitState,
  WorldAlertLevel,
  WorldState,
} from "@shared/events";

export function worldIdForEvent(event: AgentEvent): string {
  const base = event.repoRoot ?? event.cwd;
  return base.replace(/[^a-zA-Z0-9]+/g, "_") || "root";
}

export function worldLabelForEvent(event: AgentEvent): string {
  const base = event.repoRoot ?? event.cwd;
  const parts = base.split("/").filter(Boolean);
  return parts[parts.length - 1] || base;
}

export function worldPathForEvent(event: AgentEvent): string {
  return event.repoRoot ?? event.cwd;
}

export function computeAlertLevel(
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
  const riftlingCount = world.riftling.length;
  if (everyDone && riftlingCount === 0) return "cleared";
  if (live.length === 0) return "idle";
  const minHp = Math.min(...live.map((u) => u.hp));
  if (riftlingCount > 5 || minHp < 30) return "danger";
  if (riftlingCount > 0 || minHp < 70) return "warning";
  if (live.some((u) => u.status === "working" || u.status === "casting")) {
    return "active";
  }
  return "idle";
}
