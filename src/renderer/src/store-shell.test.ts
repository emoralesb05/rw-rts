import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Letter, LetterAction } from "@shared/events";

function installRendererGlobals() {
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

  const rw = {
    killAgent: vi.fn(() => Promise.resolve()),
    resolvePermission: vi.fn(() => Promise.resolve(true)),
    savePersisted: vi.fn(() => Promise.resolve()),
    resetPersisted: vi.fn(() =>
      Promise.resolve({
        schemaVersion: 2,
        kingdomFoundedAt: 0,
        totalGlimmerEver: 0,
        standingOrders: [],
        wielders: {},
        worlds: {},
      })
    ),
  };

  vi.stubGlobal("localStorage", localStorage);
  vi.stubGlobal("window", { rw });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });

  return { rw };
}

async function loadStore() {
  vi.doMock("./audio/sounds", () => ({
    play: vi.fn(),
  }));
  return import("./store");
}

function letterWithAction(action: LetterAction): Letter {
  return {
    id: "letter-1",
    createdAt: 1,
    severity: "critical",
    title: "Decision",
    actions: [{ label: "act", action }],
  };
}

describe("store letter action shell", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("./audio/sounds");
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("resolves allow permission actions through IPC and dismisses the letter", async () => {
    const { rw } = installRendererGlobals();
    const { useStore } = await loadStore();
    const letter = letterWithAction({
      kind: "permission-allow",
      requestId: "req-1",
    });

    useStore.setState({ letters: [letter] });
    useStore.getState().applyLetterAction(letter, letter.actions[0].action);

    expect(rw.resolvePermission).toHaveBeenCalledWith({
      requestId: "req-1",
      decision: "allow",
    });
    expect(useStore.getState().letters).toEqual([]);
  });

  it("passes selected permission option ids through IPC", async () => {
    const { rw } = installRendererGlobals();
    const { useStore } = await loadStore();
    const letter = letterWithAction({
      kind: "permission-allow",
      requestId: "req-option",
      optionId: "allow-once",
    });

    useStore.setState({ letters: [letter] });
    useStore.getState().applyLetterAction(letter, letter.actions[0].action);

    expect(rw.resolvePermission).toHaveBeenCalledWith({
      requestId: "req-option",
      decision: "allow",
      optionId: "allow-once",
    });
    expect(useStore.getState().letters).toEqual([]);
  });

  it("resolves deny permission actions with a message", async () => {
    const { rw } = installRendererGlobals();
    const { useStore } = await loadStore();
    const letter = letterWithAction({
      kind: "permission-deny",
      requestId: "req-2",
      message: "not safe",
    });

    useStore.setState({ letters: [letter] });
    useStore.getState().applyLetterAction(letter, letter.actions[0].action);

    expect(rw.resolvePermission).toHaveBeenCalledWith({
      requestId: "req-2",
      decision: "deny",
      message: "not safe",
    });
    expect(useStore.getState().letters).toEqual([]);
  });

  it("observes permission handoff letters without sending an IPC resolution", async () => {
    const { rw } = installRendererGlobals();
    const { useStore } = await loadStore();
    const letter = letterWithAction({
      kind: "permission-observe",
      requestId: "req-3",
    });

    useStore.setState({ letters: [letter] });
    useStore.getState().applyLetterAction(letter, letter.actions[0].action);

    expect(rw.resolvePermission).not.toHaveBeenCalled();
    expect(useStore.getState().letters).toEqual([]);
  });

  it("routes dispatch actions to world selection and dismisses the letter", async () => {
    installRendererGlobals();
    const { useStore } = await loadStore();
    const letter = letterWithAction({ kind: "dispatch", worldId: "world-1" });

    useStore.setState({
      activeWorldId: null,
      cameraTarget: null,
      cameraTargetVersion: 0,
      letters: [letter],
    });
    useStore.getState().applyLetterAction(letter, letter.actions[0].action);

    expect(useStore.getState()).toMatchObject({
      activeWorldId: "world-1",
      cameraTarget: "world-1",
      cameraTargetVersion: 1,
      letters: [],
    });
  });

  it("routes recall actions through killAgent and dismisses the letter", async () => {
    const { rw } = installRendererGlobals();
    const { useStore } = await loadStore();
    const letter = letterWithAction({ kind: "recall", sessionId: "unit-1" });

    useStore.setState({ letters: [letter] });
    useStore.getState().applyLetterAction(letter, letter.actions[0].action);

    expect(rw.killAgent).toHaveBeenCalledWith("unit-1");
    expect(useStore.getState().letters).toEqual([]);
  });
});
