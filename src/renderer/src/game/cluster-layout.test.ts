import { describe, expect, it } from "vitest";
import type { WorldState } from "@shared/events";
import {
  clusterDisplayName,
  clusterKeyFor,
  computeClusterLayout,
} from "./cluster-layout";

function world(id: string, path: string): WorldState {
  return {
    id,
    path,
    label: id,
    unitIds: [],
    riftling: [],
    alertLevel: "idle",
    glimmer: 0,
  };
}

describe("cluster layout", () => {
  it("separates crowded districts and leaves the base clear", () => {
    const worlds = Object.fromEntries(
      Array.from({ length: 60 }, (_, i) => {
        const id = `world-${i}`;
        return [id, world(id, `/projects/group-${i % 3}/${id}`)];
      })
    );
    const points = [...computeClusterLayout(worlds).values()];
    for (let i = 0; i < points.length; i++) {
      expect(Math.hypot(points[i].x, points[i].y)).toBeGreaterThan(350);
      for (const other of points.slice(i + 1)) {
        expect(
          Math.abs(points[i].x - other.x) >= 400 ||
            Math.abs(points[i].y - other.y) >= 350
        ).toBe(true);
      }
    }
  });
  it("groups sibling repos by parent directory", () => {
    expect(clusterKeyFor("/Users/ed/Github/rw-rts")).toBe("/Users/ed/Github");
    expect(clusterKeyFor("/repo")).toBe("/repo");
  });

  it("formats compact cluster display names", () => {
    expect(clusterDisplayName("/Users/ed/Github")).toBe("ed / Github");
    expect(clusterDisplayName("/repo")).toBe("repo");
    expect(clusterDisplayName("/")).toBe("/");
  });

  it("produces deterministic positions independent of record insertion order", () => {
    const a = world("rw-rts", "/Users/ed/Github/rw-rts");
    const b = world("assistant", "/Users/ed/Github/assistant");
    const c = world("sandbox", "/tmp/sandbox");

    const one = computeClusterLayout({
      [a.id]: a,
      [b.id]: b,
      [c.id]: c,
    });
    const two = computeClusterLayout({
      [c.id]: c,
      [b.id]: b,
      [a.id]: a,
    });

    expect([...one.entries()]).toEqual([...two.entries()]);
    expect(one.get("rw-rts")?.clusterKey).toBe("/Users/ed/Github");
    expect(one.get("assistant")?.clusterKey).toBe("/Users/ed/Github");
    expect(one.get("rw-rts")).not.toEqual(one.get("assistant"));
  });
});
