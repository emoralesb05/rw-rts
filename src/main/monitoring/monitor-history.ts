import {
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  MonitorHistorySchema,
  MonitorHistoryEntrySchema,
  type MonitorHistory,
  type AgentMonitorRecord,
} from "@shared/schemas";

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const CheckpointSchema = z.object({
  schemaVersion: z.literal(1),
  checkpointAt: z.number().finite().nonnegative(),
  history: MonitorHistorySchema.omit({ warning: true }),
});

/** Bounded last-seen memory, never an input to live reconciliation. */
export class MonitorHistoryStore {
  private history: MonitorHistory = { entries: [], gaps: [] };
  private writable = true;
  constructor(
    private readonly file: string,
    private readonly now = Date.now
  ) {}

  load(): void {
    try {
      if (statSync(this.file).size > 512 * 1024) throw new Error("oversized");
      const saved = CheckpointSchema.parse(
        JSON.parse(readFileSync(this.file, "utf8"))
      );
      const now = this.now();
      this.history = {
        entries: saved.history.entries,
        gaps: [
          ...saved.history.gaps,
          { from: Math.min(saved.checkpointAt, now), to: now },
        ].slice(-20),
      };
      this.prune();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      // Keep the original recoverable. Never overwrite a file we couldn't read.
      try {
        renameSync(this.file, `${this.file}.quarantine-${randomUUID()}`);
        this.history.warning =
          "Saved monitoring history was unreadable and quarantined; earlier activity may be missing.";
      } catch {
        this.writable = false;
        this.history.warning =
          "Monitoring history is unavailable; the original file was left untouched.";
      }
    }
  }

  observe(agents: AgentMonitorRecord[]): void {
    const entries = new Map(
      this.history.entries.map((entry) => [entry.agentId, entry])
    );
    for (const agent of agents) {
      // Explicit allowlist: never serialize an agent record or its evidence.
      const parsed = MonitorHistoryEntrySchema.safeParse({
        agentId: agent.agentId,
        providerId: agent.providerId,
        state: agent.state,
        lastObservedAt: agent.lastObservedAt,
      });
      if (!parsed.success || parsed.data.lastObservedAt > this.now()) continue;
      const previous = entries.get(agent.agentId);
      // Freshness ticks aren't new observations. Preserve the last observed state.
      if (
        previous &&
        (previous.lastObservedAt > agent.lastObservedAt ||
          (previous.lastObservedAt === agent.lastObservedAt &&
            (previous.state === agent.state ||
              agent.state === "unknown" ||
              agent.state === "offline")))
      )
        continue;
      entries.set(agent.agentId, parsed.data);
    }
    this.history.entries = [...entries.values()];
    this.prune();
  }

  snapshot(): MonitorHistory {
    this.prune();
    return structuredClone(this.history);
  }

  checkpoint(): void {
    if (!this.writable) return;
    this.prune();
    try {
      mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
      const next = `${this.file}.tmp`;
      const { entries, gaps } = this.history;
      writeFileSync(
        next,
        JSON.stringify({
          schemaVersion: 1,
          checkpointAt: this.now(),
          history: { entries, gaps },
        }),
        { mode: 0o600 }
      );
      renameSync(next, this.file);
    } catch {
      this.history.warning =
        "Monitoring history could not be saved; recent activity may be lost on restart.";
    }
  }

  private prune(): void {
    const cutoff = this.now() - RETENTION_MS;
    this.history.entries = this.history.entries
      .filter(
        (entry) =>
          entry.lastObservedAt >= cutoff && entry.lastObservedAt <= this.now()
      )
      .sort((a, b) => b.lastObservedAt - a.lastObservedAt)
      .slice(0, 200);
    this.history.gaps = this.history.gaps
      .filter((gap) => gap.to >= cutoff)
      .slice(-20);
  }
}
