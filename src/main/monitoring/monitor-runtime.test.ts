import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MonitorRuntime } from "./monitor-runtime";

vi.mock("../provider-sessions", () => ({
  listProviderSessions: vi.fn(async () => ({
    sessions: [],
    errors: [],
    generatedAt: Date.now(),
  })),
}));
vi.mock("./herdr-source", () => ({ HerdrMonitorSource: class {} }));

const runtimes: MonitorRuntime[] = [];
const dirs: string[] = [];
afterEach(() => {
  for (const runtime of runtimes.splice(0)) runtime.stop();
  vi.useRealTimers();
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function setup() {
  const dir = mkdtempSync(join(tmpdir(), "monitor-runtime-test-"));
  dirs.push(dir);
  const historyFile = join(dir, "last-seen.json");
  const runtime = new MonitorRuntime({ herdrEnabled: false, historyFile });
  runtimes.push(runtime);
  return { runtime, historyFile };
}

it("checkpoints on interval and shutdown, stops timers, and never hydrates live permissions", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  const { runtime, historyFile } = setup();
  runtime.start();
  runtime.start();
  const listener = vi.fn();
  const unsubscribe = runtime.subscribe(listener);
  runtime.ingestAgentEvent({
    tool: "codex",
    sessionId: "s",
    cwd: "/repo",
    timestamp: Date.now(),
    kind: "permission_request",
    source: "hook",
    payload: { requestId: "secret" },
  });
  expect(listener.mock.lastCall?.[0].history.entries[0].state).toBe("blocked");
  await vi.advanceTimersByTimeAsync(15000);
  expect(
    JSON.parse(readFileSync(historyFile, "utf8")).history.entries
  ).toHaveLength(1);
  runtime.stop();
  runtime.stop();
  unsubscribe();
  expect(vi.getTimerCount()).toBe(0);
  vi.setSystemTime(20000);
  const restored = new MonitorRuntime({ herdrEnabled: false, historyFile });
  runtimes.push(restored);
  restored.start();
  expect(restored.getSnapshot().history?.gaps).toEqual([
    { from: 16000, to: 20000 },
  ]);
  expect(restored.getSnapshot().history?.entries[0].state).toBe("blocked");
  expect(restored.getSnapshot().agents).toEqual([]);
  expect(restored.getSnapshot().attention).toEqual([]);
  await expect(restored.focusAgent("codex:s")).rejects.toThrow(
    "no current Herdr pane"
  );
  restored.ingestAgentEvent({
    tool: "codex",
    sessionId: "s",
    cwd: "/repo",
    timestamp: Date.now(),
    kind: "tool_use",
    source: "hook",
    payload: { name: "Read" },
  });
  expect(restored.getSnapshot().agents).toHaveLength(1);
  expect(restored.getSnapshot().agents[0].state).toBe("working");
  expect(restored.getSnapshot().history?.entries).toHaveLength(1);
  expect(restored.getSnapshot().history?.entries[0].state).toBe("working");
});
