import { describe, expect, it } from "vitest";
import { createWorldCommandBrief } from "./world-command";
import type { AgentEvent, Letter, UnitState, WorldState } from "@shared/events";

function world(overrides: Partial<WorldState> = {}): WorldState {
  return {
    id: "world-1",
    path: "/repo",
    label: "Repo",
    unitIds: ["unit-1"],
    heartless: [],
    alertLevel: "idle",
    munny: 100,
    ...overrides,
  };
}

function unit(overrides: Partial<UnitState> = {}): UnitState {
  return {
    id: "unit-1",
    sessionId: "unit-1",
    tool: "claude",
    role: "keyblader1",
    displayName: "Vaelen",
    cwd: "/repo",
    repoRoot: "/repo",
    worldId: "world-1",
    hp: 72,
    mp: 88,
    status: "idle",
    lastActivity: 1000,
    spawnedAt: 1000,
    spawnedHere: true,
    ...overrides,
  };
}

function permissionLetter(overrides: Partial<Letter> = {}): Letter {
  return {
    id: "letter-1",
    createdAt: 2000,
    severity: "important",
    title: "Permission requested",
    worldId: "world-1",
    sessionId: "unit-1",
    actions: [
      {
        label: "allow",
        action: { kind: "permission-allow", requestId: "req-1" },
      },
    ],
    ...overrides,
  };
}

function event(overrides: Partial<AgentEvent> = {}): AgentEvent {
  return {
    sessionId: "unit-1",
    tool: "claude",
    cwd: "/repo",
    repoRoot: "/repo",
    timestamp: 3000,
    kind: "tool_use",
    payload: { name: "Read", input: {} },
    source: "hook",
    ...overrides,
  } as AgentEvent;
}

describe("createWorldCommandBrief", () => {
  it("marks a selected world as held when a permission letter targets it", () => {
    const brief = createWorldCommandBrief({
      world: world(),
      units: { "unit-1": unit() },
      letters: [permissionLetter()],
      events: [],
      now: 3000,
    });

    expect(brief.readState).toBe("hold");
    expect(brief.pendingLetters).toHaveLength(1);
    expect(brief.objective).toContain("Permission hold");
  });

  it("prioritizes pressure when heartless or fallen units are present", () => {
    const brief = createWorldCommandBrief({
      world: world({
        heartless: [
          {
            id: "heartless-1",
            type: "shadow",
            worldId: "world-1",
            hp: 1,
            spawnedAt: 2000,
          },
        ],
      }),
      units: { "unit-1": unit({ status: "fallen", hp: 0 }) },
      letters: [permissionLetter()],
      events: [event({ kind: "error", payload: { error: "boom" } })],
      now: 3000,
    });

    expect(brief.readState).toBe("pressure");
    expect(brief.unitCounts.fallen).toBe(1);
    expect(brief.canSeal).toBe(false);
  });

  it("allows sealing when the world has units and no heartless", () => {
    const brief = createWorldCommandBrief({
      world: world(),
      units: { "unit-1": unit({ status: "complete" }) },
      letters: [],
      events: [],
      now: 3000,
    });

    expect(brief.readState).toBe("calm");
    expect(brief.canSeal).toBe(true);
    expect(brief.recallTarget).toBeUndefined();
  });
});
