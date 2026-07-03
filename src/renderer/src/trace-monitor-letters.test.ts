// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { Letter, UnitState } from "@shared/events";
import type { TraceMonitorSignal } from "@shared/trace-monitors";
import { traceMonitorLetterEntries } from "./trace-monitor-letters";

function signal(
  overrides: Partial<TraceMonitorSignal> = {}
): TraceMonitorSignal {
  return {
    id: "trace-1:error_trace:span-1",
    traceId: "trace-1",
    sessionId: "session-1",
    tool: "codex",
    spanId: "span-1",
    kind: "error_trace",
    severity: "critical",
    title: "Trace error",
    detail: "provider failed",
    since: 1_000,
    durationMs: 5_000,
    ...overrides,
  };
}

function unit(overrides: Partial<UnitState> = {}): UnitState {
  return {
    id: "session-1",
    sessionId: "session-1",
    tool: "codex",
    role: "warden1",
    displayName: "Vaelen",
    cwd: "/repo",
    repoRoot: "/repo",
    worldId: "world-1",
    hp: 100,
    mp: 100,
    status: "working",
    lastActivity: 1_000,
    spawnedHere: true,
    ...overrides,
  };
}

function blockingLetter(): Letter {
  return {
    id: "input-letter",
    createdAt: 1_000,
    severity: "important",
    title: "Vaelen needs your answer",
    sessionId: "session-1",
    actions: [
      {
        label: "send answer",
        action: { kind: "user-input-submit", requestId: "input-1" },
      },
    ],
  };
}

describe("traceMonitorLetterEntries", () => {
  it("turns critical monitor signals into actionable letters", () => {
    const entries = traceMonitorLetterEntries([signal()], {
      letters: [],
      units: { "session-1": unit() },
      now: 10_000,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].letter).toMatchObject({
      id: "monitor:trace-1:error_trace:span-1",
      createdAt: 10_000,
      severity: "important",
      title: "Vaelen hit a trace error",
      body: "provider failed Active for 5s.",
      sessionId: "session-1",
      worldId: "world-1",
    });
    expect(entries[0].letter.actions.map((entry) => entry.action.kind)).toEqual(
      ["send-word", "recall", "dismiss"]
    );
  });

  it("skips waiting signals when a blocking letter already exists", () => {
    expect(
      traceMonitorLetterEntries(
        [
          signal({
            id: "trace-1:waiting:span-1",
            kind: "waiting",
            severity: "warning",
            title: "Waiting for input",
          }),
        ],
        {
          letters: [blockingLetter()],
          units: { "session-1": unit() },
        }
      )
    ).toEqual([]);
  });

  it("dedupes emitted and already-present monitor signals", () => {
    const existing = traceMonitorLetterEntries([signal()], {
      letters: [],
      units: { "session-1": unit() },
    })[0].letter;

    expect(
      traceMonitorLetterEntries([signal()], {
        letters: [existing],
        units: { "session-1": unit() },
      })
    ).toEqual([]);
    expect(
      traceMonitorLetterEntries([signal()], {
        letters: [],
        units: { "session-1": unit() },
        emittedSignalIds: new Set(["trace-1:error_trace:span-1"]),
      })
    ).toEqual([]);
  });
});
