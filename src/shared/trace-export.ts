import type { SpanRecord, TraceAttributeValue, TraceRecord } from "./traces";

export type TraceExportContentMode =
  "metadata-only" | "summaries" | "full-content";

export type TraceExportOptions = {
  serviceName?: string;
  serviceVersion?: string;
  contentMode?: TraceExportContentMode;
};

export type OtelAnyValue =
  | { stringValue: string }
  | { boolValue: boolean }
  | { intValue: string }
  | { doubleValue: number }
  | { arrayValue: { values: OtelAnyValue[] } };

export type OtelAttribute = {
  key: string;
  value: OtelAnyValue;
};

export type OtelSpan = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: "SPAN_KIND_INTERNAL";
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OtelAttribute[];
  status: {
    code: "STATUS_CODE_UNSET" | "STATUS_CODE_OK" | "STATUS_CODE_ERROR";
  };
};

export type OtelTraceExport = {
  resourceSpans: Array<{
    resource: {
      attributes: OtelAttribute[];
    };
    scopeSpans: Array<{
      scope: {
        name: string;
        version?: string;
      };
      spans: OtelSpan[];
    }>;
  }>;
};

const DEFAULT_SERVICE_NAME = "realmkeeper";
const EXPORT_SCOPE_NAME = "realmkeeper.trace-export";

export function exportTracesToOtel(
  traces: readonly TraceRecord[],
  options: TraceExportOptions = {}
): OtelTraceExport {
  const sortedTraces = [...traces].sort((a, b) => {
    if (a.startedAt !== b.startedAt) return a.startedAt - b.startedAt;
    return a.traceId.localeCompare(b.traceId);
  });

  const spans = sortedTraces.flatMap((trace) =>
    trace.spans
      .slice()
      .sort((a, b) => {
        if (a.startTime !== b.startTime) return a.startTime - b.startTime;
        return a.spanId.localeCompare(b.spanId);
      })
      .map((span) => spanToOtel(span, options.contentMode))
  );

  return {
    resourceSpans: [
      {
        resource: {
          attributes: attributes({
            "service.name": options.serviceName ?? DEFAULT_SERVICE_NAME,
            ...(options.serviceVersion
              ? { "service.version": options.serviceVersion }
              : {}),
          }),
        },
        scopeSpans: [
          {
            scope: {
              name: EXPORT_SCOPE_NAME,
              ...(options.serviceVersion
                ? { version: options.serviceVersion }
                : {}),
            },
            spans,
          },
        ],
      },
    ],
  };
}

function spanToOtel(
  span: SpanRecord,
  contentMode: TraceExportContentMode = "metadata-only"
): OtelSpan {
  return {
    traceId: stableHex(span.traceId, 32),
    spanId: stableHex(span.spanId, 16),
    ...(span.parentSpanId
      ? { parentSpanId: stableHex(span.parentSpanId, 16) }
      : {}),
    name: span.name,
    kind: "SPAN_KIND_INTERNAL",
    startTimeUnixNano: msToUnixNano(span.startTime),
    endTimeUnixNano: msToUnixNano(span.endTime ?? span.startTime),
    attributes: attributes({
      ...span.attributes,
      "rk.trace_id": span.traceId,
      "rk.span_id": span.spanId,
      ...(span.parentSpanId ? { "rk.parent_span_id": span.parentSpanId } : {}),
      "rk.session_id": span.sessionId,
      "rk.tool": span.tool,
      "rk.span.kind": span.kind,
      "rk.span.status": span.status,
      ...(span.durationMs !== undefined
        ? { "rk.duration_ms": span.durationMs }
        : {}),
      "rk.event.ids": span.eventIds,
      ...contentAttributes(span, contentMode),
    }),
    status: {
      code:
        span.status === "error"
          ? "STATUS_CODE_ERROR"
          : span.status === "ok"
            ? "STATUS_CODE_OK"
            : "STATUS_CODE_UNSET",
    },
  };
}

function contentAttributes(
  span: SpanRecord,
  contentMode: TraceExportContentMode
): Record<string, TraceAttributeValue | string[]> {
  if (!span.content) return {};
  return {
    "rk.content.redacted": span.content.redacted,
    "rk.content.size": span.content.size,
    ...(contentMode === "summaries" && span.content.summary
      ? { "rk.content.summary": span.content.summary }
      : {}),
    ...(contentMode === "full-content" && span.content.text
      ? { "rk.content.text": span.content.text }
      : {}),
  };
}

function attributes(
  values: Record<string, TraceAttributeValue | string[]>
): OtelAttribute[] {
  return Object.entries(values)
    .filter(([, value]) => value !== null && value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({ key, value: anyValue(value) }));
}

function anyValue(value: TraceAttributeValue | string[]): OtelAnyValue {
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((item) => ({ stringValue: item })),
      },
    };
  }
  if (typeof value === "boolean") return { boolValue: value };
  if (typeof value === "number") {
    if (Number.isInteger(value)) return { intValue: String(value) };
    return { doubleValue: value };
  }
  return { stringValue: String(value) };
}

function msToUnixNano(timestampMs: number): string {
  return String(Math.trunc(timestampMs * 1_000_000));
}

function stableHex(input: string, length: number): string {
  let out = "";
  let seed = 0;
  while (out.length < length) {
    out += hash32(`${input}:${seed}`).toString(16).padStart(8, "0");
    seed++;
  }
  return out.slice(0, length);
}

function hash32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  return (hash ^ (hash >>> 16)) >>> 0;
}
