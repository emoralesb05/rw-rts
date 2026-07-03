import { mkdir, readFile, appendFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { AgentEvent } from "@shared/events";
import {
  exportTracesToOtel,
  type TraceExportContentMode,
} from "@shared/trace-export";
import { projectTraces, type TraceRecord } from "@shared/traces";
import { bus } from "./event-bus";

export type TraceStoreOptions = {
  rootDir?: string;
};

export type ExportTraceDayOptions = {
  rootDir?: string;
  day: string;
  traceId?: string;
  sessionId?: string;
  contentMode?: TraceExportContentMode;
};

export type ExportTraceDayResult = {
  path: string;
  traceCount: number;
  spanCount: number;
  contentMode: TraceExportContentMode;
};

export function defaultTraceRoot(): string {
  return join(homedir(), ".realmkeeper", "traces");
}

export function traceDay(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function traceFileForDay(rootDir: string, day: string): string {
  return join(rootDir, `${day}.jsonl`);
}

function traceKey(event: AgentEvent): string {
  return `${event.tool}\0${event.sessionId}`;
}

export class LocalTraceStore {
  private readonly rootDir: string;
  private readonly eventsByTraceKey = new Map<string, AgentEvent[]>();
  private readonly tracesById = new Map<string, TraceRecord>();
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(options: TraceStoreOptions = {}) {
    this.rootDir = options.rootDir ?? defaultTraceRoot();
  }

  async ingest(event: AgentEvent): Promise<TraceRecord> {
    const key = traceKey(event);
    const events = this.eventsByTraceKey.get(key) ?? [];
    events.push(event);
    this.eventsByTraceKey.set(key, events);

    const trace = projectTraces(events)[0];
    this.tracesById.set(trace.traceId, trace);
    const write = this.writeQueue.then(() => this.append(trace));
    this.writeQueue = write.catch((err) => {
      console.error("[realmkeeper] trace persist failed:", err);
    });
    await this.writeQueue;
    return trace;
  }

  get(traceId: string): TraceRecord | undefined {
    return this.tracesById.get(traceId);
  }

  currentTraces(): TraceRecord[] {
    return Array.from(this.tracesById.values()).sort(
      (a, b) => b.lastEventAt - a.lastEventAt
    );
  }

  async flush(): Promise<void> {
    await this.writeQueue;
  }

  private async append(trace: TraceRecord): Promise<void> {
    const path = traceFileForDay(this.rootDir, traceDay(trace.lastEventAt));
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, JSON.stringify(trace) + "\n", "utf8");
  }
}

export async function loadTraceDay(
  rootDir: string,
  day: string
): Promise<TraceRecord[]> {
  const path = traceFileForDay(rootDir, day);
  const raw = await readFile(path, "utf8").catch(
    (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") return "";
      throw err;
    }
  );
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as TraceRecord);
}

export async function exportTraceDay(
  options: ExportTraceDayOptions
): Promise<ExportTraceDayResult> {
  const rootDir = options.rootDir ?? defaultTraceRoot();
  const contentMode = options.contentMode ?? "metadata-only";
  const traces = latestTraceSnapshots(await loadTraceDay(rootDir, options.day))
    .filter((trace) =>
      options.traceId ? trace.traceId === options.traceId : true
    )
    .filter((trace) =>
      options.sessionId ? trace.sessionId === options.sessionId : true
    );
  const exported = exportTracesToOtel(traces, {
    contentMode,
    serviceName: "realmkeeper",
  });
  const outputDir = join(rootDir, "exports");
  await mkdir(outputDir, { recursive: true });
  const path = join(
    outputDir,
    `${options.day}-${exportTargetSegment(options)}.otel.json`
  );
  await writeFile(path, JSON.stringify(exported, null, 2) + "\n", "utf8");
  return {
    path,
    traceCount: traces.length,
    spanCount: traces.reduce((sum, trace) => sum + trace.spans.length, 0),
    contentMode,
  };
}

function latestTraceSnapshots(records: TraceRecord[]): TraceRecord[] {
  const latest = new Map<string, TraceRecord>();
  for (const record of records) {
    const current = latest.get(record.traceId);
    if (!current || record.lastEventAt >= current.lastEventAt) {
      latest.set(record.traceId, record);
    }
  }
  return Array.from(latest.values()).sort((a, b) => {
    if (a.startedAt !== b.startedAt) return a.startedAt - b.startedAt;
    return a.traceId.localeCompare(b.traceId);
  });
}

function exportTargetSegment(options: ExportTraceDayOptions): string {
  if (options.traceId) return safeFileSegment(options.traceId);
  if (options.sessionId) return safeFileSegment(options.sessionId);
  return "all";
}

function safeFileSegment(value: string): string {
  const safe = value.replace(/[^a-zA-Z0-9_.-]+/g, "_").slice(0, 96);
  return safe || "trace";
}

export const traceStore = new LocalTraceStore();

let stopTraceStoreListener: (() => void) | null = null;

export function startTraceStore(): void {
  if (stopTraceStoreListener) return;
  stopTraceStoreListener = bus.onAgentEvent((event) => {
    void traceStore.ingest(event);
  });
}

export function stopTraceStore(): void {
  if (!stopTraceStoreListener) return;
  stopTraceStoreListener();
  stopTraceStoreListener = null;
}

export function flushTraceStore(): Promise<void> {
  return traceStore.flush();
}
