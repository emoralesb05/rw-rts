/**
 * Event → one-line summary, used by the bottom-right ActivityLog. Keeps
 * the strip scannable: actor + verb + the smallest meaningful payload
 * (tool name, command first token, error first line). Full content
 * still lives in the wielder panel's LOG tab.
 */
import type { AgentEvent } from "@shared/events";

const TOOL_VERB: Record<string, string> = {
  Read: "read",
  Glob: "globbed",
  Grep: "grep'd",
  Edit: "edited",
  Write: "wrote",
  MultiEdit: "edited",
  Bash: "ran",
  BashOutput: "ran",
  WebFetch: "fetched",
  WebSearch: "searched",
  Task: "spawned task",
  Agent: "spawned agent",
  TodoWrite: "updated todos",
};

function trim(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function commandTitle(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  if (typeof o.command === "string") return trim(String(o.command), 60);
  if (typeof o.file_path === "string") {
    const parts = String(o.file_path).split("/");
    return parts.slice(-2).join("/");
  }
  if (typeof o.path === "string") {
    const parts = String(o.path).split("/");
    return parts.slice(-2).join("/");
  }
  if (typeof o.url === "string") return trim(String(o.url), 60);
  if (typeof o.query === "string") return trim(String(o.query), 60);
  if (typeof o.pattern === "string") return trim(String(o.pattern), 60);
  if (typeof o.prompt === "string") return trim(String(o.prompt), 60);
  return null;
}

export type ActivitySummary = {
  /** Display verb + payload, e.g. "ran · npm test". */
  text: string;
  /** Severity hint for tinting in the log strip. */
  tone: "ok" | "muted" | "warn" | "danger";
};

export function summarizeEvent(ev: AgentEvent): ActivitySummary {
  if (ev.kind === "tool_use") {
    const name = String(ev.payload.name ?? "tool");
    const verb = TOOL_VERB[name] ?? `used ${name}`;
    const subject = commandTitle(ev.payload.input);
    return {
      text: subject ? `${verb} · ${subject}` : verb,
      tone: "ok",
    };
  }
  if (ev.kind === "tool_result") {
    const name = String(ev.payload.name ?? "tool");
    return { text: `↳ ${name} done`, tone: "muted" };
  }
  if (ev.kind === "assistant_text") {
    const text = trim(String(ev.payload.text ?? ""), 80);
    return { text: text || "…", tone: "muted" };
  }
  if (ev.kind === "user_prompt") {
    const text = trim(String(ev.payload.text ?? ""), 80);
    return { text: `“${text}”`, tone: "ok" };
  }
  if (ev.kind === "session_start") {
    return { text: "session start", tone: "ok" };
  }
  if (ev.kind === "session_end") {
    return { text: "session end", tone: "muted" };
  }
  if (ev.kind === "error") {
    const msg = trim(String(ev.payload.error ?? "error"), 80);
    return { text: msg, tone: "danger" };
  }
  if (ev.kind === "permission_request") {
    const name = String(ev.payload.name ?? "tool");
    return { text: `asked permission · ${name}`, tone: "warn" };
  }
  if (ev.kind === "permission_resolved") {
    return { text: "permission resolved", tone: "muted" };
  }
  if (ev.kind === "user_input_request") {
    return { text: "asked for input", tone: "warn" };
  }
  if (ev.kind === "user_input_resolved") {
    return { text: "input request resolved", tone: "muted" };
  }
  if (ev.kind === "subagent_spawn") {
    return { text: "spawned subagent", tone: "ok" };
  }
  return { text: ev.kind, tone: "muted" };
}

/** Compact relative time: "12s", "4m", "2h". */
export function shortAgo(ts: number, now: number = Date.now()): string {
  const sec = Math.max(0, Math.floor((now - ts) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  return `${hr}h`;
}
