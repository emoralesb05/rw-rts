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

function providerTarget(
  overrides: Partial<ReturnType<typeof standingOrderParams>> = {}
) {
  return {
    unitId: "unit-2",
    sessionId: "session-2",
    tool: "claude" as const,
    cwd: "/repo",
    status: "idle" as const,
    ...overrides,
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

  it("pauses standing-order runs before sending when runtime budget is exceeded", async () => {
    const time = clock(27_000);
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
      title: "Runtime budget",
      status: "running",
      params: standingOrderParams(),
      budget: { maxRuntimeMs: 10 },
    });
    time.set(27_020);
    const engine = new MainOrchestrationEngine({
      store,
      controlSession,
      now: time.now,
    });

    await engine.tickOnce(run.id);

    expect(controlSession).not.toHaveBeenCalled();
    await expect(store.getRun(run.id)).resolves.toMatchObject({
      status: "paused",
      pauseReason: "Run exceeded runtime budget (20ms/10ms).",
      events: expect.arrayContaining([
        expect.objectContaining({ kind: "budget_exceeded" }),
      ]),
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

  it("executes provider handoff review runs as one-shot sends", async () => {
    const time = clock(50_000);
    const store = new LocalOrchestrationStore({
      rootDir: await tempRoot(),
      idFactory: ids(),
      now: time.now,
    });
    const controlSession = vi.fn(() =>
      Promise.resolve({ action: "send" as const, ok: true })
    );
    const run = await store.createRun({
      template: "provider-handoff-review",
      title: "Review handoff",
      status: "running",
      params: {
        target: providerTarget(),
        sourceTraceId: "trace-1",
        handoffPrompt: "Review this change.",
      },
    });
    const engine = new MainOrchestrationEngine({
      store,
      controlSession,
      now: time.now,
    });

    await engine.tickOnce(run.id);

    expect(controlSession).toHaveBeenCalledWith({
      action: "send",
      unitId: "unit-2",
      sessionId: "session-2",
      tool: "claude",
      cwd: "/repo",
      status: "idle",
      prompt:
        "[Provider Handoff Review]\n\nReview this change.\n\nSource trace: trace-1",
    });
    await expect(store.getRun(run.id)).resolves.toMatchObject({
      status: "completed",
      steps: [
        {
          kind: "provider-handoff-review-send",
          status: "completed",
          providerSessionId: "session-2",
        },
      ],
      checkpoints: [{ label: "Provider handoff review sent" }],
    });
  });

  it("executes parallel comparison runs against each target", async () => {
    const time = clock(60_000);
    const store = new LocalOrchestrationStore({
      rootDir: await tempRoot(),
      idFactory: ids(),
      now: time.now,
    });
    const controlSession = vi.fn(() =>
      Promise.resolve({ action: "send" as const, ok: true })
    );
    const run = await store.createRun({
      template: "parallel-provider-comparison",
      title: "Compare providers",
      status: "running",
      params: {
        providerTargets: [
          providerTarget(),
          providerTarget({
            unitId: "unit-3",
            sessionId: "session-3",
            tool: "codex",
          }),
        ],
        comparisonPrompt: "Compare these approaches.",
      },
    });
    const engine = new MainOrchestrationEngine({
      store,
      controlSession,
      now: time.now,
    });

    await engine.tickOnce(run.id);

    expect(controlSession).toHaveBeenCalledTimes(2);
    expect(controlSession).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        unitId: "unit-2",
        prompt: "[Parallel Provider Comparison]\n\nCompare these approaches.",
      })
    );
    expect(controlSession).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        unitId: "unit-3",
        tool: "codex",
      })
    );
    await expect(store.getRun(run.id)).resolves.toMatchObject({
      status: "completed",
      steps: [
        { kind: "parallel-provider-comparison-send", status: "completed" },
        { kind: "parallel-provider-comparison-send", status: "completed" },
      ],
    });
  });

  it("executes fix-then-test runs as bounded provider prompts", async () => {
    const time = clock(70_000);
    const store = new LocalOrchestrationStore({
      rootDir: await tempRoot(),
      idFactory: ids(),
      now: time.now,
    });
    const controlSession = vi.fn(() =>
      Promise.resolve({ action: "send" as const, ok: true })
    );
    const run = await store.createRun({
      template: "fix-then-test",
      title: "Fix failing tests",
      status: "running",
      params: {
        target: providerTarget({ tool: "codex" }),
        taskPrompt: "Fix the failing renderer test.",
        verificationCommand: "bun run test",
      },
    });
    const engine = new MainOrchestrationEngine({
      store,
      controlSession,
      now: time.now,
    });

    await engine.tickOnce(run.id);

    expect(controlSession).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: "codex",
        prompt:
          "[Fix Then Test]\n\nTask:\nFix the failing renderer test.\n\nVerification:\nbun run test",
      })
    );
    await expect(store.getRun(run.id)).resolves.toMatchObject({
      status: "completed",
      steps: [{ kind: "fix-then-test-send", status: "completed" }],
      checkpoints: [{ label: "Fix-then-test prompt sent" }],
    });
  });

  it("pauses template runs with missing provider targets", async () => {
    const store = new LocalOrchestrationStore({
      rootDir: await tempRoot(),
      idFactory: ids(),
      now: clock(80_000).now,
    });
    const controlSession = vi.fn();
    const run = await store.createRun({
      template: "parallel-provider-comparison",
      title: "Broken comparison",
      status: "running",
      params: {
        providerTargets: [],
        comparisonPrompt: "Compare this.",
      },
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
        "Parallel provider comparison run is missing provider targets.",
    });
  });
});
