import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentEvent } from "@shared/events";
import {
  LocalTraceStore,
  loadTraceDay,
  traceDay,
  traceFileForDay,
} from "./trace-store";

let root: string | undefined;

function event(
  timestamp: number,
  kind: AgentEvent["kind"],
  payload: AgentEvent["payload"] = {}
): AgentEvent {
  return {
    sessionId: "s1",
    tool: "codex",
    cwd: "/repo",
    repoRoot: "/repo",
    timestamp,
    kind,
    payload,
    source: "realmkeeper",
  };
}

async function tempRoot(): Promise<string> {
  root = await mkdtemp(join(tmpdir(), "realmkeeper-traces-"));
  return root;
}

describe("LocalTraceStore", () => {
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
    root = undefined;
  });

  it("appends projected trace records to a day-scoped JSONL file", async () => {
    const dir = await tempRoot();
    const store = new LocalTraceStore({ rootDir: dir });

    await store.ingest(
      event(Date.UTC(2026, 6, 3, 12), "user_prompt", {
        text: "continue",
      })
    );
    await store.ingest(event(Date.UTC(2026, 6, 3, 12, 0, 1), "session_end"));
    await store.flush();

    const day = "2026-07-03";
    const file = await readFile(traceFileForDay(dir, day), "utf8");
    const lines = file.trim().split("\n");
    expect(lines).toHaveLength(2);

    const loaded = await loadTraceDay(dir, day);
    expect(loaded).toHaveLength(2);
    expect(loaded[1]).toMatchObject({
      traceId: "trace:codex:s1",
      status: "completed",
      endedAt: Date.UTC(2026, 6, 3, 12, 0, 1),
    });
  });

  it("keeps latest traces indexed in memory", async () => {
    const store = new LocalTraceStore({ rootDir: await tempRoot() });

    const trace = await store.ingest(
      event(1, "session_control", {
        controlAction: "interrupt",
        ok: true,
      })
    );

    expect(store.get("trace:codex:s1")).toBe(trace);
    expect(store.currentTraces()).toEqual([trace]);
  });

  it("returns an empty list for missing trace days", async () => {
    const dir = await tempRoot();
    expect(await loadTraceDay(dir, traceDay(Date.UTC(2026, 6, 4)))).toEqual([]);
  });
});
