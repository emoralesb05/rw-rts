import { useEffect, useMemo, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { mermaid } from "@streamdown/mermaid";
import { math } from "@streamdown/math";
import { cjk } from "@streamdown/cjk";
import { useStore } from "../store";
import { ROLE_HEX, ROLE_PALETTE } from "../game/units";
import type { AgentEvent, UnitState } from "@shared/events";

const STREAMDOWN_PLUGINS = { code, mermaid, math, cjk };

function UnitBadge({ unit }: { unit: UnitState }) {
  const palette = ROLE_PALETTE[unit.role];
  return (
    <div className="chat-unit-badge">
      <span className="chat-unit-dot" style={{ background: ROLE_HEX[unit.role] }} />
      <span className="chat-unit-name">{palette.label}</span>
      <span className="chat-unit-tool">{unit.tool}</span>
    </div>
  );
}

const TOOL_ICON: Record<string, string> = {
  Read: "📖",
  Grep: "🔍",
  Glob: "🔍",
  Edit: "✏️",
  Write: "✏️",
  MultiEdit: "✏️",
  Bash: "⚡",
  WebFetch: "🌐",
  WebSearch: "🌐",
  Task: "✨",
  Agent: "✨",
  TodoWrite: "✓",
  TaskCreate: "✓",
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
    case "Read":
    case "Edit":
    case "Write":
    case "MultiEdit":
    case "NotebookEdit":
      return String(i.file_path ?? "");
    case "Bash":
      return String(i.command ?? "").slice(0, 240);
    case "Grep":
      return `${i.pattern ?? ""}${i.path ? ` in ${i.path}` : ""}`;
    case "Glob":
      return String(i.pattern ?? "");
    case "WebFetch":
    case "WebSearch":
      return String(i.url ?? i.query ?? "");
    case "Task":
    case "Agent":
      return String(i.description ?? i.prompt ?? "");
    default:
      return JSON.stringify(input).slice(0, 160);
  }
}

function ToolUseRow({ ev }: { ev: AgentEvent }) {
  const name = String(ev.payload.name ?? "");
  const icon = TOOL_ICON[name] ?? "•";
  const summary = summarizeToolInput(name, ev.payload.input);
  return (
    <div className="chat-tool">
      <span className="chat-tool-icon">{icon}</span>
      <span className="chat-tool-name">{name}</span>
      {summary && <span className="chat-tool-arg">{summary}</span>}
    </div>
  );
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

export function ChatPanel() {
  const events = useStore((s) => s.events);
  const units = useStore((s) => s.units);
  const selectedUnitId = useStore((s) => s.selectedUnitId);
  const activeWorldId = useStore((s) => s.activeWorldId);
  const worlds = useStore((s) => s.worlds);
  const selectUnit = useStore((s) => s.selectUnit);
  const bottomRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (selectedUnitId) {
      return events.filter((e) => e.sessionId === selectedUnitId).slice().reverse();
    }
    if (activeWorldId) {
      const world = worlds[activeWorldId];
      const allowedSessions = new Set(world?.unitIds ?? []);
      return events.filter((e) => allowedSessions.has(e.sessionId)).slice().reverse();
    }
    return events.slice().reverse();
  }, [events, selectedUnitId, activeWorldId, worlds]);

  const showBadges = !selectedUnitId;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [filtered.length]);

  return (
    <div className="chat-panel">
      <div className="chat-panel-header">
        <span>
          {selectedUnitId
            ? "selected unit"
            : activeWorldId
              ? `world: ${worlds[activeWorldId]?.label ?? "?"}`
              : "all worlds"}
          {" · "}
          {filtered.length} events
        </span>
        {selectedUnitId && (
          <button className="chat-clear" onClick={() => selectUnit(null)}>
            clear filter
          </button>
        )}
      </div>
      <div className="chat-stream">
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
              body = <ToolUseRow ev={e} />;
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
            <div key={i}>
              {badge}
              {body}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
