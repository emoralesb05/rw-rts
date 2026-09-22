import type { AgentTool } from "./events";
import type { SpanRecord, TraceRecord } from "./traces";

export type TraceMonitorKind =
  "waiting" | "slow_tool" | "stale_trace" | "error_trace";

export type TraceMonitorSeverity = "warning" | "critical";

export type TraceMonitorSignal = {
  id: string;
  traceId: string;
  sessionId: string;
  tool: AgentTool;
  spanId?: string;
  kind: TraceMonitorKind;
  severity: TraceMonitorSeverity;
  title: string;
  detail: string;
  since: number;
  durationMs: number;
};

export type TraceMonitorOptions = {
  now?: number;
  waitMs?: number;
  slowToolMs?: number;
  staleTraceMs?: number;
  recentErrorWindowMs?: number;
};

const DEFAULT_WAIT_MS = 30_000;
const DEFAULT_SLOW_TOOL_MS = 60_000;
const DEFAULT_STALE_TRACE_MS = 120_000;
const DEFAULT_RECENT_ERROR_WINDOW_MS = 10 * 60_000;

export function evaluateTraceMonitors(
  traces: readonly TraceRecord[],
  options: TraceMonitorOptions = {}
): TraceMonitorSignal[] {
  const now = options.now ?? Date.now();
  const waitMs = options.waitMs ?? DEFAULT_WAIT_MS;
  const slowToolMs = options.slowToolMs ?? DEFAULT_SLOW_TOOL_MS;
  const staleTraceMs = options.staleTraceMs ?? DEFAULT_STALE_TRACE_MS;
  const recentErrorWindowMs =
    options.recentErrorWindowMs ?? DEFAULT_RECENT_ERROR_WINDOW_MS;
  const signals: TraceMonitorSignal[] = [];

  for (const trace of traces) {
    const activeWait = trace.spans.find(
      (span) =>
        span.status === "active" &&
        (span.kind === "permission_wait" || span.kind === "user_input_wait") &&
        durationFor(span, now) >= waitMs
    );
    if (activeWait) {
      const label =
        activeWait.kind === "permission_wait" ? "permission" : "input";
      signals.push({
        id: `${trace.traceId}:waiting:${activeWait.spanId}`,
        traceId: trace.traceId,
        sessionId: trace.sessionId,
        tool: trace.tool,
        spanId: activeWait.spanId,
        kind: "waiting",
        severity: "warning",
        title: `Waiting for ${label}`,
        detail: `${trace.tool} has an active ${label} wait.`,
        since: activeWait.startTime,
        durationMs: durationFor(activeWait, now),
      });
    }

    const slowTool = trace.spans
      .filter(
        (span) =>
          span.kind === "tool" &&
          (span.status === "active" || span.status === "ok") &&
          durationFor(span, now) >= slowToolMs
      )
      .sort((a, b) => durationFor(b, now) - durationFor(a, now))[0];
    if (slowTool) {
      signals.push({
        id: `${trace.traceId}:slow_tool:${slowTool.spanId}`,
        traceId: trace.traceId,
        sessionId: trace.sessionId,
        tool: trace.tool,
        spanId: slowTool.spanId,
        kind: "slow_tool",
        severity: "warning",
        title: "Slow tool",
        detail: `${slowTool.name} has run longer than expected.`,
        since: slowTool.startTime,
        durationMs: durationFor(slowTool, now),
      });
    }

    if (
      trace.status === "active" &&
      now - trace.lastEventAt >= staleTraceMs &&
      !activeWait &&
      !slowTool
    ) {
      signals.push({
        id: `${trace.traceId}:stale_trace`,
        traceId: trace.traceId,
        sessionId: trace.sessionId,
        tool: trace.tool,
        kind: "stale_trace",
        severity: "warning",
        title: "No recent activity",
        detail: `${trace.tool} has an active trace with no recent events.`,
        since: trace.lastEventAt,
        durationMs: now - trace.lastEventAt,
      });
    }

    const recentError = trace.spans
      .filter(
        (span) =>
          span.kind !== "session" &&
          span.status === "error" &&
          now - (span.endTime ?? span.startTime) <= recentErrorWindowMs
      )
      .sort(
        (a, b) => (b.endTime ?? b.startTime) - (a.endTime ?? a.startTime)
      )[0];
    if (recentError) {
      signals.push({
        id: `${trace.traceId}:error_trace:${recentError.spanId}`,
        traceId: trace.traceId,
        sessionId: trace.sessionId,
        tool: trace.tool,
        spanId: recentError.spanId,
        kind: "error_trace",
        severity: "critical",
        title: "Trace error",
        detail: recentError.content?.summary ?? recentError.name,
        since: recentError.endTime ?? recentError.startTime,
        durationMs: now - (recentError.endTime ?? recentError.startTime),
      });
    }
  }

  return signals.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    return b.since - a.since;
  });
}

function durationFor(span: SpanRecord, now: number): number {
  if (span.status === "active") return now - span.startTime;
  return (span.endTime ?? now) - span.startTime;
}
