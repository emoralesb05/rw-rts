import { expect, it } from "vitest";
import type { AgentEvent } from "@shared/events";
import { eventMatchesAgent } from "./agent-conversation";

it("matches provider/native identity and explicit aliases, never repository alone", () => {
  const agent = {
    providerId: "codex",
    nativeSessionId: "native",
    sourceLocalId: "local",
  };
  const event: AgentEvent = {
    tool: "codex",
    sessionId: "local",
    cwd: "/repo",
    timestamp: 1,
    kind: "assistant_text",
    source: "hook",
    payload: {},
  };
  expect(eventMatchesAgent(event, agent)).toBe(true);
  expect(eventMatchesAgent({ ...event, tool: "claude" }, agent)).toBe(false);
  expect(eventMatchesAgent({ ...event, sessionId: "other" }, agent)).toBe(
    false
  );
  expect(
    eventMatchesAgent(
      {
        ...event,
        sessionId: "other",
        payload: { providerSessionId: "native" },
      },
      agent
    )
  ).toBe(true);
  expect(
    eventMatchesAgent(
      { ...event, payload: { providerSessionId: "different" } },
      agent
    )
  ).toBe(false);
  expect(
    eventMatchesAgent(event, { ...agent, nativeSessionId: undefined })
  ).toBe(false);
});
