// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createVisualQaSeed, visualQaThemeCoverage } from "./visual-qa-seed";
import { themeFor } from "../game/gummi-worlds";

describe("visual QA seed", () => {
  it("creates a deterministic board that covers major world states", () => {
    const seed = createVisualQaSeed(1_800_000_000_000);
    const worlds = Object.values(seed.worlds);
    const units = Object.values(seed.units);

    expect(worlds).toHaveLength(6);
    expect(units).toHaveLength(8);
    expect(worlds.map((world) => world.alertLevel).sort()).toEqual([
      "active",
      "active",
      "cleared",
      "danger",
      "idle",
      "warning",
    ]);
    expect(seed.letters.some((letter) => letter.risk === "elevated")).toBe(
      true
    );
    expect(seed.events.map((event) => event.kind)).toContain(
      "permission_request"
    );
    expect(seed.events.map((event) => event.kind)).toContain("subagent_spawn");
    expect(seed.events.map((event) => event.kind)).toContain("error");
    expect(
      seed.letters.some((letter) =>
        letter.actions.some((entry) => entry.action.kind === "send-word")
      )
    ).toBe(true);

    for (const unit of units) {
      expect(seed.worlds[unit.worldId]?.unitIds).toContain(unit.id);
      expect(seed.persisted.wielders).toHaveProperty(
        `${unit.tool}::${unit.repoRoot}`
      );
    }
  });

  it("uses world ids that hit their requested theme buckets", () => {
    for (const entry of visualQaThemeCoverage()) {
      expect(themeFor(entry.worldId)).toBe(entry.theme);
    }
  });
});
