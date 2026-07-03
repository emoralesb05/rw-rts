import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  LocalOrchestrationStore,
  orchestrationFile,
} from "./orchestration-store";

let root: string | undefined;

async function tempRoot(): Promise<string> {
  root = await mkdtemp(join(tmpdir(), "realmkeeper-orchestration-"));
  return root;
}

function ids() {
  let n = 0;
  return () => `id-${++n}`;
}

function clock(start = 1_000) {
  let now = start;
  return () => now++;
}

describe("LocalOrchestrationStore", () => {
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
    root = undefined;
  });

  it("creates and persists durable orchestration runs", async () => {
    const dir = await tempRoot();
    const store = new LocalOrchestrationStore({
      rootDir: dir,
      idFactory: ids(),
      now: clock(),
    });

    const run = await store.createRun({
      template: "standing-order",
      title: "Keep tests moving",
      cwd: "/repo",
      repoRoot: "/repo",
      budget: { maxIterations: 3, maxRuntimeMs: 60_000 },
    });

    expect(run).toMatchObject({
      id: "id-1",
      status: "queued",
      template: "standing-order",
      title: "Keep tests moving",
      budget: { maxIterations: 3, maxRuntimeMs: 60_000 },
      events: [{ id: "id-2", kind: "created", at: 1_000 }],
    });

    const reloaded = new LocalOrchestrationStore({ rootDir: dir });
    await expect(reloaded.getRun("id-1")).resolves.toMatchObject({
      id: "id-1",
      status: "queued",
    });
  });

  it("records steps, checkpoints, and lifecycle transitions", async () => {
    const store = new LocalOrchestrationStore({
      rootDir: await tempRoot(),
      idFactory: ids(),
      now: clock(2_000),
    });
    const run = await store.createRun({
      template: "fix-then-test",
      title: "Fix then test",
      status: "running",
    });

    await store.upsertStep(run.id, {
      id: "step-1",
      title: "Run tests",
      kind: "provider-prompt",
      status: "running",
      attempts: 1,
      createdAt: 2_001,
      updatedAt: 2_001,
      providerSessionId: "s1",
      traceId: "trace:codex:s1",
    });
    await store.addCheckpoint(run.id, {
      id: "checkpoint-1",
      label: "Tests started",
      createdAt: 2_002,
      stepId: "step-1",
      traceId: "trace:codex:s1",
      state: { command: "pnpm test" },
    });
    await store.pauseRun(run.id, "Waiting for review.");
    await store.resumeRun(run.id);
    const completed = await store.completeRun(run.id);

    expect(completed.status).toBe("completed");
    expect(completed.lastCheckpointId).toBe("checkpoint-1");
    expect(completed.steps[0]).toMatchObject({
      id: "step-1",
      updatedAt: 2_001,
    });
    expect(completed.checkpoints[0]).toMatchObject({
      id: "checkpoint-1",
      state: { command: "pnpm test" },
    });
    expect(completed.events.map((event) => event.kind)).toEqual([
      "started",
      "step_updated",
      "checkpoint",
      "paused",
      "resumed",
      "completed",
    ]);
    expect(completed.endedAt).toBe(2_005);
  });

  it("records stop and failure terminal states", async () => {
    const store = new LocalOrchestrationStore({
      rootDir: await tempRoot(),
      idFactory: ids(),
      now: clock(3_000),
    });
    const stopped = await store.createRun({
      template: "handoff",
      title: "Review handoff",
    });
    const failed = await store.createRun({
      template: "comparison",
      title: "Compare providers",
    });

    await expect(store.stopRun(stopped.id, "User stopped.")).resolves.toMatchObject(
      {
        status: "stopped",
        endedAt: 3_002,
      }
    );
    await expect(
      store.failRun(failed.id, "Provider capability missing.")
    ).resolves.toMatchObject({
      status: "failed",
      failureReason: "Provider capability missing.",
      endedAt: 3_003,
    });
  });

  it("migrates draft array-shaped stores into the v1 run map", async () => {
    const dir = await tempRoot();
    const path = orchestrationFile(dir);
    await writeFile(
      path,
      JSON.stringify({
        runs: [
          {
            id: "run-1",
            template: "standing-order",
            title: "Old run",
            status: "queued",
            createdAt: 1,
            updatedAt: 1,
            providerSessions: [],
            traceIds: [],
            permissionRequestIds: [],
            userInputRequestIds: [],
            steps: [],
            checkpoints: [],
            budget: {},
            events: [],
          },
        ],
      }),
      "utf8"
    );

    const store = new LocalOrchestrationStore({ rootDir: dir });

    await expect(store.getRun("run-1")).resolves.toMatchObject({
      id: "run-1",
      title: "Old run",
    });
  });

  it("pauses running runs during restart recovery", async () => {
    const store = new LocalOrchestrationStore({
      rootDir: await tempRoot(),
      idFactory: ids(),
      now: clock(4_000),
    });
    const running = await store.createRun({
      template: "standing-order",
      title: "Running",
      status: "running",
    });
    await store.createRun({
      template: "standing-order",
      title: "Queued",
    });

    const recovered = await store.recoverAfterRestart();

    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toMatchObject({
      id: running.id,
      status: "paused",
      pauseReason:
        "Paused after restart; validate checkpoint and provider capability before resuming.",
    });
    await expect(store.listRuns()).resolves.toHaveLength(2);
    await expect(store.getRun(running.id)).resolves.toMatchObject({
      status: "paused",
      events: expect.arrayContaining([
        expect.objectContaining({ kind: "recovered" }),
      ]),
    });
  });

  it("falls back to an empty store for corrupt JSON", async () => {
    const dir = await tempRoot();
    const path = orchestrationFile(dir);
    await writeFile(path, "{nope", "utf8");

    const store = new LocalOrchestrationStore({ rootDir: dir });

    await expect(store.listRuns()).resolves.toEqual([]);
  });
});
