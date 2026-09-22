/** Dense districts keep attention visible without a wall of routine captions. */
export function showActivityCaption(
  zoom: number,
  districtSize: number,
  urgent: boolean,
  focused: boolean
) {
  return urgent || focused || (zoom >= 1.1 && districtSize <= 6);
}

/** Keep 10px attention text near 12 screen pixels at ordinary overview zoom. */
export function activityCaptionScale(zoom: number) {
  if (!Number.isFinite(zoom) || zoom <= 0) return 1;
  return Math.min(4, Math.max(1, 1.2 / zoom));
}
