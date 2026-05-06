import { describe, expect, it } from "vitest";
import type { Letter } from "@shared/events";
import {
  createStandingOrder,
  dismissInformationalLetters,
  haltStandingOrderById,
  hydrateStandingOrders,
  isPermissionLetter,
  ordersToPersisted,
  permissionResolutionForAction,
  recordStandingOrderTick,
  recordStandingOrderTickById,
  type StandingOrder,
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
});
