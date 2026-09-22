import { randomUUID, createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import type {
  MonitorAttentionItem,
  UpdateAttentionRequest,
} from "@shared/schemas";

const ChoiceSchema = z.object({
  key: z.string().regex(/^[a-f0-9]{64}$/),
  lifecycle: z.enum(["acknowledged", "snoozed"]),
  updatedAt: z.number().finite().nonnegative(),
  snoozedUntil: z.number().finite().nonnegative().optional(),
});
const FileSchema = z.object({
  schemaVersion: z.literal(1),
  choices: z.array(ChoiceSchema).max(1000),
});
type Choice = z.infer<typeof ChoiceSchema>;
const RETENTION_MS = 30 * 86400_000;
export const ATTENTION_SNOOZE_MS = 15 * 60_000;

/** Notification workflow only. This module has no provider/permission controls. */
export class MonitorAttention {
  private choices = new Map<string, Choice>();
  private active = new Map<string, string>();
  private fingerprints = new Map<string, string>();
  private writable = true;
  warning?: string;
  constructor(
    private readonly file?: string,
    private readonly now = Date.now
  ) {}

  load(): void {
    if (!this.file) return;
    try {
      if (statSync(this.file).size > 512 * 1024) throw new Error("oversized");
      const parsed = FileSchema.parse(
        JSON.parse(readFileSync(this.file, "utf8"))
      );
      this.choices = new Map(parsed.choices.map((entry) => [entry.key, entry]));
      this.prune();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      try {
        renameSync(this.file, `${this.file}.quarantine-${randomUUID()}`);
        this.warning =
          "Saved attention preferences were quarantined; alerts reopen for safety.";
      } catch {
        this.writable = false;
        this.warning =
          "Attention preferences are unavailable; the original file was left untouched.";
      }
    }
  }

  project(items: MonitorAttentionItem[]): MonitorAttentionItem[] {
    this.prune();
    const next = new Map<string, string>();
    const fingerprints = new Map<string, string>();
    const result = items.map((item) => {
      // Requests carry a source-backed occurrence key. Other conditions get a
      // process-local occurrence: a restart cannot prove continuity across a gap.
      const fingerprint = JSON.stringify([
        item.kind,
        item.severity,
        item.title,
      ]);
      fingerprints.set(item.attentionId, fingerprint);
      const occurrenceId =
        item.occurrenceId ??
        (this.fingerprints.get(item.attentionId) === fingerprint
          ? this.active.get(item.attentionId)
          : undefined) ??
        randomUUID();
      next.set(item.attentionId, occurrenceId);
      const choice = this.choices.get(keyFor(item.attentionId, occurrenceId));
      return {
        ...item,
        occurrenceId,
        lifecycle: choice?.lifecycle ?? "open",
        snoozedUntil: choice?.snoozedUntil,
      } as MonitorAttentionItem;
    });
    let removed = false;
    for (const [id, occurrence] of this.active) {
      if (next.get(id) !== occurrence)
        removed = this.choices.delete(keyFor(id, occurrence)) || removed;
    }
    this.active = next;
    this.fingerprints = fingerprints;
    if (removed) {
      try {
        this.save();
      } catch {
        /* Warning remains visible; live state is unaffected. */
      }
    }
    return result;
  }

  update(req: UpdateAttentionRequest, items: MonitorAttentionItem[]): void {
    const item = items.find(
      (candidate) =>
        candidate.attentionId === req.attentionId &&
        candidate.occurrenceId === req.occurrenceId
    );
    if (!item)
      throw new Error(
        "This alert changed or resolved. Refresh before updating it."
      );
    const key = keyFor(req.attentionId, req.occurrenceId);
    const previous = new Map(this.choices);
    if (req.action === "reopen") this.choices.delete(key);
    else
      this.choices.set(key, {
        key,
        lifecycle: req.action === "acknowledge" ? "acknowledged" : "snoozed",
        updatedAt: this.now(),
        snoozedUntil:
          req.action === "snooze"
            ? this.now() + ATTENTION_SNOOZE_MS
            : undefined,
      });
    this.prune();
    try {
      this.save();
    } catch (error) {
      this.choices = previous;
      throw error;
    }
  }

  private prune(): void {
    const now = this.now();
    this.choices = new Map(
      [...this.choices.values()]
        .filter(
          (entry) =>
            entry.updatedAt <= now &&
            entry.updatedAt >= now - RETENTION_MS &&
            (entry.lifecycle !== "snoozed" ||
              (entry.snoozedUntil !== undefined &&
                entry.snoozedUntil > now &&
                entry.snoozedUntil <= entry.updatedAt + ATTENTION_SNOOZE_MS))
        )
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 1000)
        .map((entry) => [entry.key, entry])
    );
  }

  private save(): void {
    if (!this.file) return;
    if (!this.writable) throw new Error(this.warning);
    try {
      mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
      writeFileSync(
        `${this.file}.tmp`,
        JSON.stringify({
          schemaVersion: 1,
          choices: [...this.choices.values()],
        }),
        { mode: 0o600 }
      );
      renameSync(`${this.file}.tmp`, this.file);
    } catch {
      this.warning =
        "Attention preferences could not be saved. Your notification change was not applied.";
      throw new Error(this.warning);
    }
  }
}

function keyFor(id: string, occurrence: string): string {
  return createHash("sha256")
    .update(JSON.stringify([id, occurrence]))
    .digest("hex");
}
