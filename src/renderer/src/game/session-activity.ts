import type { Letter, UnitState } from "@shared/events";
import { isBlockingLetter } from "../ui/hud/world-command";
import { activityForToolName } from "./world-aliveness";

export const ACTIVITY_STALE_MS = 120_000;
export type SessionActivity = {
  id: string;
  unitId: string;
  worldId: string;
  label: string;
  symbol: string;
  color: string;
  state: "working" | "blocked" | "ended" | "attention" | "quiet" | "stale";
  detail: string;
  parentSessionId?: string;
};

/** Presentation of observed session activity, never an inferred task or progress. */
export function sessionActivity(
  unit: UnitState,
  letters: readonly Letter[],
  now = Date.now()
): SessionActivity {
  const base = {
    id: `session:${unit.id}`,
    unitId: unit.id,
    worldId: unit.worldId,
    parentSessionId: unit.parentSessionId,
  };
  const blocked = letters.some(
    (letter) =>
      (letter.sessionId === unit.sessionId || letter.sessionId === unit.id) &&
      isBlockingLetter(letter)
  );
  if (blocked)
    return {
      ...base,
      state: "blocked",
      label: "Needs you",
      symbol: "!",
      color: "#ffd18a",
      detail:
        "An unresolved permission or question is waiting. Review the ask before work can continue.",
    };
  if (unit.status === "complete")
    return {
      ...base,
      state: "ended",
      label: "Ended",
      symbol: "◇",
      color: "#a3d9cb",
      detail:
        "The session ended. Inspect its result; this does not establish that a task shipped or tests passed.",
    };
  if (
    !Number.isFinite(unit.lastActivity) ||
    now - unit.lastActivity > ACTIVITY_STALE_MS
  )
    return {
      ...base,
      state: "stale",
      label: "Stale",
      symbol: "?",
      color: "#b0acc7",
      detail: "No recent activity signal. Current work state is unknown.",
    };
  if (unit.status === "fallen")
    return {
      ...base,
      state: "attention",
      label: "Review",
      symbol: "!",
      color: "#ffaaa7",
      detail:
        "An error was observed. Review the session; an error alone does not prove the task failed.",
    };
  if (unit.status === "idle")
    return {
      ...base,
      state: "quiet",
      label: "Quiet",
      symbol: "·",
      color: "#b0acc7",
      detail:
        "No active tool work is currently indicated. No task completion is inferred.",
    };
  const kind = unit.lastTool ? activityForToolName(unit.lastTool) : "generic";
  const label =
    (
      {
        read: "Reading",
        search: "Searching",
        edit: "Editing",
        shell: "Command",
        web: "Research",
        subagent: "Delegating",
      } as Record<string, string>
    )[kind] ?? "Working";
  return {
    ...base,
    state: "working",
    label,
    symbol: "◆",
    color: "#94ddf5",
    detail: unit.lastTool
      ? `Latest observed tool: ${unit.lastTool}. This is session activity, not a named task or progress estimate.`
      : "Recent session activity. No explicit task or progress is available.",
  };
}
