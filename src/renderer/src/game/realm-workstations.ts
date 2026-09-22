import type { SessionActivity } from "./session-activity";

export const WORKSTATION_KEY = "realm-dream-workstations";
export const WORKSTATION_FRAME_SIZE = 512;
// Furniture is independent of terrain/building scale; characters are unchanged.
export const WORKSTATION_SCALE = 0.13;

export function workstationFrame(activity: SessionActivity): number {
  if (activity.state === "blocked" || activity.state === "attention") return 4;
  if (activity.state !== "working") return 5;
  switch (activity.label) {
    case "Reading":
    case "Searching":
      return 0;
    case "Editing":
      return 1;
    case "Research":
    case "Delegating":
      return 3;
    default:
      return 2;
  }
}
