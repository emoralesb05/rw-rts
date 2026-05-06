import { describe, expect, it } from "vitest";
import type { Letter, UnitState, WorldState } from "@shared/events";
import {
  argKeyForToolInput,
  bindStandingOrdersForUnit,
  classifyPermissionRisk,
  computeAlertLevel,
  createStandingOrder,
  dismissInformationalLetters,
  extractRecentReasoning,
  haltStandingOrderById,
  hydrateStandingOrders,
  isPermissionLetter,
  isObservationOnlyPermission,
  mpCostForToolResult,
  mpCostForToolUse,
  ordersToPersisted,
  permissionResolutionForAction,
  recordStandingOrderTick,
  recordStandingOrderTickById,
  summarizePermissionInput,
  type StandingOrder,
  worldIdForEvent,
  worldLabelForEvent,
  worldPathForEvent,
} from "./store-domain";

function activeOrder(overrides: Partial<StandingOrder> = {}): StandingOrder {
  return {
    id: "order-1",
    unitId: "session-1",
    unitIdentity: "gemini::/repo",
    prompt: "keep going",
    intervalMs: 60_000,
    maxIterations: 3,
    iterationsRun: 0,
    failuresInRow: 0,
    status: "active",
    startedAt: 1000,
    lastFiredAt: 0,
    ...overrides,
  };
}

function letter(id: string, actions: Letter["actions"]): Letter {
  return {
    id,
    createdAt: 1,
    severity: "important",
    title: id,
    actions,
  };
}

describe("standing order domain helpers", () => {
  it("creates orders using repo-root wielder identity", () => {
    expect(
      createStandingOrder({
        id: "order-1",
        unitId: "session-1",
        unit: {
          tool: "gemini",
          cwd: "/repo/packages/app",
          repoRoot: "/repo",
        },
        prompt: "iterate",
        intervalMs: 30_000,
        maxIterations: 5,
        now: 1234,
      })
    ).toMatchObject({
      unitIdentity: "gemini::/repo",
      startedAt: 1234,
      status: "active",
    });
  });

  it("persists only active orders", () => {
    expect(
      ordersToPersisted({
        active: activeOrder({ id: "active" }),
        halted: activeOrder({ id: "halted", status: "halted" }),
      })
    ).toEqual([
      {
        id: "active",
        unitIdentity: "gemini::/repo",
        prompt: "keep going",
        intervalMs: 60_000,
        maxIterations: 3,
        iterationsRun: 0,
        startedAt: 1000,
      },
    ]);
  });

  it("ticks orders to exhausted or failed terminal states", () => {
    expect(
      recordStandingOrderTick(
        activeOrder({ iterationsRun: 2, maxIterations: 3 }),
        true,
        2000
      )
    ).toMatchObject({
      iterationsRun: 3,
      failuresInRow: 0,
      status: "exhausted",
      lastFiredAt: 2000,
    });

    expect(
      recordStandingOrderTick(
        activeOrder({ failuresInRow: 2, maxIterations: 10 }),
        false,
        3000
      )
    ).toMatchObject({
      iterationsRun: 1,
      failuresInRow: 3,
      status: "failed",
      lastFiredAt: 3000,
    });
  });

  it("ignores missing or inactive order ticks", () => {
    expect(recordStandingOrderTickById({}, "missing", true, 1)).toBeNull();
    expect(
      recordStandingOrderTickById(
        { "order-1": activeOrder({ status: "halted" }) },
        "order-1",
        true,
        1
      )
    ).toBeNull();
  });

  it("halts orders immutably and drops exhausted orders on hydrate", () => {
    expect(
      haltStandingOrderById({ "order-1": activeOrder() }, "order-1")
    ).toMatchObject({
      "order-1": { status: "halted" },
    });

    expect(
      hydrateStandingOrders([
        {
          id: "resume",
          unitIdentity: "claude::/repo",
          prompt: "resume",
          intervalMs: 60_000,
          maxIterations: 4,
          iterationsRun: 2,
          startedAt: 100,
        },
        {
          id: "done",
          unitIdentity: "claude::/repo",
          prompt: "done",
          intervalMs: 60_000,
          maxIterations: 2,
          iterationsRun: 2,
          startedAt: 100,
        },
      ])
    ).toMatchObject({
      resume: {
        unitId: "",
        status: "active",
        iterationsRun: 2,
        failuresInRow: 0,
      },
    });
  });

  it("binds active hydrated orders to matching repo-root unit identity", () => {
    expect(
      bindStandingOrdersForUnit(
        {
          mine: activeOrder({
            id: "mine",
            unitId: "",
            unitIdentity: "claude::/repo",
          }),
          other: activeOrder({
            id: "other",
            unitId: "",
            unitIdentity: "gemini::/repo",
          }),
          halted: activeOrder({
            id: "halted",
            unitId: "",
            unitIdentity: "claude::/repo",
            status: "halted",
          }),
        },
        {
          id: "session-2",
          tool: "claude",
          cwd: "/repo/packages/app",
          repoRoot: "/repo",
        }
      )
    ).toMatchObject({
      mine: { unitId: "session-2" },
      other: { unitId: "" },
      halted: { unitId: "" },
    });
  });
});

describe("permission letter domain helpers", () => {
  it("classifies actionable permission letters", () => {
    expect(
      isPermissionLetter(
        letter("perm", [
          { label: "allow", action: { kind: "permission-allow", requestId: "r1" } },
        ])
      )
    ).toBe(true);

    expect(
      isPermissionLetter(
        letter("observe", [
          { label: "ack", action: { kind: "permission-observe", requestId: "r1" } },
        ])
      )
    ).toBe(false);
  });

  it("dismisses informational letters while preserving decisions", () => {
    const permission = letter("permission", [
      { label: "deny", action: { kind: "permission-deny", requestId: "r1" } },
    ]);
    const info = letter("info", [
      { label: "dismiss", action: { kind: "dismiss" } },
    ]);

    expect(dismissInformationalLetters([permission, info])).toEqual([permission]);
  });

  it("builds IPC permission resolution payloads from letter actions", () => {
    expect(
      permissionResolutionForAction({
        kind: "permission-allow",
        requestId: "req-1",
      })
    ).toEqual({ requestId: "req-1", decision: "allow" });

    expect(
      permissionResolutionForAction({
        kind: "permission-deny",
        requestId: "req-2",
        message: "nope",
      })
    ).toEqual({ requestId: "req-2", decision: "deny", message: "nope" });

    expect(permissionResolutionForAction({ kind: "dismiss" })).toBeNull();
  });

  it("summarizes permission inputs in human-readable priority order", () => {
    expect(summarizePermissionInput({ command: "x".repeat(250) })).toHaveLength(200);
    expect(summarizePermissionInput({ file_path: "/repo/file.ts" })).toBe("/repo/file.ts");
    expect(summarizePermissionInput({ path: "/repo" })).toBe("/repo");
    expect(summarizePermissionInput({ url: "https://example.com/" + "a".repeat(250) })).toHaveLength(200);
    expect(summarizePermissionInput({ pattern: "*.ts" })).toBe("*.ts");
    expect(summarizePermissionInput({ other: true })).toBe("");
  });

  it("classifies permission risk from tool and input shape", () => {
    expect(classifyPermissionRisk("Read", { path: "/repo/file.ts" })).toBe("low");
    expect(classifyPermissionRisk("Bash", { command: "npm test" })).toBe("elevated");
    expect(classifyPermissionRisk("Bash", { command: "sudo rm -rf /tmp/x" })).toBe("high");
    expect(classifyPermissionRisk("Write", { file_path: "/etc/hosts" })).toBe("high");
    expect(classifyPermissionRisk("Edit", { file_path: "/repo/app.ts" })).toBe("elevated");
  });

  it("marks Cursor permission requests as observation-only", () => {
    expect(
      isObservationOnlyPermission({
        sessionId: "s1",
        tool: "cursor",
        cwd: "/repo",
        timestamp: 1,
        kind: "permission_request",
        payload: { requestId: "r1" },
        source: "hook",
      })
    ).toBe(true);
  });

  it("extracts latest reasoning for a session and truncates long text", () => {
    const long = "x".repeat(500);
    expect(
      extractRecentReasoning(
        [
          {
            sessionId: "s1",
            tool: "claude",
            cwd: "/repo",
            timestamp: 2,
            kind: "assistant_text",
            payload: { text: long },
            source: "hook",
          },
        ],
        "s1"
      )
    ).toBe(`${"x".repeat(480)}…`);
  });

  it("builds stable tool input keys", () => {
    expect(argKeyForToolInput({ file_path: "/repo/file.ts" })).toBe("file:/repo/file.ts");
    expect(argKeyForToolInput({ path: "/repo" })).toBe("file:/repo");
    expect(argKeyForToolInput({ command: "x".repeat(100) })).toBe(`cmd:${"x".repeat(80)}`);
    expect(argKeyForToolInput({ pattern: "*.ts" })).toBe("glob:*.ts");
    expect(argKeyForToolInput({ url: "https://example.com/" })).toBe("url:https://example.com/");
    expect(argKeyForToolInput(null)).toBe("*");
  });
});

describe("world and combat domain helpers", () => {
  it("derives world identity from repoRoot before cwd", () => {
    const event = {
      sessionId: "s1",
      tool: "claude",
      cwd: "/repo/packages/app",
      repoRoot: "/repo",
      timestamp: 1,
      kind: "session_start",
      payload: {},
      source: "hook",
    } as const;

    expect(worldIdForEvent(event)).toBe("_repo");
    expect(worldLabelForEvent(event)).toBe("repo");
    expect(worldPathForEvent(event)).toBe("/repo");
  });

  it("computes world alert levels from unit state and heartless pressure", () => {
    const world: WorldState = {
      id: "world",
      path: "/repo",
      label: "repo",
      unitIds: ["u1"],
      heartless: [],
      alertLevel: "idle",
      munny: 0,
    };
    const baseUnit: UnitState = {
      id: "u1",
      sessionId: "u1",
      tool: "claude",
      role: "keyblader1",
      displayName: "Aren",
      cwd: "/repo",
      worldId: "world",
      hp: 100,
      mp: 100,
      status: "idle",
      lastActivity: 1,
      spawnedHere: false,
    };

    expect(computeAlertLevel(world, { u1: baseUnit })).toBe("idle");
    expect(computeAlertLevel(world, { u1: { ...baseUnit, status: "working" } })).toBe("active");
    expect(computeAlertLevel(world, { u1: { ...baseUnit, hp: 50 } })).toBe("warning");
    expect(computeAlertLevel(world, { u1: { ...baseUnit, hp: 20 } })).toBe("danger");
    expect(
      computeAlertLevel(
        { ...world, heartless: Array.from({ length: 6 }, (_, i) => ({
          id: `h${i}`,
          type: "shadow",
          worldId: "world",
          hp: 1,
          spawnedAt: 1,
        })) },
        { u1: baseUnit }
      )
    ).toBe("danger");
    expect(computeAlertLevel(world, { u1: { ...baseUnit, status: "complete" } })).toBe("cleared");
  });

  it("computes MP cost for tool usage and heavy outputs", () => {
    expect(mpCostForToolUse("Read")).toBe(2);
    expect(mpCostForToolUse("Task")).toBe(12);
    expect(mpCostForToolUse("unknown")).toBe(4);
    expect(mpCostForToolResult("short")).toBe(0);
    expect(mpCostForToolResult("x".repeat(12_000))).toBe(2);
    expect(mpCostForToolResult({ stdout: "x".repeat(50_000) })).toBe(8);
  });
});
