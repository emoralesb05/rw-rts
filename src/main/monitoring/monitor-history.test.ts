import { afterEach, describe, expect, it } from "vitest";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MonitorHistoryStore } from "./monitor-history";
import { MonitorService } from "./monitor-service";

const dirs: string[] = [];
function file() {
  const dir = mkdtempSync(join(tmpdir(), "monitor-history-test-"));
  dirs.push(dir);
  return join(dir, "last-seen.json");
}
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function agent(
  now: number,
  kind: "tool_use" | "permission_request" = "tool_use"
) {
  const service = new MonitorService(() => now);
  service.ingestAgentEvent({
    tool: "codex",
    sessionId: "session-1",
    cwd: "/private-repo",
    timestamp: now,
    kind,
    source: "hook",
    payload: {
      name: "Bash",
      input: "SECRET-PROMPT",
      requestId: "SECRET-REQUEST",
    },
  });
  return service.getSnapshot().agents[0];
}

describe("bounded monitor history", () => {
  it("restores historical blockers and gaps without restoring any live state or controls", () => {
    const path = file();
    const first = new MonitorHistoryStore(path, () => 1000);
    first.load();
    first.observe([agent(1000, "permission_request")]);
    first.checkpoint();
    const second = new MonitorHistoryStore(path, () => 2000);
    second.load();
    expect(second.snapshot()).toEqual({
      entries: [
        {
          agentId: "codex:session-1",
          providerId: "codex",
          state: "blocked",
          lastObservedAt: 1000,
        },
      ],
      gaps: [{ from: 1000, to: 2000 }],
    });
    expect(new MonitorService(() => 2000).getSnapshot().agents).toEqual([]);
    const raw = readFileSync(path, "utf8");
    for (const secret of [
      "SECRET",
      "/private-repo",
      "controls",
      "evidence",
      "requestId",
      "Bash",
    ])
      expect(raw).not.toContain(secret);
  });

  it("deduplicates identity, ignores old observations and freshness-only changes", () => {
    const history = new MonitorHistoryStore(file(), () => 4000);
    const record = agent(2000);
    history.observe([
      record,
      record,
      { ...record, state: "offline" },
      agent(1000),
    ]);
    expect(history.snapshot().entries).toHaveLength(1);
    expect(history.snapshot().entries[0].state).toBe("working");
    history.observe([agent(3000, "permission_request")]);
    expect(history.snapshot().entries[0].state).toBe("blocked");
    history.observe([
      { ...record, agentId: "claude:session-1", providerId: "claude" },
    ]);
    expect(history.snapshot().entries).toHaveLength(2);
  });

  it("caps memory and expires old metadata without touching other files", () => {
    let now = 5000;
    const path = file();
    const history = new MonitorHistoryStore(path, () => now);
    history.observe(
      Array.from({ length: 250 }, (_, i) => ({
        ...agent(1000 + i),
        agentId: `codex:${i}`,
      }))
    );
    expect(history.snapshot().entries).toHaveLength(200);
    expect(history.snapshot().entries[0].lastObservedAt).toBe(1249);
    now += 31 * 24 * 60 * 60 * 1000;
    history.checkpoint();
    expect(history.snapshot().entries).toEqual([]);
    expect(readdirSync(dirs.at(-1)!)).toEqual(["last-seen.json"]);
  });

  it("quarantines malformed and future-schema files, preserving originals", () => {
    for (const raw of [
      "{broken",
      '{"schemaVersion":99}',
      "x".repeat(512 * 1024 + 1),
    ]) {
      const path = file();
      writeFileSync(path, raw);
      const history = new MonitorHistoryStore(path, () => 1000);
      history.load();
      expect(history.snapshot().warning).toContain("quarantined");
      const quarantine = readdirSync(dirs.at(-1)!)[0];
      expect(readFileSync(join(dirs.at(-1)!, quarantine), "utf8")).toBe(raw);
      history.checkpoint();
      expect(JSON.parse(readFileSync(path, "utf8")).schemaVersion).toBe(1);
    }
  });

  it("reports write failure and keeps live monitoring independent", () => {
    const parent = file();
    writeFileSync(parent, "not a directory");
    const history = new MonitorHistoryStore(join(parent, "last-seen.json"));
    history.observe([agent(Date.now())]);
    history.checkpoint();
    expect(history.snapshot().warning).toContain("could not be saved");
    expect(history.snapshot().entries).toHaveLength(1);
  });
});
