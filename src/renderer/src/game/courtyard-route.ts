export type RoutePoint = { x: number; y: number };

/** Local courtyard aisles, not a terrain-wide pathfinder. */
export function courtyardRoute(
  from: RoutePoint,
  to: RoutePoint,
  courtyard: RoutePoint
): RoutePoint[] {
  if (Math.hypot(to.x - from.x, to.y - from.y) < 1) return [];
  const local = (p: RoutePoint) =>
    Math.abs(p.x - courtyard.x) <= 130 &&
    p.y >= courtyard.y - 12 &&
    p.y <= courtyard.y + 139;
  // Layout relocation and the legacy star chart retain direct travel.
  if (!local(from) || !local(to) || Math.abs(to.x - from.x) < 1) {
    return [{ ...to }];
  }
  // Leave the station along its column, cross below the station rows,
  // then approach the destination from the south.
  const aisleY = courtyard.y + 128;
  const candidates = [
    { x: from.x, y: aisleY },
    { x: to.x, y: aisleY },
    { ...to },
  ];
  return candidates.filter((point, index) => {
    const previous = index === 0 ? from : candidates[index - 1];
    return Math.hypot(point.x - previous.x, point.y - previous.y) >= 1;
  });
}

export function arrivalKey(mode: string, worldId: string, target: RoutePoint) {
  return `${mode}:${worldId}:${target.x}:${target.y}`;
}
