type PanelBounds = { x: number; width: number };

/** Prefer the widest unobstructed horizontal band. Navigation only, no DOM reads. */
export function agentFocusPoint(
  width: number,
  height: number,
  panels: readonly PanelBounds[]
) {
  const margin = Math.min(48, width / 8);
  let bands = [{ left: margin, right: width - margin }];
  for (const panel of panels) {
    const left = panel.x - 32,
      right = panel.x + panel.width + 32;
    bands = bands.flatMap((band) => {
      if (right <= band.left || left >= band.right) return [band];
      return [
        { left: band.left, right: Math.min(left, band.right) },
        { left: Math.max(right, band.left), right: band.right },
      ].filter((part) => part.right - part.left >= 80);
    });
  }
  const best = bands.sort(
    (a, b) => b.right - b.left - (a.right - a.left) || a.left - b.left
  )[0];
  return {
    x: best ? (best.left + best.right) / 2 : width / 2,
    y: height * 0.55,
  };
}

export function agentFocusCenter(
  agent: { x: number; y: number },
  width: number,
  height: number,
  zoom: number,
  panels: readonly PanelBounds[]
) {
  const point = agentFocusPoint(width, height, panels);
  return {
    x: agent.x + (width / 2 - point.x) / zoom,
    y: agent.y - 24 + (height / 2 - point.y) / zoom,
  };
}
