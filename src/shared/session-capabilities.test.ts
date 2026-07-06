import { describe, expect, it } from "vitest";
import {
  canControl,
  capabilitiesForUnit,
  controlReason,
  resolveSessionCapabilities,
} from "./session-capabilities";
import type { UnitState } from "./events";

function unit(overrides: Partial<UnitState> = {}): UnitState {
  return {
    id: "unit-1",
    sessionId: "unit-1",
    tool: "claude",
    role: "warden1",
    displayName: "Vaelen",
    cwd: "/repo",
    repoRoot: "/repo",
    worldId: "_repo",
    hp: 100,
    mp: 100,
    status: "idle",
    lastActivity: 1,
    spawnedAt: 1,
    spawnedHere: true,
    ...overrides,
  };
}

describe("session capabilities", () => {
  it("allows normal sends for active spawned and observed sessions", () => {
    expect(
      canControl(capabilitiesForUnit(unit({ spawnedHere: true })), "send")
    ).toBe(true);
    expect(
      canControl(capabilitiesForUnit(unit({ spawnedHere: false })), "send")
    ).toBe(true);
  });

  it("keeps decree, standing order, and stop scoped to owned processes", () => {
    const spawned = capabilitiesForUnit(unit({ spawnedHere: true }));
    const observed = capabilitiesForUnit(unit({ spawnedHere: false }));

    expect(canControl(spawned, "issueDecree")).toBe(true);
    expect(canControl(spawned, "runStandingOrder")).toBe(true);
    expect(canControl(spawned, "stop")).toBe(true);

    expect(canControl(observed, "issueDecree")).toBe(false);
    expect(canControl(observed, "runStandingOrder")).toBe(false);
    expect(canControl(observed, "stop")).toBe(false);
    expect(controlReason(observed, "stop")).toMatch(/did not spawn/i);
  });

  it("enables Codex steer and interrupt only for owned active turns", () => {
    const active = resolveSessionCapabilities({
      tool: "codex",
      spawnedHere: true,
      status: "working",
      activeTurnKnown: true,
    });
    const idle = resolveSessionCapabilities({
      tool: "codex",
      spawnedHere: true,
      status: "idle",
      activeTurnKnown: false,
    });
    const observed = resolveSessionCapabilities({
      tool: "codex",
      spawnedHere: false,
      status: "working",
      activeTurnKnown: true,
    });

    expect(canControl(active, "steer")).toBe(true);
    expect(canControl(active, "interrupt")).toBe(true);
    expect(canControl(idle, "steer")).toBe(false);
    expect(canControl(idle, "interrupt")).toBe(false);
    expect(canControl(observed, "steer")).toBe(false);
    expect(canControl(observed, "interrupt")).toBe(false);
  });

  it("records Cursor permissions as observe-only", () => {
    const capabilities = resolveSessionCapabilities({
      tool: "cursor",
      spawnedHere: false,
      status: "idle",
    });

    expect(capabilities.permissionAuthority).toBe("observe-only");
    expect(canControl(capabilities, "interrupt")).toBe(false);
    expect(controlReason(capabilities, "interrupt")).toMatch(
      /not authoritative/i
    );
  });

  it("disables every direct control once the unit is terminal", () => {
    const capabilities = capabilitiesForUnit(
      unit({ tool: "gemini", status: "complete", spawnedHere: true })
    );

    expect(Object.values(capabilities.controls)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          available: false,
          reason: "This wielder is no longer active.",
        }),
      ])
    );
    expect(
      Object.values(capabilities.controls).every((c) => !c.available)
    ).toBe(true);
  });

  it("keeps provider-known but unwired controls unavailable with reasons", () => {
    const claude = capabilitiesForUnit(unit({ tool: "claude" }));
    const codex = capabilitiesForUnit(unit({ tool: "codex" }));
    const gemini = capabilitiesForUnit(unit({ tool: "gemini" }));

    expect(canControl(codex, "fork")).toBe(true);
    expect(controlReason(codex, "fork")).toMatch(/fork known threads/i);
    expect(canControl(codex, "listProviderSessions")).toBe(true);
    expect(canControl(claude, "fork")).toBe(false);
    expect(canControl(claude, "attach")).toBe(true);
    expect(canControl(claude, "logs")).toBe(true);
    expect(canControl(claude, "listProviderSessions")).toBe(true);
    expect(canControl(gemini, "listProviderSessions")).toBe(false);
    expect(controlReason(gemini, "listProviderSessions")).toMatch(
      /diagnostic only/i
    );
  });
});
