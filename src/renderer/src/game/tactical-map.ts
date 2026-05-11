export type TacticalPoint = {
  x: number;
  y: number;
};

export type TacticalRect = TacticalPoint & {
  width: number;
  height: number;
};

export type TacticalBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type TacticalMapLayout = {
  width: number;
  height: number;
  pad: number;
};

export type TacticalSafeInsets = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type TacticalCameraMetrics = {
  width: number;
  height: number;
  zoomX: number;
  zoomY: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function drawableRect(layout: TacticalMapLayout): TacticalRect {
  return {
    x: layout.pad,
    y: layout.pad,
    width: Math.max(layout.width - layout.pad * 2, 1),
    height: Math.max(layout.height - layout.pad * 2, 1),
  };
}

export function tacticalCameraWorldView(
  fullView: TacticalRect,
  camera: TacticalCameraMetrics,
  safe: TacticalSafeInsets
): TacticalRect {
  const zoomX = Math.max(camera.zoomX, 0.001);
  const zoomY = Math.max(camera.zoomY, 0.001);
  const safeW = Math.max(camera.width - safe.left - safe.right, 1);
  const safeH = Math.max(camera.height - safe.top - safe.bottom, 1);
  return {
    x: fullView.x + safe.left / zoomX,
    y: fullView.y + safe.top / zoomY,
    width: safeW / zoomX,
    height: safeH / zoomY,
  };
}

export function projectWorldToTacticalMap(
  point: TacticalPoint,
  bounds: TacticalBounds,
  layout: TacticalMapLayout
): TacticalPoint {
  const drawable = drawableRect(layout);
  const worldW = Math.max(bounds.maxX - bounds.minX, 1);
  const worldH = Math.max(bounds.maxY - bounds.minY, 1);
  return {
    x: drawable.x + ((point.x - bounds.minX) / worldW) * drawable.width,
    y: drawable.y + ((point.y - bounds.minY) / worldH) * drawable.height,
  };
}

export function unprojectTacticalMapToWorld(
  point: TacticalPoint,
  bounds: TacticalBounds,
  layout: TacticalMapLayout
): TacticalPoint {
  const drawable = drawableRect(layout);
  const localX = clamp(point.x, drawable.x, drawable.x + drawable.width);
  const localY = clamp(point.y, drawable.y, drawable.y + drawable.height);
  const x =
    bounds.minX +
    ((localX - drawable.x) / drawable.width) * (bounds.maxX - bounds.minX);
  const y =
    bounds.minY +
    ((localY - drawable.y) / drawable.height) * (bounds.maxY - bounds.minY);
  return { x, y };
}

function projectedAxis(
  rawMin: number,
  rawMax: number,
  min: number,
  max: number
): { start: number; size: number } {
  const clippedMin = clamp(rawMin, min, max);
  const clippedMax = clamp(rawMax, min, max);
  const axisSize = max - min;
  const minSize = Math.min(6, axisSize);
  let start = Math.min(clippedMin, clippedMax);
  let size = Math.abs(clippedMax - clippedMin);
  if (size < minSize) {
    size = minSize;
    start = clamp(start - size / 2, min, max - size);
  }
  return { start, size };
}

export function projectViewportToTacticalMap(
  view: TacticalRect,
  bounds: TacticalBounds,
  layout: TacticalMapLayout
): TacticalRect {
  const topLeft = projectWorldToTacticalMap(
    { x: view.x, y: view.y },
    bounds,
    layout
  );
  const bottomRight = projectWorldToTacticalMap(
    { x: view.x + view.width, y: view.y + view.height },
    bounds,
    layout
  );
  const drawable = drawableRect(layout);
  const rawLeft = Math.min(topLeft.x, bottomRight.x);
  const rawRight = Math.max(topLeft.x, bottomRight.x);
  const rawTop = Math.min(topLeft.y, bottomRight.y);
  const rawBottom = Math.max(topLeft.y, bottomRight.y);
  const horizontal = projectedAxis(
    rawLeft,
    rawRight,
    drawable.x,
    drawable.x + drawable.width
  );
  const vertical = projectedAxis(
    rawTop,
    rawBottom,
    drawable.y,
    drawable.y + drawable.height
  );
  return {
    x: horizontal.start,
    y: vertical.start,
    width: horizontal.size,
    height: vertical.size,
  };
}
