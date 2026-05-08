import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_PERSISTED } from "@shared/events";
import type { AgentEvent, PersistedState, WorldState } from "@shared/events";

type RendererGlobals = {
  kh: {
    killAgent: ReturnType<typeof vi.fn>;
    resolvePermission: ReturnType<typeof vi.fn>;
    savePersisted: ReturnType<typeof vi.fn>;
    resetPersisted: ReturnType<typeof vi.fn>;
  };
  flushNextFrame(timestamp?: number): void;
  scheduledFrameCount(): number;
};

function installRendererGlobals({ autoFrame = false } = {}): RendererGlobals {
  const frames: FrameRequestCallback[] = [];
  const storage = new Map<string, string>();
  const localStorage = {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      storage.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      storage.delete(key);
    }),
    clear: vi.fn(() => {
      storage.clear();
    }),
    key: vi.fn((index: number) => [...storage.keys()][index] ?? null),
    get length() {
      return storage.size;
    },
  };

  const freshPersisted: PersistedState = {
    schemaVersion: 2,
    kingdomFoundedAt: 0,
    totalMunnyEver: 0,
    standingOrders: [],
    wielders: {},
    worlds: {},
  };
  const kh = {
    killAgent: vi.fn(() => Promise.resolve()),
    resolvePermission: vi.fn(() => Promise.resolve(true)),
    savePersisted: vi.fn(() => Promise.resolve()),
    resetPersisted: vi.fn(() => Promise.resolve(freshPersisted)),
  };

  vi.stubGlobal("localStorage", localStorage);
  vi.stubGlobal("window", { kh });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frames.push(cb);
    if (autoFrame) {
      cb(0);
    }
    return frames.length;
  });

  return {
    kh,
    flushNextFrame(timestamp = 0) {
      const cb = frames.shift();
      if (!cb) {
        throw new Error("No animation frame is scheduled");
      }
      cb(timestamp);
    },
    scheduledFrameCount() {
      return frames.length;
    },
  };
}

async function loadStore() {
  vi.doMock("./audio/sounds", () => ({
    play: vi.fn(),
  }));
  return import("./store");
}

function agentEvent(
  kind: AgentEvent["kind"],
  overrides: Partial<AgentEvent> = {}
): AgentEvent {
  return {
    sessionId: "session-1",
    tool: "claude",
    cwd: "/repo/packages/app",
    repoRoot: "/repo",
    timestamp: 1000,
    kind,
    source: "hook",
    ...overrides,
    payload: overrides.payload ?? {},
  };
}

describe("store event ingestion", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("./audio/sounds");
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("batches queued events into one animation-frame store update", async () => {
    const globals = installRendererGlobals();
    const { useStore } = await loadStore();
    let updates = 0;
    const unsubscribe = useStore.subscribe(() => {
      updates += 1;
    });

    useStore.getState().ingest(agentEvent("session_start", { timestamp: 1 }));
    useStore.getState().ingest(
      agentEvent("tool_use", {
        timestamp: 2,
        payload: { name: "Bash", input: { command: "pwd" } },
      })
    );

    expect(globals.scheduledFrameCount()).toBe(1);
    expect(useStore.getState()).toMatchObject({
      eventCount: 0,
      events: [],
    });

    globals.flushNextFrame();

    expect(updates).toBe(1);
    expect(useStore.getState().eventCount).toBe(2);
    expect(useStore.getState().events.map((event) => event.kind)).toEqual([
      "tool_use",
      "session_start",
    ]);
    expect(useStore.getState().units["session-1"]).toMatchObject({
      repoRoot: "/repo",
      status: "casting",
      lastTool: "Bash",
    });

    unsubscribe();
  });

  it("persists first session visits with repo-root wielder identity", async () => {
    const { kh } = installRendererGlobals({ autoFrame: true });
    const { useStore } = await loadStore();

    useStore.getState().ingest(
      agentEvent("session_start", {
        tool: "gemini",
        cwd: "/repo/packages/app",
        repoRoot: "/repo",
      })
    );

    expect(kh.savePersisted).toHaveBeenCalledWith(
      expect.objectContaining({
        wielders: expect.objectContaining({
          "gemini::/repo": expect.objectContaining({
            tool: "gemini",
            repoRoot: "/repo",
            visits: 1,
          }),
        }),
      })
    );
  });

  it("creates option-backed permission letters and removes them on resolution", async () => {
    installRendererGlobals({ autoFrame: true });
    const { useStore } = await loadStore();

    useStore.getState().ingest(agentEvent("session_start", { timestamp: 1 }));
    useStore.getState().ingest(
      agentEvent("assistant_text", {
        timestamp: 2,
        payload: { text: "I need to install the package before continuing." },
      })
    );
    useStore.getState().ingest(
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

    const letter = useStore.getState().letters[0];
    expect(letter).toMatchObject({
      severity: "critical",
      sessionId: "session-1",
      risk: "high",
      body: "Bash: sudo make install",
      reasoning: "I need to install the package before continuing.",
    });
    expect(letter.actions).toEqual(
      expect.arrayContaining([
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
      ])
    );

    useStore.getState().ingest(
      agentEvent("permission_resolved", {
        timestamp: 4,
        payload: { requestId: "req-1" },
      })
    );

    expect(
      useStore
        .getState()
        .letters.flatMap((item) => item.actions)
        .some(
          ({ action }) =>
            (action.kind === "permission-allow" ||
              action.kind === "permission-deny") &&
            action.requestId === "req-1"
        )
    ).toBe(false);
  });

  it("updates combat, heartless, and munny state through tool events", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    installRendererGlobals({ autoFrame: true });
    const { useStore } = await loadStore();

    useStore.getState().ingest(agentEvent("session_start", { timestamp: 1 }));
    useStore.getState().ingest(
      agentEvent("error", {
        timestamp: 2,
        payload: { error: "command failed" },
      })
    );

    expect(useStore.getState().units["session-1"]).toMatchObject({
      hp: 88,
    });
    expect(useStore.getState().worlds._repo).toMatchObject({
      alertLevel: "warning",
      heartless: [expect.objectContaining({ targetUnitId: "session-1" })],
      munny: 0,
    });

    useStore.getState().ingest(
      agentEvent("tool_use", {
        timestamp: 3,
        payload: { name: "Bash", input: { command: "bun test" } },
      })
    );
    useStore.getState().ingest(
      agentEvent("tool_result", {
        timestamp: 4,
        payload: { output: "ok" },
      })
    );

    expect(useStore.getState().worlds._repo).toMatchObject({
      heartless: [],
      munny: 5,
    });
    expect(useStore.getState().units["session-1"]).toMatchObject({
      status: "idle",
    });
  });

  it("debounces persisted total munny updates from store subscriptions", async () => {
    vi.useFakeTimers();
    const { kh } = installRendererGlobals();
    const { useStore } = await loadStore();
    const world: WorldState = {
      id: "_repo",
      path: "/repo",
      label: "repo",
      unitIds: [],
      heartless: [],
      alertLevel: "idle",
      munny: 25,
    };

    useStore.setState({
      eventCount: 1,
      worlds: { _repo: world },
      persisted: EMPTY_PERSISTED,
    });

    expect(kh.savePersisted).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(999);
    expect(kh.savePersisted).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(kh.savePersisted).toHaveBeenCalledWith(
      expect.objectContaining({ totalMunnyEver: 25 })
    );
    expect(useStore.getState().persisted.totalMunnyEver).toBe(25);
  });
});
