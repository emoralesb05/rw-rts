import type { AgentEvent, AgentTool } from "./events";

export type TraceRedactionPolicy =
  | "metadata-only"
  | "summaries"
  | "full-content";

export type SpanKind =
  | "session"
  | "turn"
  | "tool"
  | "permission_wait"
  | "user_input_wait"
  | "subagent"
  | "error"
  | "session_control";

export type SpanStatus = "active" | "ok" | "error";

export type TraceStatus = "active" | "completed" | "error";

export type TraceAttributeValue = string | number | boolean | null;

export type TraceContent = {
  redacted: boolean;
  summary?: string;
  text?: string;
  size: number;
};

export type SpanRecord = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  sessionId: string;
  tool: AgentTool;
  kind: SpanKind;
  name: string;
  status: SpanStatus;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  attributes: Record<string, TraceAttributeValue>;
  content?: TraceContent;
  eventIds: string[];
};

export type TraceRecord = {
  traceId: string;
  sessionId: string;
  tool: AgentTool;
  cwd: string;
  repoRoot?: string;
  status: TraceStatus;
  startedAt: number;
  lastEventAt: number;
  endedAt?: number;
  attributes: Record<string, TraceAttributeValue>;
  spans: SpanRecord[];
};

export type TraceProjectionOptions = {
  redactionPolicy?: TraceRedactionPolicy;
};

type IndexedEvent = {
  event: AgentEvent;
  index: number;
  eventId: string;
};

type MutableSpan = SpanRecord;

const DEFAULT_REDACTION_POLICY: TraceRedactionPolicy = "summaries";
const SUMMARY_LIMIT = 160;

function stableTraceId(tool: AgentTool, sessionId: string): string {
  return `trace:${tool}:${sessionId}`;
}

function stableSpanId(kind: SpanKind, eventId: string): string {
  return `span:${kind}:${eventId}`;
}

function stableEventIds(events: AgentEvent[]): IndexedEvent[] {
  const counts = new Map<string, number>();
  return events.map((event, index) => {
    const base = [
      event.tool,
      event.sessionId,
      event.timestamp,
      event.kind,
      event.source,
    ].join(":");
    const seen = counts.get(base) ?? 0;
    counts.set(base, seen + 1);
    return {
      event,
      index,
      eventId: `event:${base}:${seen}`,
    };
  });
}

function sortedEvents(events: AgentEvent[]): IndexedEvent[] {
  return stableEventIds(events).sort((a, b) => {
    if (a.event.timestamp !== b.event.timestamp) {
      return a.event.timestamp - b.event.timestamp;
    }
    return a.index - b.index;
  });
}

function groupKey(event: AgentEvent): string {
  return `${event.tool}\0${event.sessionId}`;
}

function compact(value: string, max = SUMMARY_LIMIT): string {
  const oneLine = value.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

function serializeContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function contentFor(
  value: unknown,
  policy: TraceRedactionPolicy
): TraceContent | undefined {
  const text = serializeContent(value);
  if (!text) return undefined;
  if (policy === "metadata-only") {
    return { redacted: true, size: text.length };
  }
  if (policy === "full-content") {
    return { redacted: false, text, summary: compact(text), size: text.length };
  }
  return { redacted: true, summary: compact(text), size: text.length };
}

function finishSpan(
  span: MutableSpan,
  endTime: number,
  status: SpanStatus = span.status
): void {
  span.endTime = Math.max(span.startTime, endTime);
  span.durationMs = span.endTime - span.startTime;
  span.status = status;
}

function payloadString(event: AgentEvent, key: string): string | undefined {
  const value = event.payload[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function toolName(event: AgentEvent): string {
  return payloadString(event, "name") ?? "tool";
}

function isErrorLikeToolResult(event: AgentEvent): boolean {
  if (event.kind !== "tool_result") return false;
  const output = serializeContent(event.payload.output);
  return (
    output.startsWith("<tool_use_error>") ||
    output.startsWith("<error>") ||
    typeof event.payload.error === "string"
  );
}

function span(
  trace: TraceRecord,
  kind: SpanKind,
  event: IndexedEvent,
  name: string,
  parentSpanId: string | undefined,
  attributes: Record<string, TraceAttributeValue> = {},
  content?: TraceContent
): MutableSpan {
  return {
    traceId: trace.traceId,
    spanId: stableSpanId(kind, event.eventId),
    parentSpanId,
    sessionId: trace.sessionId,
    tool: trace.tool,
    kind,
    name,
    status: "active",
    startTime: event.event.timestamp,
    attributes: {
      "gen_ai.system": trace.tool,
      "gen_ai.conversation.id": trace.sessionId,
      ...attributes,
    },
    content,
    eventIds: [event.eventId],
  };
}

export function projectTraces(
  events: AgentEvent[],
  options: TraceProjectionOptions = {}
): TraceRecord[] {
  const policy = options.redactionPolicy ?? DEFAULT_REDACTION_POLICY;
  const groups = new Map<string, IndexedEvent[]>();
  for (const indexed of sortedEvents(events)) {
    const list = groups.get(groupKey(indexed.event)) ?? [];
    list.push(indexed);
    groups.set(groupKey(indexed.event), list);
  }

  return Array.from(groups.values()).map((group) =>
    projectTrace(group, policy)
  );
}

function projectTrace(
  group: IndexedEvent[],
  policy: TraceRedactionPolicy
): TraceRecord {
  const first = group[0].event;
  const last = group[group.length - 1].event;
  const traceId = stableTraceId(first.tool, first.sessionId);
  const trace: TraceRecord = {
    traceId,
    sessionId: first.sessionId,
    tool: first.tool,
    cwd: first.cwd,
    repoRoot: first.repoRoot,
    status: "active",
    startedAt: first.timestamp,
    lastEventAt: last.timestamp,
    attributes: {
      "gen_ai.system": first.tool,
      "gen_ai.conversation.id": first.sessionId,
      "agent.provider": first.tool,
      "code.repository.path": first.repoRoot ?? first.cwd,
    },
    spans: [],
  };

  const root: MutableSpan = {
    traceId,
    spanId: `span:session:${traceId}`,
    sessionId: trace.sessionId,
    tool: trace.tool,
    kind: "session",
    name: `${trace.tool} session`,
    status: "active",
    startTime: first.timestamp,
    attributes: {
      "gen_ai.system": trace.tool,
      "gen_ai.conversation.id": trace.sessionId,
      "agent.provider": trace.tool,
      "code.repository.path": trace.repoRoot ?? trace.cwd,
    },
    eventIds: [],
  };
  trace.spans.push(root);

  let activeTurn: MutableSpan | undefined;
  const openTools: MutableSpan[] = [];
  const permissionWaits = new Map<string, MutableSpan>();
  const inputWaits = new Map<string, MutableSpan>();

  function parentSpanId(): string {
    return activeTurn?.spanId ?? root.spanId;
  }

  function closeTurn(endTime: number, status: SpanStatus = "ok") {
    if (!activeTurn) return;
    finishSpan(
      activeTurn,
      endTime,
      activeTurn.status === "error" ? "error" : status
    );
    activeTurn = undefined;
  }

  for (const entry of group) {
    const event = entry.event;
    trace.cwd = event.cwd;
    trace.repoRoot = event.repoRoot ?? trace.repoRoot;
    root.eventIds.push(entry.eventId);

    if (event.kind === "session_end") {
      closeTurn(event.timestamp, "ok");
      trace.status = trace.status === "error" ? "error" : "completed";
      trace.endedAt = event.timestamp;
      continue;
    }

    if (event.kind === "user_prompt") {
      closeTurn(event.timestamp, "ok");
      activeTurn = span(
        trace,
        "turn",
        entry,
        "prompt turn",
        root.spanId,
        {
          "gen_ai.operation.name": "chat",
          "agent.event.kind": event.kind,
        },
        contentFor(event.payload.text, policy)
      );
      trace.spans.push(activeTurn);
      continue;
    }

    if (event.kind === "tool_use") {
      const name = toolName(event);
      const s = span(
        trace,
        "tool",
        entry,
        name,
        parentSpanId(),
        {
          "gen_ai.operation.name": "execute_tool",
          "tool.name": name,
          "agent.event.kind": event.kind,
        },
        contentFor(event.payload.input, policy)
      );
      openTools.push(s);
      trace.spans.push(s);
      continue;
    }

    if (event.kind === "tool_result") {
      const name = toolName(event);
      const idx = findOpenTool(openTools, name);
      if (idx >= 0) {
        const [s] = openTools.splice(idx, 1);
        s.eventIds.push(entry.eventId);
        s.content = s.content ?? contentFor(event.payload.output, policy);
        finishSpan(
          s,
          event.timestamp,
          isErrorLikeToolResult(event) ? "error" : "ok"
        );
      }
      continue;
    }

    if (event.kind === "permission_request") {
      const requestId = payloadString(event, "requestId");
      const s = span(
        trace,
        "permission_wait",
        entry,
        "permission wait",
        parentSpanId(),
        {
          "gen_ai.operation.name": "wait_for_permission",
          "agent.event.kind": event.kind,
          "request.id": requestId ?? null,
          "tool.name": toolName(event),
        },
        contentFor(event.payload.input, policy)
      );
      trace.spans.push(s);
      if (requestId) permissionWaits.set(requestId, s);
      continue;
    }

    if (event.kind === "permission_resolved") {
      const requestId = payloadString(event, "requestId");
      const s = requestId ? permissionWaits.get(requestId) : undefined;
      if (requestId && s) {
        s.eventIds.push(entry.eventId);
        s.attributes["permission.decision"] =
          payloadString(event, "decision") ??
          payloadString(event, "resolution") ??
          null;
        finishSpan(s, event.timestamp, "ok");
        permissionWaits.delete(requestId);
      }
      continue;
    }

    if (event.kind === "user_input_request") {
      const requestId = payloadString(event, "requestId");
      const s = span(
        trace,
        "user_input_wait",
        entry,
        "user input wait",
        parentSpanId(),
        {
          "gen_ai.operation.name": "wait_for_user_input",
          "agent.event.kind": event.kind,
          "request.id": requestId ?? null,
        },
        contentFor(event.payload.questions ?? event.payload.text, policy)
      );
      trace.spans.push(s);
      if (requestId) inputWaits.set(requestId, s);
      continue;
    }

    if (event.kind === "user_input_resolved") {
      const requestId = payloadString(event, "requestId");
      const s = requestId ? inputWaits.get(requestId) : undefined;
      if (requestId && s) {
        s.eventIds.push(entry.eventId);
        finishSpan(s, event.timestamp, "ok");
        inputWaits.delete(requestId);
      }
      continue;
    }

    if (event.kind === "subagent_spawn") {
      const s = span(
        trace,
        "subagent",
        entry,
        "subagent spawn",
        parentSpanId(),
        {
          "gen_ai.operation.name": "handoff",
          "agent.event.kind": event.kind,
          "agent.parent.session.id":
            payloadString(event, "parentSessionId") ?? null,
        },
        contentFor(event.payload.text ?? event.payload.input, policy)
      );
      finishSpan(s, event.timestamp, "ok");
      trace.spans.push(s);
      continue;
    }

    if (event.kind === "session_control") {
      const ok = event.payload.ok !== false;
      const s = span(
        trace,
        "session_control",
        entry,
        payloadString(event, "controlAction") ?? "session control",
        parentSpanId(),
        {
          "gen_ai.operation.name": "session_control",
          "agent.event.kind": event.kind,
          "session.control.action":
            payloadString(event, "controlAction") ?? null,
        },
        contentFor(event.payload.reason, policy)
      );
      finishSpan(s, event.timestamp, ok ? "ok" : "error");
      trace.spans.push(s);
      if (!ok) trace.status = "error";
      continue;
    }

    if (event.kind === "error") {
      const s = span(
        trace,
        "error",
        entry,
        "error",
        parentSpanId(),
        {
          "gen_ai.operation.name": "error",
          "agent.event.kind": event.kind,
          "error.type": payloadString(event, "name") ?? null,
        },
        contentFor(event.payload.error, policy)
      );
      finishSpan(s, event.timestamp, "error");
      trace.spans.push(s);
      trace.status = "error";
      if (activeTurn) activeTurn.status = "error";
      continue;
    }
  }

  for (const tool of openTools) finishSpan(tool, last.timestamp, "active");
  for (const wait of permissionWaits.values())
    finishSpan(wait, last.timestamp, "active");
  for (const wait of inputWaits.values())
    finishSpan(wait, last.timestamp, "active");
  closeTurn(last.timestamp, trace.status === "error" ? "error" : "active");
  finishSpan(
    root,
    trace.endedAt ?? last.timestamp,
    trace.status === "error"
      ? "error"
      : trace.status === "completed"
        ? "ok"
        : "active"
  );
  return trace;
}

function findOpenTool(openTools: MutableSpan[], name: string): number {
  for (let i = openTools.length - 1; i >= 0; i--) {
    if (openTools[i].name === name) return i;
  }
  return openTools.length - 1;
}
