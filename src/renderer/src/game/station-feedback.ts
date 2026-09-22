import type { SessionActivity } from "./session-activity";

export type StationFeedback = {
  state: SessionActivity["state"];
  acknowledgedUntil: number;
};

/** Observed transitions only: hydrating an ended session is not a celebration. */
export function stationFeedback(
  previous: StationFeedback | undefined,
  state: SessionActivity["state"],
  settled: boolean,
  now: number
) {
  const acknowledgedUntil =
    state !== "ended"
      ? 0
      : previous?.state === "working"
        ? now + 1400
        : (previous?.acknowledgedUntil ?? 0);
  const acknowledging = state === "ended" && now < acknowledgedUntil;
  return {
    state,
    acknowledgedUntil,
    acknowledging,
    tint:
      state === "blocked"
        ? 0xffd18a
        : state === "attention"
          ? 0xffaaa7
          : acknowledging
            ? 0xa3d9cb
            : 0xffffff,
    alpha:
      state === "working" && settled
        ? 0.91 + Math.sin(now / 300) * 0.09
        : state === "stale" || state === "quiet"
          ? 0.72
          : 1,
  };
}
