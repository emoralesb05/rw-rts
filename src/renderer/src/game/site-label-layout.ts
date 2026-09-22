export type SiteLabel = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  priority: number;
};

export type LabelObstacle = Pick<SiteLabel, "x" | "y" | "width" | "height">;

/** Screen rectangles use left/top; label obstacles use horizontal center/top. */
export function screenRectToLabelObstacle(
  rect: { x: number; y: number; width: number; height: number },
  view: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number }
): LabelObstacle {
  const sx = view.width / Math.max(1, viewport.width);
  const sy = view.height / Math.max(1, viewport.height);
  return {
    x: view.x + (rect.x + rect.width / 2) * sx,
    y: view.y + rect.y * sy,
    width: rect.width * sx,
    height: rect.height * sy,
  };
}

/** Prioritize urgent anchors while clearing reserved nameplates and nearby labels. */
export function layoutSiteLabels(
  labels: readonly SiteLabel[],
  gap = 5,
  obstacles: readonly LabelObstacle[] = []
) {
  const placed: LabelObstacle[] = [...obstacles];
  const positions = new Map<string, { x: number; y: number }>();
  for (const label of [...labels].sort(
    (a, b) => b.priority - a.priority || a.id.localeCompare(b.id)
  )) {
    const next = { ...label };
    // Try beside as well as above/below obstacles, keeping captions close.
    const candidates = [
      { x: label.x, y: label.y },
      ...placed.flatMap((other) => [
        { x: label.x, y: other.y - label.height - gap },
        { x: label.x, y: other.y + other.height + gap },
        { x: other.x - (other.width + label.width) / 2 - gap, y: label.y },
        { x: other.x + (other.width + label.width) / 2 + gap, y: label.y },
      ]),
    ].sort(
      (a, b) =>
        Math.hypot(a.x - label.x, a.y - label.y) -
          Math.hypot(b.x - label.x, b.y - label.y) ||
        b.y - a.y ||
        a.x - b.x
    );
    const position =
      candidates.find((p) =>
        placed.every(
          (other) =>
            Math.abs(p.x - other.x) >= (label.width + other.width) / 2 + gap ||
            p.y >= other.y + other.height + gap ||
            p.y + label.height + gap <= other.y
        )
      ) ?? label;
    next.x = position.x;
    next.y = position.y;
    placed.push(next);
    positions.set(next.id, { x: next.x, y: next.y });
  }
  return positions;
}
