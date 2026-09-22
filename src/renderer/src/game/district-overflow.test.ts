import { expect, it } from "vitest";
import { districtCourtyard } from "./district-overflow";
import { courtyardSlot } from "./realm-landmarks";

it("keeps thirty agents in three bounded courtyards", () => {
  const points = Array.from({ length: 30 }, (_, slot) =>
    districtCourtyard(slot, { x: 0, y: 0 }, 0, 1, 1)
  );
  expect(new Set(points.map((p) => p.annex)).size).toBe(3);
  const positions = points.map((p) => {
    const local = courtyardSlot(p.slot, true);
    expect(Math.abs(local.x)).toBeLessThanOrEqual(90);
    expect(local.y).toBeLessThan(128);
    return `${p.x + local.x}:${p.y + local.y}`;
  });
  expect(new Set(positions).size).toBe(30);
});

it("gives projects disjoint annexes and does not move existing seats as occupancy grows", () => {
  const regions = new Set<number>();
  for (let world = 0; world < 6; world++) {
    for (const slot of [12, 84, 156]) {
      const p = districtCourtyard(slot, { x: 0, y: 0 }, world, 6, 1);
      expect(regions.has(p.region!)).toBe(false);
      regions.add(p.region!);
      expect(p).toEqual(districtCourtyard(slot, { x: 0, y: 0 }, world, 6, 1));
    }
  }
});
