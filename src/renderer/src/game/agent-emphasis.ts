import type { SessionActivity } from "./session-activity";

/** Presentation only: attention comes from observed session evidence. */
export function agentEmphasis(
  state: SessionActivity["state"],
  selected: boolean
) {
  const urgent = state === "blocked" || state === "attention";
  return {
    ring: selected || urgent,
    color: selected ? 0x79d9ff : 0xffc46b,
    width: selected ? 2.6 : 2,
    effects: selected && state === "working",
  };
}
