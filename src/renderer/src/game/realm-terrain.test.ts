import { describe, expect, it } from "vitest";
import type { WorldState } from "@shared/events";
import { computeTerrainLayout, COURTYARDS } from "./realm-terrain";

function worlds(count: number) {
  return Object.fromEntries(
    Array.from({ length: count }, (_, i) => {
      const id = `repo-${i}`;
      return [
        id,
        {
          id,
          path: `/projects/${id}`,
          label: id,
          unitIds: [],
          riftling: [],
          alertLevel: "idle",
          glimmer: 0,
        } satisfies WorldState,
      ];
    })
  );
}

describe("authored terrain layout", () => {
  it("places every live world in a distinct courtyard including overflow", () => {
    const layout = computeTerrainLayout(worlds(60));
    expect(layout.size).toBe(60);
    expect(new Set([...layout.values()].map((p) => `${p.x},${p.y}`)).size).toBe(
      60
    );
    expect(new Set([...layout.values()].map((p) => p.region)).size).toBe(10);
    for (const p of layout.values())
      expect(COURTYARDS.some((c) => c.theme === p.theme)).toBe(true);
  });
  it("is independent of input record order", () => {
    const input = worlds(17);
    expect([...computeTerrainLayout(input)]).toEqual([
      ...computeTerrainLayout(
        Object.fromEntries(Object.entries(input).reverse())
      ),
    ]);
  });
  it("does not fabricate occupied worlds for empty terrain", () => {
    expect(computeTerrainLayout({}).size).toBe(0);
  });
});
