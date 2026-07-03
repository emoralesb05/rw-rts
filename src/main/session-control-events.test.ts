import { describe, expect, it } from "vitest";
import { sessionControlEventFor } from "./session-control-events";
import type {
  ControlSessionRequest,
  ControlSessionResponse,
} from "@shared/schemas";

function request(
  overrides: Partial<ControlSessionRequest> = {}
): ControlSessionRequest {
  return {
    action: "interrupt",
    unitId: "unit-1",
    sessionId: "session-1",
    tool: "codex",
    cwd: "/repo",
    status: "working",
    ...overrides,
  };
}

function response(
  overrides: Partial<ControlSessionResponse> = {}
): ControlSessionResponse {
  return {
    action: "interrupt",
    ok: true,
    ...overrides,
  };
}

describe("sessionControlEventFor", () => {
  it("builds a Realmkeeper session-control event for accepted interrupts", () => {
    expect(
      sessionControlEventFor(request(), response(), {
        cwd: "/fallback",
        now: 123,
      })
    ).toMatchObject({
      sessionId: "session-1",
      tool: "codex",
      cwd: "/repo",
      timestamp: 123,
      kind: "session_control",
      source: "realmkeeper",
      payload: {
        controlAction: "interrupt",
        ok: true,
      },
    });
  });

  it("records rejected controls with their reason", () => {
    expect(
      sessionControlEventFor(
        request({ action: "stop", sessionId: undefined, cwd: undefined }),
        response({
          action: "stop",
          ok: false,
          reason: "Realmkeeper did not spawn this process.",
        }),
        {
          sessionId: "owned-session",
          cwd: "/owned",
          now: 123,
        }
      )
    ).toMatchObject({
      sessionId: "owned-session",
      cwd: "/owned",
      payload: {
        controlAction: "stop",
        ok: false,
        reason: "Realmkeeper did not spawn this process.",
      },
    });
  });

  it("does not duplicate successful prompt controls", () => {
    expect(
      sessionControlEventFor(
        request({ action: "send", prompt: "continue" }),
        response({ action: "send", ok: true }),
        { cwd: "/repo" }
      )
    ).toBeNull();
  });

  it("records failed prompt controls", () => {
    expect(
      sessionControlEventFor(
        request({ action: "send", prompt: "" }),
        response({
          action: "send",
          ok: false,
          reason: "Prompt is required.",
        }),
        { cwd: "/repo", now: 123 }
      )
    ).toMatchObject({
      kind: "session_control",
      payload: {
        controlAction: "send",
        ok: false,
        reason: "Prompt is required.",
      },
    });
  });
});
