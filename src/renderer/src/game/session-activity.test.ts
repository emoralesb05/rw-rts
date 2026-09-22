import { describe, expect, it } from "vitest";
import type { Letter, UnitState } from "@shared/events";
import { ACTIVITY_STALE_MS, sessionActivity } from "./session-activity";

const unit: UnitState = {
  id: "unit",
  sessionId: "native",
  worldId: "repo",
  tool: "codex",
  role: "warden1",
  displayName: "Agent",
  cwd: "/repo",
  hp: 100,
  mp: 100,
  status: "working",
  lastActivity: 1000,
  lastTool: "apply_patch",
  spawnedHere: false,
};
const ask: Letter = {
  id: "ask",
  sessionId: "native",
  createdAt: 1,
  severity: "critical",
  title: "Ask",
  actions: [
    {
      label: "Answer",
      action: { kind: "permission-allow", requestId: "request" },
    },
  ],
};
describe("session activity sites", () => {
  it("keeps identity across tool changes without inventing tasks", () => {
    const a = sessionActivity(unit, [], 1001);
    const b = sessionActivity({ ...unit, lastTool: "bash" }, [], 1001);
    expect(a.id).toBe(b.id);
    expect(a.label).toBe("Editing");
    expect(b.label).toBe("Command");
    expect(b.detail).toContain("not a named task");
  });
  it("keeps unresolved asks blocked beyond the freshness window", () => {
    expect(sessionActivity(unit, [ask], 999999).state).toBe("blocked");
    expect(sessionActivity(unit, [], 999999).state).toBe("stale");
  });
  it("does not assign another session's ask", () => {
    expect(
      sessionActivity(unit, [{ ...ask, sessionId: "other" }], 1001).state
    ).toBe("working");
  });
  it("expires activity even without new events", () => {
    expect(
      sessionActivity(unit, [], unit.lastActivity + ACTIVITY_STALE_MS + 1).state
    ).toBe("stale");
  });
  it("does not equate session end with shipped work", () => {
    const site = sessionActivity({ ...unit, status: "complete" }, [], 999999);
    expect(site.state).toBe("ended");
    expect(site.detail).toContain("does not establish");
  });
  it("preserves parent identity and distinguishes errors from task failure", () => {
    const site = sessionActivity(
      { ...unit, status: "fallen", parentSessionId: "parent" },
      [],
      1001
    );
    expect(site.parentSessionId).toBe("parent");
    expect(site.state).toBe("attention");
    expect(site.detail).toContain("does not prove");
  });
});
