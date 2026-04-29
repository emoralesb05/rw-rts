/**
 * Rich event-stream renderer extracted from the old ChatPanel. Used by:
 *   - the LOG tab inside a wielder panel (filtered to that wielder)
 *   - any future "kingdom log" surface that wants the full firehose
 *
 * Pass `sessionId` to filter to one wielder. Pass nothing for global.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { mermaid } from "@streamdown/mermaid";
import { math } from "@streamdown/math";
import { cjk } from "@streamdown/cjk";
import { useStore } from "../store";
import { ROLE_HEX } from "../game/units";
import type { AgentEvent, UnitState } from "@shared/events";

const STREAMDOWN_PLUGINS = { code, mermaid, math, cjk };

const TOOL_ICON: Record<string, string> = {
  Read: "📖", Grep: "🔍", Glob: "🔍",
  Edit: "✏️", Write: "✏️", MultiEdit: "✏️",
  Bash: "⚡", BashOutput: "⚡",
  WebFetch: "🌐", WebSearch: "🌐",
  Task: "✨", Agent: "✨",
  TodoWrite: "✓", TaskCreate: "✓",
};

function renderText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((b) => {
        if (typeof b === "string") return b;
        if (b && typeof b === "object" && "text" in b)
          return String((b as { text: unknown }).text ?? "");
        return JSON.stringify(b);
      })
      .join("\n");
  }
  if (value === undefined || value === null) return "";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function summarizeToolInput(name: string | undefined, input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const i = input as Record<string, unknown>;
  switch (name) {
    case "Read": case "Edit": case "Write": case "MultiEdit": case "NotebookEdit":
      return String(i.file_path ?? "");
    case "Bash":
      return String(i.command ?? "").slice(0, 240);
    case "Grep":
      return `${i.pattern ?? ""}${i.path ? ` in ${i.path}` : ""}`;
    case "Glob":
      return String(i.pattern ?? "");
    case "WebFetch": case "WebSearch":
      return String(i.url ?? i.query ?? "");
    case "Task": case "Agent":
      return String(i.description ?? i.prompt ?? "");
    default:
      return JSON.stringify(input).slice(0, 160);
  }
}

function extractWhyTrace(events: AgentEvent[], target: AgentEvent): AgentEvent[] {
  const idx = events.indexOf(target);
  if (idx < 0) return [];
  const trace: AgentEvent[] = [];
  for (let i = idx + 1; i < events.length && trace.length < 3; i++) {
    const e = events[i];
    if (e.sessionId !== target.sessionId) continue;
    if (e.kind === "session_start") break;
    if (e.kind === "user_prompt") {
      trace.push(e);
      break;
    }
    if (e.kind === "assistant_text" || e.kind === "tool_result") {
      trace.push(e);
    }
  }
  return trace.reverse();
}

function ToolUseRow({ ev, events }: { ev: AgentEvent; events: AgentEvent[] }) {
  const [showTrace, setShowTrace] = useState(false);
  const name = String(ev.payload.name ?? "");
  const icon = TOOL_ICON[name] ?? "•";
  const summary = summarizeToolInput(name, ev.payload.input);
  const trace = useMemo(() => extractWhyTrace(events, ev), [events, ev]);
  return (
    <div className="chat-tool">
      <div className="chat-tool-line">
        <span className="chat-tool-icon">{icon}</span>
        <span className="chat-tool-name">{name}</span>
        {summary && <span className="chat-tool-arg">{summary}</span>}
        {trace.length > 0 && (
          <button
            type="button"
            className="chat-tool-why"
            onClick={() => setShowTrace((v) => !v)}
            title="show what led to this tool call"
          >
            {showTrace ? "▲ why" : "▼ why"}
          </button>
        )}
      </div>
      {showTrace && trace.length > 0 && (
        <div className="chat-tool-trace">
          <div className="chat-tool-trace-label">what led to this</div>
          {trace.map((t, i) => (
            <WhyTraceRow key={i} ev={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function WhyTraceRow({ ev }: { ev: AgentEvent }) {
  if (ev.kind === "user_prompt") {
    const text = String(ev.payload.text ?? "");
    const trimmed = text.length > 220 ? text.slice(0, 220) + "…" : text;
    return (
      <div className="chat-trace-item chat-trace-user">
        <span className="chat-trace-tag">USER</span>
        <span className="chat-trace-body">{trimmed}</span>
      </div>
    );
  }
  if (ev.kind === "assistant_text") {
    const text = String(ev.payload.text ?? "");
    const trimmed = text.length > 280 ? text.slice(0, 280) + "…" : text;
    return (
      <div className="chat-trace-item chat-trace-assistant">
        <span className="chat-trace-tag">THINKING</span>
        <span className="chat-trace-body">{trimmed}</span>
      </div>
    );
  }
  if (ev.kind === "tool_result") {
    const text = renderText(ev.payload.output);
    const trimmed = text.length > 180 ? text.slice(0, 180) + "…" : text;
    return (
      <div className="chat-trace-item chat-trace-result">
        <span className="chat-trace-tag">RESULT</span>
        <span className="chat-trace-body">{trimmed || "(empty)"}</span>
      </div>
    );
  }
  return null;
}

function ToolResultRow({ ev }: { ev: AgentEvent }) {
  const [expanded, setExpanded] = useState(false);
  const text = renderText(ev.payload.output);
  if (!text.trim()) {
    return <div className="chat-tool-result chat-tool-result-empty">↳ done</div>;
  }
  const trimmed = text.length > 220 ? text.slice(0, 220) + "…" : text;
  const showExpand = text.length > 220;
  return (
    <div className="chat-tool-result">
      <pre className="chat-tool-result-body">{expanded ? text : trimmed}</pre>
      {showExpand && (
        <button className="chat-expand" onClick={() => setExpanded(!expanded)}>
          {expanded ? "show less" : `show all (${text.length} chars)`}
        </button>
      )}
    </div>
  );
}

function AssistantBubble({ text }: { text: string }) {
  return (
    <div className="chat-bubble chat-assistant">
      <div className="chat-bubble-body">
        <Streamdown plugins={STREAMDOWN_PLUGINS}>{text}</Streamdown>
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="chat-bubble chat-user">
      <div className="chat-bubble-body">{text}</div>
    </div>
  );
}

function SessionMarker({ ev }: { ev: AgentEvent }) {
  return (
    <div className="chat-marker">
      <span className="chat-marker-dot" />
      <span className="chat-marker-text">
        {ev.kind === "session_start" ? "session started" : "session ended"}
      </span>
    </div>
  );
}

function ErrorRow({ ev }: { ev: AgentEvent }) {
  return (
    <div className="chat-error">
      ⚠ {String(ev.payload.error ?? "").slice(0, 280)}
    </div>
  );
}

function UnitBadge({ unit }: { unit: UnitState }) {
  return (
    <div className="chat-unit-badge">
      <span className="chat-unit-dot" style={{ background: ROLE_HEX[unit.role] }} />
      <span className="chat-unit-name">{unit.displayName}</span>
      <span className="chat-unit-tool">{unit.tool}</span>
    </div>
  );
}

type Props = {
  /** When set, only show events for this session. */
  sessionId?: string;
  /** Cap rendered messages to keep scroll perf reasonable. Default 80. */
  cap?: number;
  /** Scroll-and-pulse the message whose event timestamp matches this.
   * Used by the activity-log click → "drop me at this exact event."
   * Caller bumps the tick to re-trigger even if ts is unchanged. */
  scrollToTs?: number;
  scrollToTick?: number;
};

export function ConversationStream({
  sessionId,
  cap = 80,
  scrollToTs,
  scrollToTick,
}: Props) {
  const events = useStore((s) => s.events);
  const units = useStore((s) => s.units);
  const muted = useStore((s) => s.mutedSessionIds);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { filtered, hiddenCount } = useMemo(() => {
    const f = sessionId
      ? events.filter((e) => e.sessionId === sessionId)
      : events.filter((e) => !muted[e.sessionId]);
    const recent = f.slice(0, cap).reverse();
    return { filtered: recent, hiddenCount: Math.max(0, f.length - cap) };
  }, [events, sessionId, muted, cap]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [filtered.length]);

  // When the caller asks us to drop at a specific event (activity-row
  // click flow), find that row and scroll it into view + flash a pulse.
  // Tick bump forces re-runs even when the same ts is requested twice.
  useEffect(() => {
    if (scrollToTs == null || !scrollToTick) return;
    const root = containerRef.current;
    if (!root) return;
    const el = root.querySelector<HTMLElement>(
      `[data-event-ts="${scrollToTs}"]`
    );
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("event-pulse");
    void el.offsetWidth;
    el.classList.add("event-pulse");
    const handle = window.setTimeout(
      () => el.classList.remove("event-pulse"),
      1600
    );
    return () => window.clearTimeout(handle);
  }, [scrollToTs, scrollToTick, filtered.length]);

  const showBadges = !sessionId;

  return (
    <div className="chat-stream" ref={containerRef}>
      {hiddenCount > 0 && (
        <div className="chat-marker">
          <span className="chat-marker-text">
            {hiddenCount} earlier events hidden
          </span>
        </div>
      )}
      {filtered.length === 0 && (
        <div className="chat-empty">No conversation yet for this wielder.</div>
      )}
      {filtered.map((e, i) => {
        const unit = units[e.sessionId];
        const prev = filtered[i - 1];
        const sameUnitAsPrev = prev && prev.sessionId === e.sessionId;
        const badge =
          showBadges && unit && !sameUnitAsPrev ? <UnitBadge unit={unit} /> : null;
        let body: React.ReactNode = null;
        switch (e.kind) {
          case "session_start":
          case "session_end":
            body = <SessionMarker ev={e} />;
            break;
          case "user_prompt":
            body = <UserBubble text={String(e.payload.text ?? "")} />;
            break;
          case "assistant_text":
            body = <AssistantBubble text={String(e.payload.text ?? "")} />;
            break;
          case "tool_use":
            body = <ToolUseRow ev={e} events={events} />;
            break;
          case "tool_result":
            body = <ToolResultRow ev={e} />;
            break;
          case "error":
            body = <ErrorRow ev={e} />;
            break;
          default:
            body = null;
        }
        return (
          <div key={i} data-event-ts={e.timestamp} className="chat-event">
            {badge}
            {body}
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
