export const FIT_REALM_EVENT = "rw:fit-realm";

/** Keep the world point beneath the pointer stationary while changing zoom. */
export function zoomScrollDelta(
  pointer: number,
  viewportSize: number,
  oldZoom: number,
  newZoom: number
) {
  return (pointer - viewportSize / 2) * (1 / oldZoom - 1 / newZoom);
}

/** The viewport looks into the world: never expose the terrain's outer edge. */
export function overviewZoom(
  width: number,
  height: number,
  worldWidth: number,
  worldHeight: number
) {
  return Math.max(
    0.001,
    Math.max(
      Math.max(1, width) / Math.max(1, worldWidth),
      Math.max(1, height) / Math.max(1, worldHeight)
    )
  );
}
