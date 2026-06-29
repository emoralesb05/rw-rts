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

  it("creates user input letters for Codex app-server questions", async () => {
    const { applyOneEvent } = await loadReducer();
    let state = baseState();
    state = reduce(
      applyOneEvent,
      state,
      agentEvent("session_start", {
        timestamp: 1,
        tool: "codex",
        source: "realmkeeper",
      })
    );
    state = reduce(
      applyOneEvent,
      state,
      agentEvent("user_input_request", {
        timestamp: 2,
        tool: "codex",
        source: "realmkeeper",
        payload: {
          requestId: "codex-app-server:thread-1:8",
          questions: [
            {
              id: "approach",
              header: "Approach",
              question: "Which implementation should I use?",
              options: [
                {
                  label: "Small",
                  description: "Make the smallest compatible change.",
                },
              ],
            },
          ],
        },
      })
    );

    expect(state.letters[0]).toMatchObject({
      severity: "important",
      sessionId: "session-1",
      worldId: "_repo",
      title: expect.stringContaining("needs your answer"),
      userInputQuestions: [
        {
          id: "approach",
          header: "Approach",
          question: "Which implementation should I use?",
          options: [
            {
              label: "Small",
              description: "Make the smallest compatible change.",
            },
          ],
        },
      ],
      actions: [
        {
          label: "send answer",
          action: {
            kind: "user-input-submit",
            requestId: "codex-app-server:thread-1:8",
          },
        },
        {
          label: "skip",
          action: {
            kind: "user-input-submit",
            requestId: "codex-app-server:thread-1:8",
            answers: {},
          },
        },
      ],
    });

    state = reduce(
      applyOneEvent,
      state,
      agentEvent("user_input_resolved", {
        timestamp: 3,
        tool: "codex",
        source: "realmkeeper",
        payload: {
          requestId: "codex-app-server:thread-1:8",
          resolution: "error",
        },
      })
    );

    expect(state.letters).toEqual([]);
  });

  it("labels Claude user input letters with the provider name", async () => {
    const { applyOneEvent } = await loadReducer();
    let state = baseState();
    state = reduce(
      applyOneEvent,
      state,
      agentEvent("session_start", {
        timestamp: 1,
        tool: "claude",
        source: "hook",
      })
    );
    state = reduce(
      applyOneEvent,
      state,
      agentEvent("user_input_request", {
        timestamp: 2,
        tool: "claude",
        source: "hook",
        payload: {
          requestId: "claude-question-1",
          questions: [
            {
              id: "question-1",
              header: "Question 1",
              question: "Which implementation should I use?",
            },
            {
              id: "question-2",
              header: "Question 2",
              question: "Which files should I inspect?",
            },
          ],
        },
      })
    );

    expect(state.letters[0]).toMatchObject({
      title: expect.stringContaining("needs your answer"),
      body: expect.stringContaining("Claude is asking 2 questions"),
    });
  });

  it("creates MCP elicitation letters with accept and decline actions", async () => {
    const { applyOneEvent } = await loadReducer();
    let state = baseState();
    state = reduce(
      applyOneEvent,
      state,
      agentEvent("session_start", {
        timestamp: 1,
        tool: "codex",
        source: "realmkeeper",
      })
    );
    state = reduce(
      applyOneEvent,
      state,
      agentEvent("user_input_request", {
        timestamp: 2,
        tool: "codex",
        source: "realmkeeper",
        payload: {
          requestId: "codex-app-server:thread-1:9",
          responseKind: "mcp-elicitation",
          questions: [
            {
              id: "repository",
              header: "Repository",
              question: "Which repository should the MCP server use?",
              required: true,
              options: [{ label: "Realmkeeper", value: "rw-rts" }],
            },
          ],
        },
      })
    );

    expect(state.letters[0]).toMatchObject({
      title: expect.stringContaining("needs MCP input"),
      actions: [
        {
          label: "accept",
          action: {
            kind: "user-input-submit",
            requestId: "codex-app-server:thread-1:9",
            responseKind: "mcp-elicitation",
            responseAction: "accept",
          },
        },
        {
          label: "decline",
          action: {
            kind: "user-input-submit",
            requestId: "codex-app-server:thread-1:9",
            answers: {},
            responseKind: "mcp-elicitation",
            responseAction: "decline",
          },
        },
      ],
    });
  });

  it("keeps multiple user input letters from the same Codex session", async () => {
    const { applyOneEvent } = await loadReducer();
    let state = baseState();
    state = reduce(
      applyOneEvent,
      state,
      agentEvent("session_start", {
        timestamp: 1,
        tool: "codex",
        source: "realmkeeper",
      })
    );
    state = reduce(
      applyOneEvent,
      state,
      agentEvent("user_input_request", {
        timestamp: 2,
        tool: "codex",
        source: "realmkeeper",
        payload: {
          requestId: "codex-app-server:thread-1:8",
          questions: [
            {
              id: "approach",
              header: "Approach",
              question: "Which implementation should I use?",
            },
          ],
        },
      })
    );
    state = reduce(
      applyOneEvent,
      state,
      agentEvent("user_input_request", {
        timestamp: 3,
        tool: "codex",
        source: "realmkeeper",
        payload: {
          requestId: "codex-app-server:thread-1:9",
          responseKind: "mcp-elicitation",
          questions: [
            {
              id: "repository",
              header: "Repository",
              question: "Which repository should the MCP server use?",
            },
          ],
        },
      })
    );

    expect(
      state.letters.filter((letter) =>
        letter.actions.some(
          (entry) => entry.action.kind === "user-input-submit"
        )
      )
    ).toHaveLength(2);
  });
});
