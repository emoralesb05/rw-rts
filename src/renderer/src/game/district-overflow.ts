import { COURTYARDS, TERRAIN_SCALE, terrainOrigin } from "./realm-terrain";

// Start with interior courtyards so ordinary focus views avoid region joins.
const ANNEX_COURTS = [1, 4, 2, 5, 0, 3] as const;

/** Annexes occupy authored courtyards, never extra rows over painted water. */
export function districtCourtyard(
  slot: number,
  home: { x: number; y: number },
  worldIndex: number,
  worldCount: number,
  baseRegions: number
) {
  const index = Number.isFinite(slot) ? Math.max(0, Math.floor(slot)) : 0;
  const annex = Math.floor(index / 12);
  if (!annex) return { ...home, slot: index, annex, region: undefined };
  const page = Math.floor((annex - 1) / COURTYARDS.length);
  const region = baseRegions + worldIndex + page * Math.max(1, worldCount);
  const origin = terrainOrigin(region);
  const court = COURTYARDS[ANNEX_COURTS[(annex - 1) % COURTYARDS.length]];
  return {
    x: origin.x + court.x * TERRAIN_SCALE,
    y: origin.y + court.y * TERRAIN_SCALE,
    slot: index % 12,
    annex,
    region,
  };
}
