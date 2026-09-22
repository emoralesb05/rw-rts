import { expect, it } from "vitest";
import type {
  AgentMonitorRecord,
  ControlSessionRequest,
} from "@shared/schemas";
import { resumeTarget } from "./resume-target";

const request: ControlSessionRequest = {
  action: "resume",
  tool: "codex",
  sessionId: "native",
  unitId: "local",
  cwd: "/repo",
  prompt: "Continue",
};
const agent: AgentMonitorRecord = {
  agentId: "codex:native",
  providerId: "codex",
  tool: "codex",
  nativeSessionId: "native",
  sourceLocalId: "local",
  cwd: "/repo",
  displayName: "Agent",
  state: "done",
  stateReason: "Ended",
  authority: "provider",
  confidence: "high",
  lastObservedAt: 1,
  spawnedHere: true,
  sources: [],
  evidence: [],
  usage: { coverage: "unavailable" },
  controls: [{ action: "resume", available: true, reason: "Supported" }],
};
it("resolves terminal sessions using main-owned identity and state", () => {
  expect(resumeTarget({ ...request, status: "working" }, [agent])).toBe(agent);
  expect(
    resumeTarget(request, [{ ...agent, state: "failed" }])
  ).toBeUndefined();
});
it.each(["working", "blocked", "unknown", "offline", "idle"] as const)(
  "rejects stale terminal UI when main reports %s",
  (state) => {
    expect(
      resumeTarget({ ...request, status: "complete" }, [{ ...agent, state }])
    ).toBeUndefined();
  }
);
it("rejects history-only, cross-provider, missing and mismatched metadata", () => {
  expect(resumeTarget(request, [])).toBeUndefined();
  for (const patch of [
    { tool: "claude" as const },
    { unitId: "other" },
    { sessionId: "other" },
    { cwd: "/other" },
    { sessionId: undefined },
  ]) {
    expect(resumeTarget({ ...request, ...patch }, [agent])).toBeUndefined();
  }
  expect(resumeTarget(request, [{ ...agent, controls: [] }])).toBeUndefined();
});
