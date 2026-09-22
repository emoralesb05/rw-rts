import { describe, expect, it } from "vitest";
import type { Letter, UnitState, WorldState } from "@shared/events";
import { createRealmSituation, nextRealmFrontId } from "./realm-situation";

function world(id: string, overrides: Partial<WorldState> = {}): WorldState {
  return {
    id,
    path: `/repos/${id}`,
    label: id,
    unitIds: [`unit-${id}`],
    riftling: [],
    alertLevel: "idle",
    glimmer: 0,
    ...overrides,
  };
}

function unit(worldId: string, overrides: Partial<UnitState> = {}): UnitState {
  return {
    id: `unit-${worldId}`,
    sessionId: `unit-${worldId}`,
    tool: "codex",
    role: "warden1",
    displayName: worldId,
    cwd: `/repos/${worldId}`,
    repoRoot: `/repos/${worldId}`,
    worldId,
    hp: 100,
    mp: 100,
    status: "idle",
    lastActivity: 1_000,
    spawnedHere: true,
    ...overrides,
  };
}

function questionLetter(worldId: string): Letter {
  return {
    id: `question-${worldId}`,
    createdAt: 2_000,
    severity: "important",
    title: "Question waiting",
    worldId,
    sessionId: `unit-${worldId}`,
    actions: [
      {
        label: "answer",
        action: { kind: "user-input-submit", requestId: "question-1" },
      },
    ],
  };
}

describe("createRealmSituation", () => {
  it("ranks pressure, input holds, and active work for kingdom focus", () => {
    const pressure = world("pressure", {
      alertLevel: "danger",
      riftling: [
        {
          id: "rift-1",
          type: "bulwark",
          worldId: "pressure",
          hp: 100,
          spawnedAt: 1_000,
        },
      ],
    });
    const hold = world("hold");
    const active = world("active", { alertLevel: "active" });
    const worlds = { pressure, hold, active };
    const units = {
      "unit-pressure": unit("pressure"),
      "unit-hold": unit("hold"),
      "unit-active": unit("active", {
        status: "working",
        lastActivity: 3_000,
      }),
    };

    const situation = createRealmSituation({
      worlds,
      units,
      letters: [questionLetter("hold")],
      events: [],
      now: 3_000,
    });

    expect(situation.overallState).toBe("pressure");
    expect(situation.fronts.map((front) => front.world.id)).toEqual([
      "pressure",
      "hold",
      "active",
    ]);
    expect(situation.counts).toMatchObject({
      pressure: 1,
      hold: 1,
      active: 1,
    });
    expect(situation.fronts[1]?.brief.objective).toContain("Input hold");
    expect(nextRealmFrontId(situation, null)).toBe("pressure");
    expect(nextRealmFrontId(situation, "pressure")).toBe("hold");
    expect(nextRealmFrontId(situation, "active")).toBe("pressure");
  });

  it("does not offer sealed or calm worlds as attention targets", () => {
    const sealed = world("sealed", { alertLevel: "cleared" });
    const calm = world("calm");
    const situation = createRealmSituation({
      worlds: { sealed, calm },
      units: {
        "unit-sealed": unit("sealed", { status: "complete" }),
        "unit-calm": unit("calm"),
      },
      letters: [],
      events: [],
    });

    expect(situation.overallState).toBe("calm");
    expect(situation.focusableFronts).toHaveLength(0);
    expect(nextRealmFrontId(situation, null)).toBeUndefined();
  });
});
