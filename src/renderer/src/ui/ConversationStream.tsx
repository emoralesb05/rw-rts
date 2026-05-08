/**
 * Rich event-stream renderer extracted from the old ChatPanel. Used by:
 *   - the LOG tab inside a wielder panel (filtered to that wielder)
 *   - any future "kingdom log" surface that wants the full firehose
 *
 * Pass `sessionId` to filter to one wielder. Pass nothing for global.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CornerDownRight,
} from "lucide-react";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { mermaid } from "@streamdown/mermaid";
import { math } from "@streamdown/math";
import { cjk } from "@streamdown/cjk";
import { useStore } from "../store";
import { ROLE_HEX } from "../game/units";
import { EmptyState } from "../components/chrome/EmptyState";
import { TooltipHint } from "../components/chrome/TooltipHint";
import { cn } from "@/lib/cn";
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

/** Pull a file path off a tool input regardless of which CLI sent it.
 * Cursor uses `target_file`/`path`, Claude uses `file_path`. Also
 * accepts an absolute `command` argument (some tool inputs carry the
 * affected file as the command). */
function inputFilePath(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const i = input as Record<string, unknown>;
  for (const k of ["file_path", "target_file", "path", "filepath"]) {
    const v = i[k];
    if (typeof v === "string" && v) return v;
  }
  return "";
}

function summarizeToolInput(name: string | undefined, input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const i = input as Record<string, unknown>;
  switch (name) {
    case "Read": case "Edit": case "Write": case "MultiEdit": case "NotebookEdit":
      return inputFilePath(input);
    case "Bash":
      return String(i.command ?? "").slice(0, 240);
    case "Grep":
      return `${i.pattern ?? i.query ?? ""}${i.path ? ` in ${i.path}` : ""}`;
    case "Glob":
      return String(i.pattern ?? i.target_directories ?? "");
    case "WebFetch": case "WebSearch":
      return String(i.url ?? i.query ?? "");
    case "Task": case "Agent":
      return String(i.description ?? i.prompt ?? "");
    default:
      return JSON.stringify(input).slice(0, 160);
  }
}

/** Clickable link that opens the file. Routes to the editor matching
 * the wielder's tool (Cursor → cursor://file URL handler) when set;
 * otherwise OS default app. */
function FilePathLink({
  path,
  label,
  tool,
}: {
  path: string;
  label?: string;
  tool?: "claude" | "cursor" | "codex" | "gemini";
}) {
  if (!path) return null;
  const display = label ?? path;
  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    void window.kh.openPath(path, { tool }).catch(() => {});
  };
  const hint =
    tool === "cursor"
      ? `open ${path} in Cursor`
      : `open ${path}`;
  return (
    <TooltipHint label={hint}>
      <button
        type="button"
        className={pathLinkClass}
        onClick={onClick}
      >
        {display}
      </button>
    </TooltipHint>
  );
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

// Tools whose `summary` is a file path — render as a clickable
// FilePathLink. Other tools (Bash, Grep, WebFetch, ...) keep the
// plain-text summary, since their args aren't openable paths.
const PATH_TOOLS = new Set([
  "Read",
  "Edit",
  "Write",
  "MultiEdit",
  "NotebookEdit",
]);

// Tools whose input carries a file edit we can preview as a diff
// (red old / green new lines under the tool row).
const EDIT_TOOLS = new Set(["Edit", "MultiEdit", "Write"]);

const markerClass =
  "my-1.5 flex items-center gap-2 text-[10px] uppercase tracking-[0.7px] text-muted";
const markerLineClass =
  "h-px flex-1 bg-[linear-gradient(90deg,transparent,var(--color-line),transparent)]";
const markerTextClass = "px-1.5";
const pathLinkClass =
  "min-w-0 flex-auto cursor-pointer break-words border-0 bg-transparent p-0 text-left font-mono text-[11px] text-accent-alt underline decoration-accent-alt/35 underline-offset-2 hover:brightness-110 hover:decoration-accent-alt";
const toolPillClass =
  "inline-block rounded-sm border px-1.5 py-px font-mono text-[9.5px] font-semibold uppercase tracking-[0.5px]";

function traceTagClass(kind: "user" | "assistant" | "result") {
  return cn(
    "w-14 shrink-0 pt-0.5 font-mono text-[8.5px] font-extrabold uppercase tracking-[1px]",
    kind === "user" && "text-[#c9a4ff]",
    kind === "assistant" && "text-accent",
    kind === "result" && "text-success"
  );
}

function toolResultClass(isError: boolean, isShell: boolean) {
  return cn(
    "mb-1 ml-[18px]",
    isShell &&
      "[&_pre]:border-[rgba(120,220,200,0.2)] [&_pre]:bg-[#050d22] [&_pre]:text-[#c8e8d8]",
    isError &&
      "[&_pre]:border-[rgba(255,120,80,0.4)] [&_pre]:bg-[rgba(40,8,6,0.65)] [&_pre]:text-[#ffd4cc]"
  );
}

function toolExitClass(exitCode: number) {
  return cn(
    toolPillClass,
    exitCode === 0
      ? "border-[rgba(120,220,200,0.25)] bg-[rgba(120,220,200,0.12)] text-[#78dcc8]"
      : "border-[rgba(255,120,80,0.4)] bg-[rgba(255,120,80,0.18)] text-[#ff8870]"
  );
}

type EditHunk = { before: string; after: string; label?: string };

/** Extract diff hunks from tool input. Handles Claude's Edit/MultiEdit/
 * Write shapes plus Cursor's edit_file → Edit (when the bridge
 * canonicalizes it) which sometimes carries `code_edit` as a unified
 * diff-ish string instead of explicit old_string/new_string. */
function extractEditHunks(name: string, input: unknown): EditHunk[] {
  if (!input || typeof input !== "object") return [];
  const i = input as Record<string, unknown>;
  if (name === "Edit") {
    if (typeof i.old_string === "string" || typeof i.new_string === "string") {
      return [
        {
          before: String(i.old_string ?? ""),
          after: String(i.new_string ?? ""),
        },
      ];
    }
    // Cursor edit_file path: code_edit already is a unified-ish diff
    // string (lines prefixed with + / -) plus `// ...existing code...`
    // markers. Show as a single hunk with all-after lines; the +/-
    // styling kicks in via per-line prefix detection in the renderer.
    if (typeof i.code_edit === "string") {
      return [{ before: "", after: i.code_edit, label: "code edit" }];
    }
    return [];
  }
  if (name === "MultiEdit") {
    const edits = Array.isArray(i.edits) ? i.edits : [];
    return edits
      .map((e: any, idx: number): EditHunk | null => {
        if (!e || typeof e !== "object") return null;
        return {
          before: String(e.old_string ?? ""),
          after: String(e.new_string ?? ""),
          label: `hunk ${idx + 1}`,
        };
      })
      .filter((h): h is EditHunk => !!h);
  }
  if (name === "Write") {
    return [
      { before: "", after: String(i.content ?? ""), label: "new file" },
    ];
  }
  return [];
}

/** LCS-based line diff. Returns ops in order; each op is either an
 * unchanged line, an addition, or a deletion. Operates on whole lines
 * — character-level diff isn't needed for our agent-edit visualization
 * use case (mostly small structural changes). */
type DiffOp = { kind: "ctx" | "add" | "del"; text: string };

function diffLines(before: string[], after: string[]): DiffOp[] {
  const m = before.length;
  const n = after.length;
  // Trim a common prefix/suffix first so the LCS matrix stays small
  // even for large files with a localized change.
  let head = 0;
  while (head < m && head < n && before[head] === after[head]) head++;
  let tail = 0;
  while (
    tail < m - head &&
    tail < n - head &&
    before[m - 1 - tail] === after[n - 1 - tail]
  ) {
    tail++;
  }
  const midBefore = before.slice(head, m - tail);
  const midAfter = after.slice(head, n - tail);
  const a = midBefore.length;
  const b = midAfter.length;
  const lcs: number[][] = Array.from({ length: a + 1 }, () =>
    new Array(b + 1).fill(0)
  );
  for (let i = 1; i <= a; i++) {
    for (let j = 1; j <= b; j++) {
      if (midBefore[i - 1] === midAfter[j - 1]) lcs[i][j] = lcs[i - 1][j - 1] + 1;
      else lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1]);
    }
  }
  const middle: DiffOp[] = [];
  let i = a;
  let j = b;
  while (i > 0 && j > 0) {
    if (midBefore[i - 1] === midAfter[j - 1]) {
      middle.unshift({ kind: "ctx", text: midBefore[i - 1] });
      i--;
      j--;
    } else if (lcs[i - 1][j] >= lcs[i][j - 1]) {
      middle.unshift({ kind: "del", text: midBefore[i - 1] });
      i--;
    } else {
      middle.unshift({ kind: "add", text: midAfter[j - 1] });
      j--;
    }
  }
  while (i > 0) middle.unshift({ kind: "del", text: midBefore[--i] });
  while (j > 0) middle.unshift({ kind: "add", text: midAfter[--j] });
  return [
    ...before.slice(0, head).map<DiffOp>((t) => ({ kind: "ctx", text: t })),
    ...middle,
    ...before.slice(m - tail).map<DiffOp>((t) => ({ kind: "ctx", text: t })),
  ];
}

/** Format diff ops as a unified-diff string with N lines of context
 * around change clusters. Long unchanged regions become `... N
 * unchanged lines ...` separators so big files don't dominate. */
function formatUnifiedDiff(ops: DiffOp[], context = 3): string {
  // Find indices of change ops (add/del) — context wraps each cluster.
  const changeIdx = ops
    .map((o, idx) => (o.kind === "ctx" ? -1 : idx))
    .filter((i) => i !== -1);
  if (changeIdx.length === 0) {
    // No changes — degenerate case; just show the content.
    return ops.map((o) => " " + o.text).join("\n");
  }
  // Build cluster ranges: [start, end] of indices to render with `+/-/ `;
  // gaps between clusters get the placeholder.
  const clusters: { start: number; end: number }[] = [];
  for (const idx of changeIdx) {
    const lo = Math.max(0, idx - context);
    const hi = Math.min(ops.length - 1, idx + context);
    const last = clusters[clusters.length - 1];
    if (last && lo <= last.end + 1) {
      last.end = Math.max(last.end, hi);
    } else {
      clusters.push({ start: lo, end: hi });
    }
  }
  const out: string[] = [];
  let cursor = 0;
  for (const c of clusters) {
    if (c.start > cursor) {
      const skipped = c.start - cursor;
      out.push(`@@ ${skipped} unchanged line${skipped === 1 ? "" : "s"} @@`);
    }
    for (let k = c.start; k <= c.end; k++) {
      const op = ops[k];
      out.push((op.kind === "add" ? "+" : op.kind === "del" ? "-" : " ") + op.text);
    }
    cursor = c.end + 1;
  }
  if (cursor < ops.length) {
    const skipped = ops.length - cursor;
    out.push(`@@ ${skipped} unchanged line${skipped === 1 ? "" : "s"} @@`);
  }
  return out.join("\n");
}

function DiffPreview({ hunks }: { hunks: EditHunk[] }) {
  if (hunks.length === 0) return null;
  const blocks = hunks.map((h, idx) => {
    const beforeLines = h.before ? h.before.split("\n") : [];
    const afterLines = h.after ? h.after.split("\n") : [];
    // Write ("new file") has no before — show the after as all-additions
    // without LCS, since there's nothing to align against.
    if (beforeLines.length === 0) {
      return {
        label: h.label,
        body: afterLines.map((l) => "+" + l).join("\n"),
      };
    }
    const ops = diffLines(beforeLines, afterLines);
    return { label: h.label, body: formatUnifiedDiff(ops) };
  });
  const fenced = blocks
    .map((b) => {
      const header = b.label ? `# ${b.label}\n` : "";
      return "```diff\n" + header + b.body + "\n```";
    })
    .join("\n\n");
  return (
    <div className="ml-[18px] mt-1.5 text-[11px] [&_pre]:m-0 [&_pre]:rounded-md [&_pre]:text-[11px] [&_pre]:leading-normal">
      <Streamdown plugins={STREAMDOWN_PLUGINS}>{fenced}</Streamdown>
    </div>
  );
}

function ToolUseRow({ ev, events }: { ev: AgentEvent; events: AgentEvent[] }) {
  const [showTrace, setShowTrace] = useState(false);
  const name = String(ev.payload.name ?? "");
  const icon = TOOL_ICON[name] ?? "•";
  const summary = summarizeToolInput(name, ev.payload.input);
  const summaryIsPath = PATH_TOOLS.has(name) && summary.startsWith("/");
  const trace = useMemo(() => extractWhyTrace(events, ev), [events, ev]);
  const hunks = useMemo(
    () =>
      EDIT_TOOLS.has(name) ? extractEditHunks(name, ev.payload.input) : [],
    [name, ev.payload.input]
  );
  return (
    <div className="ml-0.5 flex flex-col gap-1 text-[11.5px] text-muted">
      <div className="flex flex-wrap items-baseline gap-1.5">
        <span className="text-xs">{icon}</span>
        <span className="font-semibold text-accent-alt">{name}</span>
        {summary &&
          (summaryIsPath ? (
            <FilePathLink path={summary} tool={ev.tool} />
          ) : (
            <span className="min-w-0 flex-auto break-words font-mono text-[11px] text-text opacity-85">
              {summary}
            </span>
          ))}
        {trace.length > 0 && (
          <TooltipHint label="show what led to this tool call">
            <button
              type="button"
              className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-sm border border-accent-alt/25 bg-transparent px-1.5 py-px font-mono text-[9.5px] tracking-[0.5px] text-muted hover:border-accent-alt/60 hover:text-accent-alt"
              onClick={() => setShowTrace((v) => !v)}
            >
              {showTrace ? <ChevronUp size={11} aria-hidden /> : <ChevronDown size={11} aria-hidden />} why
            </button>
          </TooltipHint>
        )}
      </div>
      {showTrace && trace.length > 0 && (
        <div className="mb-1.5 ml-[18px] mt-0.5 flex flex-col gap-1.5 rounded-r-md border-l-2 border-accent-alt/35 bg-accent-alt/[0.04] px-2.5 py-1.5">
          <div className="font-mono text-[9px] font-extrabold uppercase tracking-[1.5px] text-accent-alt/70">
            what led to this
          </div>
          {trace.map((t, i) => (
            <WhyTraceRow key={i} ev={t} />
          ))}
        </div>
      )}
      {hunks.length > 0 && <DiffPreview hunks={hunks} />}
    </div>
  );
}

function WhyTraceRow({ ev }: { ev: AgentEvent }) {
  if (ev.kind === "user_prompt") {
    const text = String(ev.payload.text ?? "");
    const trimmed = text.length > 220 ? text.slice(0, 220) + "…" : text;
    return (
      <div className="flex items-start gap-1.5 text-[11px] leading-snug">
        <span className={traceTagClass("user")}>USER</span>
        <span className="min-w-0 flex-auto whitespace-pre-wrap break-words text-text">
          {trimmed}
        </span>
      </div>
    );
  }
  if (ev.kind === "assistant_text") {
    const text = String(ev.payload.text ?? "");
    const trimmed = text.length > 280 ? text.slice(0, 280) + "…" : text;
    return (
      <div className="flex items-start gap-1.5 text-[11px] leading-snug">
        <span className={traceTagClass("assistant")}>THINKING</span>
        <span className="min-w-0 flex-auto whitespace-pre-wrap break-words text-text">
          {trimmed}
        </span>
      </div>
    );
  }
  if (ev.kind === "tool_result") {
    const text = renderText(ev.payload.output);
    const trimmed = text.length > 180 ? text.slice(0, 180) + "…" : text;
    return (
      <div className="flex items-start gap-1.5 text-[11px] leading-snug">
        <span className={traceTagClass("result")}>RESULT</span>
        <span className="min-w-0 flex-auto whitespace-pre-wrap break-words font-mono text-[10.5px] text-text opacity-85">
          {trimmed || "(empty)"}
        </span>
      </div>
    );
  }
  return null;
}

/** Detect an error result in plain text. Kept narrow on purpose —
 * generic prefixes like "Failed to" or "Could not" false-positive on
 * normal tool output that happens to start that way. We rely on
 * upstream `is_error` flags for the rest. */
function looksLikeErrorText(text: string): boolean {
  const head = text.trimStart().slice(0, 120);
  return head.startsWith("<tool_use_error>") || head.startsWith("<error>");
}

/** Pull a (text, exitCode, isError, ...) tuple out of a tool_result
 * payload. Tries known shapes from each upstream in order, with
 * shared isError detection at the bottom. */
function unpackToolResult(output: unknown): {
  text: string;
  exitCode?: number;
  isError: boolean;
  errorMessage?: string;
  lineCount?: number;
} {
  if (typeof output === "string") {
    const isError = looksLikeErrorText(output);
    return {
      text: output,
      isError,
      errorMessage: isError ? output.split("\n")[0].slice(0, 200) : undefined,
    };
  }
  if (!output || typeof output !== "object") {
    return { text: String(output ?? ""), isError: false };
  }
  const o = output as Record<string, unknown>;

  // Claude Read's structured response: `{ type: "text", file: { content, numLines } }`
  if (o.type === "text" && o.file && typeof o.file === "object") {
    const f = o.file as Record<string, unknown>;
    return {
      text: typeof f.content === "string" ? f.content : "",
      isError: false,
      lineCount: typeof f.numLines === "number" ? f.numLines : undefined,
    };
  }
  // Claude content-wrapped string response: `{ type: "text", text: "..." }`
  if (o.type === "text" && typeof o.text === "string") {
    const isError = o.is_error === true || looksLikeErrorText(o.text);
    return {
      text: o.text,
      isError,
      errorMessage: isError ? o.text.split("\n")[0].slice(0, 200) : undefined,
    };
  }

  // Resolve fields once for the remaining shapes.
  const exitCode =
    typeof o.exitCode === "number"
      ? o.exitCode
      : typeof o.exit_code === "number"
      ? o.exit_code
      : undefined;
  const stdout = typeof o.stdout === "string" ? o.stdout : "";
  const stderr = typeof o.stderr === "string" ? o.stderr : "";
  const errStr =
    typeof o.error === "string" && o.error
      ? o.error
      : typeof o.message === "string" && o.success === false
      ? o.message
      : "";
  // Cursor/Codex shell `{ output | aggregated_output }`, Claude
  // `{ stdout, stderr }`, plus Cursor non-shell `{ success: false }`
  // collapse here. Pick the first non-empty text source.
  const text =
    (typeof o.output === "string" && o.output) ||
    (typeof o.aggregated_output === "string" && o.aggregated_output) ||
    (stderr ? `${stdout}${stdout ? "\n" : ""}${stderr}` : stdout) ||
    errStr ||
    JSON.stringify(o, null, 2);
  const isError =
    o.is_error === true ||
    o.isError === true ||
    o.interrupted === true ||
    o.success === false ||
    o.ok === false ||
    !!errStr ||
    (typeof exitCode === "number" && exitCode !== 0);
  const errorMessage = isError
    ? (errStr || stderr || "").split("\n")[0].slice(0, 200) || undefined
    : undefined;
  return { text, exitCode, isError, errorMessage };
}

function formatDuration(ms?: number): string | undefined {
  if (typeof ms !== "number" || ms < 1000) return undefined;
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m${s}s`;
}

// Tools whose default-collapsed result is "↳ done"-style (with show-raw
// toggle). For Read, the file path is already a clickable link in the
// tool_use row, so re-showing the full content in the result is noise.
// Edit/Write/MultiEdit are collapsed because the diff above already
// shows the change.
const TERSE_RESULT_TOOLS = new Set([
  "Read",
  "Edit",
  "Write",
  "MultiEdit",
  "NotebookEdit",
]);

function ToolResultRow({ ev }: { ev: AgentEvent }) {
  const [expanded, setExpanded] = useState(false);
  const name = String(ev.payload.name ?? "");
  const { text, exitCode, isError, errorMessage, lineCount } = unpackToolResult(
    ev.payload.output
  );
  const isShell = name === "Bash";
  const durationLabel = formatDuration(ev.payload.durationMs);
  // Tools where the diff or path link above already conveys the
  // information; collapse the verbose body by default.
  const isTerse = TERSE_RESULT_TOOLS.has(name);
  const isEditFamily = EDIT_TOOLS.has(name);
  if (!text.trim()) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1.5 pl-[18px] text-[11px] text-muted",
          isError && "text-[#ff8870]"
        )}
      >
        {isError ? <><AlertTriangle size={11} aria-hidden /> failed</> : <><CornerDownRight size={11} aria-hidden /> done</>}
        {errorMessage && (
          <span className="font-mono text-[11px] text-[#ffb0a0] opacity-85">
            {errorMessage}
          </span>
        )}
        {typeof exitCode === "number" && exitCode !== 0 && (
          <span className={toolExitClass(exitCode)}>exit {exitCode}</span>
        )}
        {durationLabel && (
          <span className={cn(toolPillClass, "border-white/15 bg-white/[0.08] text-muted")}>
            {durationLabel}
          </span>
        )}
      </div>
    );
  }
  if (isTerse && !expanded) {
    const verb = isError ? (
      <><AlertTriangle size={11} aria-hidden /> failed</>
    ) : isEditFamily ? (
      <><CornerDownRight size={11} aria-hidden /> applied</>
    ) : name === "Read" && typeof lineCount === "number" ? (
      <><CornerDownRight size={11} aria-hidden /> read {lineCount} line{lineCount === 1 ? "" : "s"}</>
    ) : (
      <><CornerDownRight size={11} aria-hidden /> done</>
    );
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1.5 pl-[18px] text-[11px] text-muted",
          isError && "text-[#ff8870]"
        )}
      >
        {verb}
        {errorMessage && (
          <span className="font-mono text-[11px] text-[#ffb0a0] opacity-85">
            {errorMessage}
          </span>
        )}
        <button
          type="button"
          className="ml-2 cursor-pointer border-0 bg-transparent p-0 text-[10.5px] text-accent"
          onClick={() => setExpanded(true)}
        >
          show raw
        </button>
      </div>
    );
  }
  const trimmed = text.length > 220 ? text.slice(0, 220) + "…" : text;
  const showExpand = text.length > 220;
  return (
    <div className={toolResultClass(isError, isShell)}>
      {errorMessage && (
        <div className="mb-1 whitespace-pre-wrap break-words rounded-sm border-l-[3px] border-l-[#ff6650] bg-[rgba(255,90,80,0.12)] px-2 py-1 font-mono text-[11px] text-[#ffb0a0]">
          <AlertTriangle size={12} aria-hidden /> {errorMessage}
        </div>
      )}
      <pre className="m-0 max-h-[180px] overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-line bg-surface-2 px-2.5 py-1.5 font-mono text-[11px] text-muted">
        {expanded ? text : trimmed}
      </pre>
      <div className="mt-1 flex items-center gap-2.5">
        {typeof exitCode === "number" && (
          <span className={toolExitClass(exitCode)}>
            exit {exitCode}
          </span>
        )}
        {durationLabel && (
          <span className={cn(toolPillClass, "border-white/15 bg-white/[0.08] text-muted")}>
            {durationLabel}
          </span>
        )}
        {(showExpand || isTerse) && (
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent p-0 text-[10.5px] text-accent"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded
              ? "show less"
              : showExpand
              ? `show all (${text.length} chars)`
              : "show raw"}
          </button>
        )}
      </div>
    </div>
  );
}

function AssistantBubble({ text }: { text: string }) {
  return (
    <div className="mt-1 flex">
      <div className="max-w-[92%] whitespace-pre-wrap break-words rounded-lg rounded-bl-sm border border-line bg-[linear-gradient(180deg,#1a2752,#14204a)] px-2.5 py-2 text-text">
        <Streamdown plugins={STREAMDOWN_PLUGINS}>{text}</Streamdown>
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="mt-1 flex justify-end">
      <div className="max-w-[92%] break-words rounded-lg rounded-br-sm border border-accent-alt/40 border-r-[3px] border-r-accent bg-[linear-gradient(180deg,#1a2752,#14204a)] px-2.5 py-2 text-text shadow-[0_0_12px_rgba(255,216,107,0.08)]">
        <span className="mr-1.5 inline-block rounded-sm bg-accent-alt/20 px-1.5 py-px align-middle text-[9px] font-bold uppercase tracking-[0.6px] text-accent">
          King
        </span>
        <div className="inline align-middle [&_code]:rounded-sm [&_code]:bg-accent-alt/[0.12] [&_code]:px-1 [&_code]:text-accent [&_pre]:m-0 [&_pre]:rounded-md [&_pre]:border [&_pre]:border-accent-alt/20 [&_pre]:bg-black/35 [&_pre]:px-2 [&_pre]:py-1.5 [&_pre]:text-[11px] [&>*+*]:mt-1.5 [&>*]:m-0">
          <Streamdown plugins={STREAMDOWN_PLUGINS}>{text}</Streamdown>
        </div>
      </div>
    </div>
  );
}

function PermissionRequestRow({ ev }: { ev: AgentEvent }) {
  const letters = useStore((s) => s.letters);
  const requestId =
    typeof ev.payload.requestId === "string" ? ev.payload.requestId : undefined;
  // A permission is "active" while a letter for it still exists in
  // AlertsHUD. Once the King allows/denies (or the upstream resolves
  // it externally), the letter is dismissed and the inline marker
  // becomes historical — render as static text, no click target.
  const isActive = useMemo(() => {
    if (!requestId) return false;
    for (const l of letters) {
      for (const a of l.actions) {
        if (
          (a.action.kind === "permission-allow" ||
            a.action.kind === "permission-deny" ||
            a.action.kind === "permission-observe") &&
          a.action.requestId === requestId
        ) {
          return true;
        }
      }
    }
    return false;
  }, [letters, requestId]);
  const onClick = () => {
    if (!requestId || !isActive) return;
    window.dispatchEvent(
      new CustomEvent("kh:expand-hud", { detail: { title: "Alerts" } })
    );
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(
        `.hud-top-right [data-letter-request-id="${requestId}"]`
      );
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      el.classList.remove("letter-pulse");
      void el.offsetWidth;
      el.classList.add("letter-pulse");
      window.setTimeout(() => el.classList.remove("letter-pulse"), 3600);
    }));
  };
  const inner = (
    <>
      <span className={markerLineClass} />
      <span className={markerTextClass}>
        permission requested
        {!isActive && requestId && (
          <span className="font-normal opacity-70"> · resolved</span>
        )}
      </span>
    </>
  );
  if (!isActive) {
    return (
      <div
        className={cn(
          markerClass,
          "w-full cursor-default rounded-md border border-[#ffa850]/35 px-2 py-1 text-left text-text opacity-55"
        )}
        aria-disabled="true"
      >
        {inner}
      </div>
    );
  }
  return (
    <TooltipHint label="click to spotlight the alert">
      <button
        type="button"
        className={cn(
          markerClass,
          "w-full cursor-pointer rounded-md border border-[#ffa850]/35 bg-transparent px-2 py-1 text-left text-text transition-colors hover:border-[#ffa850]/55 hover:bg-[#ffa850]/[0.08] [&>span:last-child]:font-semibold [&>span:last-child]:text-[#ffb070]"
        )}
        onClick={onClick}
      >
        {inner}
      </button>
    </TooltipHint>
  );
}

function SubagentSpawnRow({
  ev,
  units,
}: {
  ev: AgentEvent;
  units: Record<string, UnitState>;
}) {
  // The spawned subagent's session may not be a known unit yet (fires
  // in tight succession); show the prompt summary regardless and the
  // spawned wielder's display name once we know it.
  const childId = String(ev.payload.parentSessionId ?? "");
  const child = childId ? units[childId] : undefined;
  const summary = String(ev.payload.text ?? ev.payload.input ?? "").slice(0, 200);
  return (
    <div className={cn(markerClass, "[&>span:last-child]:text-[#f8a8e8]")}>
      <span className={markerLineClass} />
      <span className={markerTextClass}>
        <CornerDownRight size={11} aria-hidden /> summoned subagent
        {child && (
          <span className="font-semibold"> · {child.displayName}</span>
        )}
        {summary && (
          <span className="italic opacity-75">: {summary}</span>
        )}
      </span>
    </div>
  );
}

function SessionMarker({ ev }: { ev: AgentEvent }) {
  return (
    <div className={markerClass}>
      <span className={markerLineClass} />
      <span className={markerTextClass}>
        {ev.kind === "session_start" ? "session started" : "session ended"}
      </span>
    </div>
  );
}

function ErrorRow({ ev }: { ev: AgentEvent }) {
  return (
    <div className="flex items-start gap-1.5 rounded-md border border-danger bg-danger/[0.12] px-2 py-1.5 font-mono text-[11px] text-danger">
      <AlertTriangle size={12} aria-hidden className="mt-0.5 shrink-0" />
      <span className="min-w-0 break-words">
        {String(ev.payload.error ?? "").slice(0, 280)}
      </span>
    </div>
  );
}

function UnitBadge({ unit }: { unit: UnitState }) {
  return (
    <div className="mb-1 mt-2 flex items-center gap-1.5 border-b border-dashed border-line pb-1 text-[10px] uppercase tracking-[0.6px]">
      <span
        className="size-2 rounded-full"
        style={{ background: ROLE_HEX[unit.role] }}
      />
      <span className="font-semibold text-text">{unit.displayName}</span>
      <span className="ml-auto text-muted">{unit.tool}</span>
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

  // Subagent IDs whose parent is the wielder we're viewing — included
  // in the filter so their tool calls / responses appear inline under
  // the parent's chat. Each row is tagged with `isSubagent` so the
  // renderer can indent it visually.
  const subagentIds = useMemo(() => {
    if (!sessionId) return new Set<string>();
    const out = new Set<string>();
    for (const u of Object.values(units)) {
      if (u.parentSessionId === sessionId) out.add(u.sessionId);
    }
    return out;
  }, [units, sessionId]);

  // Build a set of "interrupted" user_prompt event keys — the
  // King-edits-and-resends case: user starts typing, hits Esc, edits,
  // re-sends. We see two user_prompts but only the second was processed.
  // Hide the first.
  //
  // Terminator is only the NEXT user_prompt — not session_end. Stop
  // hooks map to session_end at the bridge (Stop = "agent finished one
  // turn"), so using session_end as a terminator would hide every
  // prompt whose response we didn't observe — which includes any tool
  // (e.g. Codex) whose assistant text bypasses our transcript watcher.
  // If a prompt has no observed work and no follow-up, leave it visible:
  // it's more honest to show "you sent X, no response captured" than to
  // silently drop it.
  const interruptedPromptIds = useMemo(() => {
    if (!sessionId) return new Set<string>();
    const same = events
      .filter(
        (e) => e.sessionId === sessionId || subagentIds.has(e.sessionId)
      )
      .slice()
      .reverse(); // oldest-first for forward scan
    const interrupted = new Set<string>();
    for (let i = 0; i < same.length; i++) {
      const e = same[i];
      if (e.kind !== "user_prompt") continue;
      let didWork = false;
      let sawNextPrompt = false;
      for (let j = i + 1; j < same.length; j++) {
        const next = same[j];
        if (next.kind === "user_prompt") {
          sawNextPrompt = true;
          break;
        }
        if (
          next.kind === "tool_use" ||
          next.kind === "tool_result" ||
          next.kind === "assistant_text" ||
          next.kind === "permission_request" ||
          next.kind === "subagent_spawn"
        ) {
          didWork = true;
          break;
        }
      }
      if (sawNextPrompt && !didWork) {
        interrupted.add(`${e.sessionId}:${e.timestamp}`);
      }
    }
    return interrupted;
  }, [events, sessionId, subagentIds]);

  const { filtered, hiddenCount } = useMemo(() => {
    const isInterrupted = (e: AgentEvent) =>
      e.kind === "user_prompt" &&
      interruptedPromptIds.has(`${e.sessionId}:${e.timestamp}`);
    const f = sessionId
      ? events.filter(
          (e) =>
            (e.sessionId === sessionId || subagentIds.has(e.sessionId)) &&
            !isInterrupted(e)
        )
      : events.filter((e) => !muted[e.sessionId] && !isInterrupted(e));
    const recent = f.slice(0, cap).reverse();
    return { filtered: recent, hiddenCount: Math.max(0, f.length - cap) };
  }, [events, sessionId, subagentIds, muted, cap, interruptedPromptIds]);

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
    el.classList.remove(
      "animate-[event-pulse_1.6s_ease-out]",
      "bg-accent-alt/[0.12]"
    );
    void el.offsetWidth;
    el.classList.add(
      "animate-[event-pulse_1.6s_ease-out]",
      "bg-accent-alt/[0.12]"
    );
    const handle = window.setTimeout(
      () =>
        el.classList.remove(
          "animate-[event-pulse_1.6s_ease-out]",
          "bg-accent-alt/[0.12]"
        ),
      1600
    );
    return () => window.clearTimeout(handle);
  }, [scrollToTs, scrollToTick, filtered.length]);

  const showBadges = !sessionId;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-3.5 pb-4 pt-3 text-[12.5px] leading-normal"
      ref={containerRef}
    >
      {hiddenCount > 0 && (
        <div className={markerClass}>
          <span className={markerTextClass}>
            {hiddenCount} earlier events hidden
          </span>
        </div>
      )}
      {filtered.length === 0 && (
        <EmptyState className="min-h-0 bg-transparent">
          No conversation yet for this wielder.
        </EmptyState>
      )}
      {filtered.map((e, i) => {
        const unit = units[e.sessionId];
        const prev = filtered[i - 1];
        const sameUnitAsPrev = prev && prev.sessionId === e.sessionId;
        const badge =
          showBadges && unit && !sameUnitAsPrev ? <UnitBadge unit={unit} /> : null;
        // Subagent rows: drawn from a session whose parent is the
        // wielder we're viewing. Always show the badge so the King
        // can tell whose action is whose; indent for visual nesting.
        const isSubagent = sessionId
          ? subagentIds.has(e.sessionId)
          : false;
        const subagentBadge =
          isSubagent && unit && !sameUnitAsPrev ? <UnitBadge unit={unit} /> : null;
        let body: React.ReactNode = null;
        switch (e.kind) {
          case "session_start":
          case "session_end":
            body = <SessionMarker ev={e} />;
            break;
          case "subagent_spawn":
            body = <SubagentSpawnRow ev={e} units={units} />;
            break;
          case "permission_request":
            body = <PermissionRequestRow ev={e} />;
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
          <div
            key={i}
            data-event-ts={e.timestamp}
            className={cn(
              "relative rounded-sm transition-colors",
              isSubagent &&
                "ml-[22px] border-l-2 border-[#ff82dc]/35 pl-2"
            )}
          >
            {badge}
            {subagentBadge}
            {body}
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
