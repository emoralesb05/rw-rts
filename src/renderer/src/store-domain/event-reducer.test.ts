import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_PERSISTED } from "@shared/events";
import type { AgentEvent, PersistedState } from "@shared/events";
import type {
  EventReducerState,
  applyOneEvent as applyOneEventFn,
} from "./event-reducer";

type ApplyOneEvent = typeof applyOneEventFn;

function freshPersisted(): PersistedState {
  return {
    ...EMPTY_PERSISTED,
    standingOrders: [],
    wielders: {},
    worlds: {},
  };
}

function baseState(
  overrides: Partial<EventReducerState> = {}
): EventReducerState {
  return {
    events: [],
    eventCount: 0,
    units: {},
    worlds: {},
    persisted: freshPersisted(),
    letters: [],
    standingOrders: {},
    ...overrides,
  };
}

function agentEvent(
  kind: AgentEvent["kind"],
  overrides: Partial<AgentEvent> = {}
): AgentEvent {
  return {
    sessionId: "session-1",
    tool: "gemini",
    cwd: "/repo/packages/app",
    repoRoot: "/repo",
    timestamp: 1000,
    kind,
    source: "hook",
    ...overrides,
    payload: overrides.payload ?? {},
  } as AgentEvent;
}

function reduce(
  applyOneEvent: ApplyOneEvent,
  state: EventReducerState,
  event: AgentEvent
): EventReducerState {
  return { ...state, ...applyOneEvent(state, event) };
}

async function loadReducer(): Promise<{ applyOneEvent: ApplyOneEvent }> {
  vi.doMock("../audio/sounds", () => ({
    play: vi.fn(),
  }));
  return import("./event-reducer");
}

describe("event reducer", () => {
  const savePersisted = vi.fn(() => Promise.resolve());

  beforeEach(() => {
    vi.resetModules();
    savePersisted.mockClear();
    vi.stubGlobal("window", { rw: { savePersisted } });
  });

  afterEach(() => {
    vi.doUnmock("../audio/sounds");
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("creates a unit and world from a session start", async () => {
    const { applyOneEvent } = await loadReducer();
    const next = reduce(
      applyOneEvent,
      baseState(),
      agentEvent("session_start", { source: "spawned" })
    );

    expect(next.eventCount).toBe(1);
    expect(next.events).toHaveLength(1);
    expect(next.units["session-1"]).toMatchObject({
      id: "session-1",
      tool: "gemini",
      repoRoot: "/repo",
      status: "idle",
      spawnedHere: true,
      worldId: "_repo",
      hp: 100,
      mp: 100,
    });
    expect(next.worlds._repo).toMatchObject({
      id: "_repo",
      path: "/repo",
      label: "repo",
      unitIds: ["session-1"],
      alertLevel: "idle",
    });
    expect(next.persisted.wielders["gemini::/repo"]).toMatchObject({
      tool: "gemini",
      repoRoot: "/repo",
      visits: 1,
    });
    expect(savePersisted).toHaveBeenCalledWith(next.persisted);
  });

  it("links a child session after a parent Task call in the same cwd", async () => {
    const { applyOneEvent } = await loadReducer();
    let state = baseState();
    state = reduce(
      applyOneEvent,
      state,
      agentEvent("session_start", { timestamp: 1000 })
    );
    state = reduce(
      applyOneEvent,
      state,
      agentEvent("tool_use", {
        timestamp: 1100,
        payload: { name: "Task", input: { prompt: "inspect this" } },
      })
    );
    state = reduce(
      applyOneEvent,
      state,
      agentEvent("session_start", {
        sessionId: "child-1",
        timestamp: 2000,
      })
    );

    expect(state.units["child-1"]).toMatchObject({
      parentSessionId: "session-1",
      cwd: "/repo/packages/app",
      repoRoot: "/repo",
    });
  });

  it("creates option-backed permission letters with recent reasoning", async () => {
    const { applyOneEvent } = await loadReducer();
    let state = baseState();
    state = reduce(
      applyOneEvent,
      state,
      agentEvent("session_start", { timestamp: 1 })
    );
    state = reduce(
      applyOneEvent,
      state,
      agentEvent("assistant_text", {
        timestamp: 2,
        payload: { text: "I need elevated access before continuing." },
      })
    );
    state = reduce(
      applyOneEvent,
      state,
      agentEvent("permission_request", {
        timestamp: 3,
        payload: {
          requestId: "req-1",
          name: "Bash",
          input: { command: "sudo make install" },
          permissionMode: "actionable",
          permissionOptions: [
            { id: "allow-once", label: "Allow once", decision: "allow" },
            { id: "deny", label: "Deny", decision: "deny" },
          ],
        },
      })
    );

    expect(state.letters[0]).toMatchObject({
      severity: "critical",
      sessionId: "session-1",
      worldId: "_repo",
      risk: "high",
      body: "Bash: sudo make install",
      reasoning: "I need elevated access before continuing.",
      actions: expect.arrayContaining([
        {
          label: "Allow once",
          action: {
            kind: "permission-allow",
            requestId: "req-1",
            optionId: "allow-once",
          },
        },
        {
          label: "Deny",
          action: {
            kind: "permission-deny",
            requestId: "req-1",
            optionId: "deny",
          },
        },
      ]),
    });
  });
});
