import { afterEach, describe, expect, it } from "vitest";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AgentEvent } from "@shared/events";
import {
  UpdateAttentionRequestSchema,
  type MonitorAttentionItem,
} from "@shared/schemas";
import { ATTENTION_SNOOZE_MS, MonitorAttention } from "./monitor-attention";
import { MonitorService } from "./monitor-service";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function path() {
  const dir = mkdtempSync(join(tmpdir(), "attention-test-"));
  dirs.push(dir);
  return join(dir, "attention.json");
}
function event(
  kind: AgentEvent["kind"],
  timestamp: number,
  requestId = "SECRET-REQUEST-1"
): AgentEvent {
  return {
    sessionId: "session",
    tool: "codex",
    cwd: "/repo",
    timestamp,
    kind,
    source: "hook",
    payload: { requestId, input: "SECRET-PROMPT" },
  };
}
function request(
  item: MonitorAttentionItem,
  action: "acknowledge" | "snooze" | "reopen" = "acknowledge"
) {
  return {
    attentionId: item.attentionId,
    occurrenceId: item.occurrenceId!,
    action,
  };
}

describe("local attention workflow", () => {
  it("never conflates different requests at the same timestamp or requests without IDs", () => {
    const service = new MonitorService(() => 1000);
    service.ingestAgentEvent(event("permission_request", 1000, "one"));
    service.updateAttention(request(service.getSnapshot().attention[0]));
    service.ingestAgentEvent(event("permission_request", 1000, "two"));
    expect(service.getSnapshot().attention[0].lifecycle).toBe("open");
    service.ingestAgentEvent(event("permission_request", 1000, ""));
    const first = service.getSnapshot().attention[0];
    service.updateAttention(request(first));
    service.ingestAgentEvent(event("permission_request", 1000, ""));
    expect(service.getSnapshot().attention[0].occurrenceId).not.toBe(
      first.occurrenceId
    );
    expect(service.getSnapshot().attention[0].lifecycle).toBe("open");
  });

  it("does not revive an expired snooze from disk", () => {
    const file = path();
    let now = 1000;
    const prefs = new MonitorAttention(file, () => now);
    const service = new MonitorService(() => now, prefs);
    service.ingestAgentEvent(event("permission_request", now));
    service.updateAttention(
      request(service.getSnapshot().attention[0], "snooze")
    );
    now += ATTENTION_SNOOZE_MS;
    const loaded = new MonitorAttention(file, () => now);
    loaded.load();
    const restarted = new MonitorService(() => now, loaded);
    restarted.ingestAgentEvent(event("permission_request", now));
    expect(restarted.getSnapshot().attention[0].lifecycle).toBe("open");
  });
  it.each(["acknowledge", "snooze"] as const)(
    "persists %s only for a freshly confirmed identical request",
    (action) => {
      const file = path();
      let now = 1000;
      const prefs = new MonitorAttention(file, () => now);
      const service = new MonitorService(() => now, prefs);
      service.ingestAgentEvent(event("permission_request", now));
      const before = service.getSnapshot();
      service.updateAttention(request(before.attention[0], action));
      expect(service.getSnapshot().agents).toEqual(before.agents);
      const disk = readFileSync(file, "utf8");
      expect(disk).not.toContain("SECRET");
      expect(disk).not.toContain("session");
      now++;
      const restoredPrefs = new MonitorAttention(file, () => now);
      restoredPrefs.load();
      const restored = new MonitorService(() => now, restoredPrefs);
      expect(restored.getSnapshot().attention).toEqual([]);
      expect(restored.getSnapshot().agents).toEqual([]);
      restored.ingestAgentEvent(event("permission_request", now));
      expect(restored.getSnapshot().attention[0].lifecycle).toBe(
        action === "acknowledge" ? "acknowledged" : "snoozed"
      );
      expect(restored.getSnapshot().agents[0].state).toBe("blocked");
      restored.ingestAgentEvent(
        event("permission_request", ++now, "NEW-REQUEST")
      );
      expect(restored.getSnapshot().attention[0].lifecycle).toBe("open");
      expect(() =>
        restored.updateAttention(request(before.attention[0]))
      ).toThrow("changed or resolved");
    }
  );

  it("does not let a late old resolution clear a newer request", () => {
    const service = new MonitorService(() => 3000);
    service.ingestAgentEvent(event("permission_request", 1000, "old"));
    service.ingestAgentEvent(event("permission_request", 2000, "new"));
    service.ingestAgentEvent(event("permission_resolved", 3000, "old"));
    expect(service.getSnapshot().agents[0].state).toBe("blocked");
    service.ingestAgentEvent(event("permission_resolved", 3000, "new"));
    expect(service.getSnapshot().attention).toEqual([]);
  });

  it("publishes snooze expiry without a provider event and leaves the agent blocked", () => {
    let now = 1000;
    const service = new MonitorService(() => now);
    const deltas: string[] = [];
    service.subscribe((delta) => deltas.push(delta.attention[0]?.lifecycle));
    service.ingestAgentEvent(event("user_input_request", now));
    service.updateAttention(
      request(service.getSnapshot().attention[0], "snooze")
    );
    now += ATTENTION_SNOOZE_MS;
    service.tick();
    expect(deltas.at(-1)).toBe("open");
    expect(service.getSnapshot().agents[0].state).toBe("blocked");
  });

  it("clears choices on resolution and allows manual reopening", () => {
    const file = path();
    const prefs = new MonitorAttention(file, () => 1000);
    const service = new MonitorService(() => 1000, prefs);
    service.subscribe(() => {});
    service.ingestAgentEvent(event("permission_request", 1000));
    const req = request(service.getSnapshot().attention[0]);
    service.updateAttention(req);
    service.updateAttention({ ...req, action: "reopen" });
    expect(service.getSnapshot().attention[0].lifecycle).toBe("open");
    service.updateAttention(req);
    service.ingestAgentEvent(event("permission_resolved", 1000));
    expect(JSON.parse(readFileSync(file, "utf8")).choices).toEqual([]);
    service.ingestAgentEvent(event("permission_request", 1000));
    expect(service.getSnapshot().attention[0].lifecycle).toBe("open");
  });

  it("keeps polling alerts acknowledged in-process but reopens uncertain continuity after restart", () => {
    const prefs = new MonitorAttention(path(), () => 1000);
    const base: MonitorAttentionItem = {
      attentionId: "integration:x",
      kind: "integration",
      severity: "warning",
      title: "Source degraded",
      summary: "offline",
      sourceId: "x",
      openedAt: 1,
      updatedAt: 1,
      lifecycle: "open",
    };
    const item = prefs.project([base])[0];
    prefs.update(request(item), [item]);
    expect(prefs.project([{ ...base, updatedAt: 2 }])[0].lifecycle).toBe(
      "acknowledged"
    );
    expect(new MonitorAttention().project([base])[0].occurrenceId).not.toBe(
      item.occurrenceId
    );
    expect(
      prefs.project([{ ...base, severity: "critical" }])[0].lifecycle
    ).toBe("open");
  });

  it("quarantines corrupt preferences and rolls back failed writes", () => {
    const file = path();
    writeFileSync(file, "{corrupt");
    const prefs = new MonitorAttention(file);
    prefs.load();
    expect(prefs.warning).toContain("quarantined");
    expect(readdirSync(dirs.at(-1)!)[0]).toContain("quarantine");
    const badParent = path();
    writeFileSync(badParent, "not a directory");
    const failed = new MonitorAttention(join(badParent, "attention.json"));
    const service = new MonitorService(Date.now, failed);
    service.ingestAgentEvent(event("permission_request", Date.now()));
    expect(() =>
      service.updateAttention(request(service.getSnapshot().attention[0]))
    ).toThrow("could not be saved");
    expect(service.getSnapshot().attention[0].lifecycle).toBe("open");
  });

  it("rejects permission answers and renderer-controlled snooze durations at the IPC schema", () => {
    const valid = { attentionId: "a", occurrenceId: "o", action: "snooze" };
    expect(UpdateAttentionRequestSchema.safeParse(valid).success).toBe(true);
    expect(
      UpdateAttentionRequestSchema.safeParse({ ...valid, action: "allow" })
        .success
    ).toBe(false);
    expect(
      UpdateAttentionRequestSchema.safeParse({
        ...valid,
        snoozedUntil: Infinity,
      }).success
    ).toBe(false);
  });
});
