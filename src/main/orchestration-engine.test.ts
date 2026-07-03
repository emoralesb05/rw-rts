import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MainOrchestrationEngine } from "./orchestration-engine";
import { LocalOrchestrationStore } from "./orchestration-store";

let root: string | undefined;

async function tempRoot(): Promise<string> {
  root = await mkdtemp(join(tmpdir(), "realmkeeper-engine-"));
  return root;
}

function ids() {
  let n = 0;
  return () => `id-${++n}`;
}

function clock(start = 10_000) {
  let now = start;
  return {
    now: () => now++,
    set: (next: number) => {
      now = next;
    },
  };
}

function standingOrderParams() {
  return {
    unitId: "unit-1",
    sessionId: "session-1",
    tool: "codex" as const,
    cwd: "/repo",
    status: "working" as const,
    prompt: "run tests",
    intervalMs: 60_000,
  };
}

describe("MainOrchestrationEngine", () => {
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
    root = undefined;
  });

  it("executes standing-order ticks through session control", async () => {
    const time = clock();
    const store = new LocalOrchestrationStore({
      rootDir: await tempRoot(),
      idFactory: ids(),
      now: time.now,
    });
    const controlSession = vi.fn(() =>
      Promise.resolve({ action: "send" as const, ok: true })
    );
    const run = await store.createRun({
      template: "standing-order",
      title: "Keep tests moving",
      status: "running",
      params: standingOrderParams(),
      budget: { maxIterations: 2, maxConsecutiveFailures: 3 },
    });
    const engine = new MainOrchestrationEngine({
      store,
      controlSession,
      now: time.now,
    });

    await engine.tickOnce(run.id);
    await engine.tickOnce(run.id);

    expect(controlSession).toHaveBeenNthCalledWith(1, {
      action: "send",
      unitId: "unit-1",
      sessionId: "session-1",
      tool: "codex",
      cwd: "/repo",
      status: "working",
      prompt: "[Standing Order - iteration 1/2]\n\nrun tests",
    });
    expect(controlSession).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        prompt: "[Standing Order - iteration 2/2]\n\nrun tests",
      })
    );
    await expect(store.getRun(run.id)).resolves.toMatchObject({
      status: "completed",
      steps: [
        { kind: "standing-order-tick", status: "completed" },
        { kind: "standing-order-tick", status: "completed" },
      ],
      checkpoints: [
        { label: "Standing order iteration 1 sent" },
        { label: "Standing order iteration 2 sent" },
      ],
    });
  });

  it("fails a standing-order run after repeated send failures", async () => {
    const time = clock(20_000);
    const store = new LocalOrchestrationStore({
      rootDir: await tempRoot(),
      idFactory: ids(),
      now: time.now,
    });
    const controlSession = vi.fn(() =>
      Promise.resolve({
        action: "send" as const,
        ok: false,
        reason: "Provider unavailable.",
      })
    );
    const run = await store.createRun({
      template: "standing-order",
      title: "Retry tests",
      status: "running",
      params: standingOrderParams(),
      budget: { maxIterations: 5, maxConsecutiveFailures: 2 },
    });
    const engine = new MainOrchestrationEngine({
      store,
      controlSession,
      now: time.now,
    });

    await engine.tickOnce(run.id);
    await engine.tickOnce(run.id);

    await expect(store.getRun(run.id)).resolves.toMatchObject({
      status: "failed",
      failureReason: "Provider unavailable.",
      steps: [
        { status: "failed", error: "Provider unavailable." },
        { status: "failed", error: "Provider unavailable." },
      ],
    });
  });

  it("pauses standing-order runs on explicit control-plane failures", async () => {
    const time = clock(25_000);
    const store = new LocalOrchestrationStore({
      rootDir: await tempRoot(),
      idFactory: ids(),
      now: time.now,
    });
    const controlSession = vi.fn(() =>
      Promise.resolve({
        action: "send" as const,
        ok: false,
        reason: "Standing Orders stay scoped to Realmkeeper-owned sessions.",
        reasonCode: "capability_unavailable" as const,
      })
    );
    const run = await store.createRun({
      template: "standing-order",
      title: "Pause unsupported",
      status: "running",
      params: standingOrderParams(),
      budget: { maxIterations: 5, maxConsecutiveFailures: 2 },
    });
    const engine = new MainOrchestrationEngine({
      store,
      controlSession,
      now: time.now,
    });

    await engine.tickOnce(run.id);
    await engine.tickOnce(run.id);

    expect(controlSession).toHaveBeenCalledTimes(1);
    await expect(store.getRun(run.id)).resolves.toMatchObject({
      status: "paused",
      pauseReason: "Standing Orders stay scoped to Realmkeeper-owned sessions.",
      steps: [{ status: "failed" }],
      checkpoints: [{ label: "Standing order iteration 1 failed" }],
    });
  });

  it("pauses malformed standing-order runs before provider control", async () => {
    const store = new LocalOrchestrationStore({
      rootDir: await tempRoot(),
      idFactory: ids(),
      now: clock(30_000).now,
    });
    const controlSession = vi.fn();
    const run = await store.createRun({
      template: "standing-order",
      title: "Broken",
      status: "running",
      params: { prompt: "missing session" },
    });
    const engine = new MainOrchestrationEngine({
      store,
      controlSession,
    });

    await engine.tickOnce(run.id);

    expect(controlSession).not.toHaveBeenCalled();
    await expect(store.getRun(run.id)).resolves.toMatchObject({
      status: "paused",
      pauseReason:
        "Standing-order run is missing required provider session params.",
    });
  });

  it("only ticks due standing-order runs", async () => {
    const time = clock(40_000);
    const store = new LocalOrchestrationStore({
      rootDir: await tempRoot(),
      idFactory: ids(),
      now: time.now,
    });
    const controlSession = vi.fn(() =>
      Promise.resolve({ action: "send" as const, ok: true })
    );
    const run = await store.createRun({
      template: "standing-order",
      title: "Due checks",
      status: "running",
      params: standingOrderParams(),
      budget: { maxIterations: 3 },
    });
    const engine = new MainOrchestrationEngine({
      store,
      controlSession,
      now: time.now,
    });

    await engine.tickDueRuns();
    await engine.tickDueRuns();
    time.set(101_000);
    await engine.tickDueRuns();

    expect(controlSession).toHaveBeenCalledTimes(2);
    await expect(store.getRun(run.id)).resolves.toMatchObject({
      status: "running",
      steps: [{ kind: "standing-order-tick" }, { kind: "standing-order-tick" }],
    });
  });
});
