import { expect, it } from "vitest";
import type { OrchestrationRun } from "@shared/orchestration";
import type { UnitState, WorldState } from "@shared/events";
import {
  participantsForRun,
  runsForWorld,
  runSiteReadout,
  worldForRun,
  visibleRunSites,
} from "./run-sites";

export const runFixture: OrchestrationRun = {
  id: "run",
  template: "manual",
  title: "Review login",
  status: "running",
  repoRoot: "/repo",
  createdAt: 1,
  updatedAt: 2,
  providerSessions: [],
  traceIds: [],
  permissionRequestIds: [],
  userInputRequestIds: [],
  steps: [],
  checkpoints: [],
  budget: {},
  events: [],
};
const unit: UnitState = {
  id: "u",
  sessionId: "native",
  tool: "codex",
  role: "warden1",
  displayName: "Agent",
  cwd: "/repo",
  worldId: "w",
  hp: 100,
  mp: 100,
  status: "working",
  lastActivity: 1,
  spawnedHere: false,
};
const world: WorldState = {
  id: "w",
  path: "/repo",
  label: "Repo",
  unitIds: ["u"],
  riftling: [],
  alertLevel: "idle",
  glimmer: 0,
};

it("uses repo context for placement but not agent participation", () => {
  expect(worldForRun(runFixture, { w: world }, { u: unit })).toBe("w");
  expect(participantsForRun(runFixture, { u: unit })).toEqual([]);
});
it("matches native sessions and provider, not a stale unit ID", () => {
  const run = {
    ...runFixture,
    providerSessions: [
      { tool: "codex" as const, sessionId: "native", unitId: "old" },
    ],
  };
  expect(participantsForRun(run, { u: unit })).toEqual([unit]);
  expect(participantsForRun(run, { u: { ...unit, tool: "claude" } })).toEqual(
    []
  );
  expect(
    participantsForRun(
      {
        ...run,
        providerSessions: [{ tool: "codex", sessionId: "other", unitId: "u" }],
      },
      { u: unit }
    )
  ).toEqual([]);
});
it("supports explicit standing-order unit links", () => {
  expect(
    participantsForRun(
      { ...runFixture, template: "standing-order", params: { unitId: "u" } },
      { u: unit }
    )
  ).toEqual([unit]);
});
it("leaves ambiguous world placement unmapped", () => {
  expect(
    worldForRun(
      runFixture,
      { w: world, duplicate: { ...world, id: "duplicate" } },
      {}
    )
  ).toBeUndefined();
  expect(
    worldForRun({ ...runFixture, repoRoot: "/repo/subdir" }, { w: world }, {})
  ).toBeUndefined();
});
it("keeps run order stable through lifecycle updates and retains ended runs", () => {
  const runs = {
    b: { ...runFixture, id: "b", createdAt: 2 },
    a: { ...runFixture, id: "a", status: "completed" as const },
  };
  expect(runsForWorld("w", runs, { w: world }, {}).map((r) => r.id)).toEqual([
    "a",
    "b",
  ]);
});
it("reports unavailable instead of stale live status and never invents progress", () => {
  expect(runSiteReadout(runFixture, true).status).toBe("unavailable");
  expect(runSiteReadout(runFixture)).toMatchObject({
    completedSteps: 0,
    totalSteps: 0,
  });
  expect(runSiteReadout({ ...runFixture, status: "completed" }).status).toBe(
    "completed"
  );
});

it("prioritizes active runs over history without losing history from the district", () => {
  const runs = Array.from({ length: 8 }, (_, i) => ({
    ...runFixture,
    id: String(i),
    status: (i === 7 ? "running" : "completed") as OrchestrationRun["status"],
  }));
  expect(visibleRunSites(runs)).toHaveLength(3);
  expect(visibleRunSites(runs)[0].id).toBe("7");
  expect(runs).toHaveLength(8);
});
