import { useEffect, useMemo, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { mermaid } from "@streamdown/mermaid";
import { math } from "@streamdown/math";
import { cjk } from "@streamdown/cjk";
import { useStore } from "../store";
import { ROLE_HEX, ROLE_PALETTE } from "../game/units";
import type { AgentEvent, UnitState } from "@shared/events";

function SelectedUnitBar({ unit, onClear }: { unit: UnitState; onClear: () => void }) {
  const palette = ROLE_PALETTE[unit.role];
  const cwdShort = unit.cwd.split("/").slice(-2).join("/");
  return (
    <div className="chat-selected-bar">
      <span
        className="chat-selected-portrait"
        style={{ background: ROLE_HEX[unit.role] }}
      />
      <div className="chat-selected-info">
        <div className="chat-selected-name">
          {palette.label}
          <span className="chat-selected-meta"> · {unit.tool} · {unit.status}</span>
        </div>
        <div className="chat-selected-meta">
          {cwdShort}
          {unit.lastTool ? ` · last: ${unit.lastTool}` : ""}
        </div>
      </div>
      <div className="chat-selected-bars">
        <div className="bar hp"><div style={{ width: `${unit.hp}%` }} /></div>
        <div className="bar mp"><div style={{ width: `${unit.mp}%` }} /></div>
      </div>
      <button className="chat-clear" onClick={onClear} title="clear selection">
        ×
      </button>
    </div>
  );
}

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

  const muted = useStore((s) => s.mutedSessionIds);
  const RENDER_CAP = 80;
  const { filtered, hiddenCount } = useMemo(() => {
    let f: AgentEvent[];
    if (selectedUnitId) {
      // When a unit is explicitly selected, show its events even if muted.
      f = events.filter((e) => e.sessionId === selectedUnitId);
    } else if (activeWorldId) {
      const world = worlds[activeWorldId];
      const allowedSessions = new Set(world?.unitIds ?? []);
      f = events.filter(
        (e) => allowedSessions.has(e.sessionId) && !muted[e.sessionId]
      );
    } else {
      f = events.filter((e) => !muted[e.sessionId]);
    }
    const recent = f.slice(0, RENDER_CAP).reverse();
    return { filtered: recent, hiddenCount: Math.max(0, f.length - RENDER_CAP) };
  }, [events, selectedUnitId, activeWorldId, worlds, muted]);

  const showBadges = !selectedUnitId;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [filtered.length]);

  const selectedUnit = selectedUnitId ? units[selectedUnitId] : null;

  return (
    <div className="chat-panel">
      {selectedUnit ? (
        <SelectedUnitBar unit={selectedUnit} onClear={() => selectUnit(null)} />
      ) : (
        <div className="chat-panel-header">
          <span>
            {activeWorldId
              ? `world: ${worlds[activeWorldId]?.label ?? "?"}`
              : "all worlds"}
            {" · "}
            {filtered.length} events
          </span>
        </div>
      )}
      <div className="chat-stream">
        {hiddenCount > 0 && (
          <div className="chat-marker">
            <span className="chat-marker-text">{hiddenCount} earlier events hidden</span>
          </div>
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
