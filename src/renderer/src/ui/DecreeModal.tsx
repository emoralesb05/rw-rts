/**
 * Decree composer — Phase 2B verb #14, layered modal per Q39=b.
 *
 * Free-text primary; type `@` to open a file palette (populated from the
 * wielder's recent Read/Edit tool calls in the event log) and `/` to
 * open a command palette (predefined common commands + free-form).
 *
 * KH-flavored as a royal proclamation: gold sigil, formal framing,
 * distinct from Send word's gentle text-only prompt.
 *
 * Wired via store.openDecreeFor(unitId) — set on a wielder card click.
 * Modal closes on Esc or click-outside. Send dispatches via the
 * existing sendPrompt IPC (same channel as Send word).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { useStore } from "../store";
import type { AgentEvent } from "@shared/events";

const COMMON_COMMANDS = [
  "bun test",
  "bun run typecheck",
  "bun run dev",
  "bun run build",
  "git status",
  "git diff",
  "git log -10",
  "ls -la",
];

type Mode = { kind: "idle" } | { kind: "files"; query: string } | { kind: "commands"; query: string };

// Standing Order interval options per Q37.
const INTERVALS: { label: string; ms: number | null }[] = [
  { label: "once", ms: null },
  { label: "every 1m", ms: 60_000 },
  { label: "every 5m", ms: 5 * 60_000 },
  { label: "every 15m", ms: 15 * 60_000 },
  { label: "every 30m", ms: 30 * 60_000 },
  { label: "every 1h", ms: 60 * 60_000 },
];

export function DecreeModal() {
  const decreeUnitId = useStore((s) => s.decreeUnitId);
  const closeDecree = useStore((s) => s.closeDecree);
  const units = useStore((s) => s.units);
  const events = useStore((s) => s.events);
  const unit = decreeUnitId ? units[decreeUnitId] : null;

  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const [intervalMs, setIntervalMs] = useState<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Reset state when modal opens for a different wielder.
  useEffect(() => {
    if (decreeUnitId) {
      setText("");
      setMode({ kind: "idle" });
      setIntervalMs(null);
      // Focus next tick so React mounts the textarea first.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [decreeUnitId]);

  // Esc to close.
  useEffect(() => {
    if (!decreeUnitId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDecree();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decreeUnitId, closeDecree]);

  const recentFiles = useMemo(() => {
    if (!unit) return [];
    return extractRecentFiles(events, unit.sessionId);
  }, [unit, events]);

  const fileSuggestions = useMemo(() => {
    if (mode.kind !== "files") return [];
    const q = mode.query.toLowerCase();
    return recentFiles.filter((f) => f.toLowerCase().includes(q)).slice(0, 8);
  }, [mode, recentFiles]);

  const commandSuggestions = useMemo(() => {
    if (mode.kind !== "commands") return [];
    const q = mode.query.toLowerCase();
    return COMMON_COMMANDS.filter((c) => c.toLowerCase().includes(q)).slice(0, 8);
  }, [mode]);

  if (!unit) return null;

  function handleChange(v: string) {
    setText(v);
    // Detect palette triggers based on the last token after a space/newline.
    const m = v.match(/(?:^|[\s\n])([@/])([^\s@/]*)$/);
    if (!m) {
      setMode({ kind: "idle" });
      return;
    }
    const trigger = m[1];
    const query = m[2] ?? "";
    setMode(trigger === "@" ? { kind: "files", query } : { kind: "commands", query });
  }

  function applySuggestion(s: string) {
    // Replace the trailing token (the @foo or /foo) with the formatted insert.
    const insert =
      mode.kind === "files" ? `\`${s}\`` :
      mode.kind === "commands" ? `\`${s}\`` :
      s;
    const replaced = text.replace(/(?:[@/])([^\s@/]*)$/, insert + " ");
    setText(replaced);
    setMode({ kind: "idle" });
    inputRef.current?.focus();
  }

  async function send() {
    if (!unit || !text.trim() || busy) return;
    if (!unit.spawnedHere) return;
    setBusy(true);
    try {
      const trimmed = text.trim();
      if (intervalMs === null) {
        // One-shot Decree.
        const prompt = `[Decree from the King]\n\n${trimmed}`;
        await window.kh.sendPrompt({ unitId: unit.id, prompt });
      } else {
        // Standing Order — confirm before starting (per Q37 visibility).
        const intervalLabel = INTERVALS.find((i) => i.ms === intervalMs)?.label ?? "interval";
        const confirmed = confirm(
          `Issue Standing Order to ${unit.displayName}?\n\n` +
            `Will run ${intervalLabel} (max 24 iterations, halts after 3 consecutive failures).\n\n` +
            `"${trimmed.slice(0, 200)}${trimmed.length > 200 ? "…" : ""}"`
        );
        if (!confirmed) return;
        useStore.getState().startStandingOrder(unit.id, trimmed, intervalMs);
      }
      closeDecree();
    } finally {
      setBusy(false);
    }
  }

  const sendDisabled = busy || !text.trim() || !unit.spawnedHere;

  return (
    <div className="decree-overlay" onClick={closeDecree}>
      <div className="decree-modal" onClick={(e) => e.stopPropagation()}>
        <header className="decree-header">
          <span className="decree-sigil">⚜</span>
          <span className="decree-title">DECREE</span>
          <span className="decree-target">to {unit.displayName}</span>
          <button
            type="button"
            className="decree-close"
            onClick={closeDecree}
            aria-label="close"
          >
            <X size={16} aria-hidden />
          </button>
        </header>
        {!unit.spawnedHere && (
          <div className="decree-warn">
            {unit.role} is observed-only — keykeeper didn't spawn this
            wielder, so we can't send it commands.
          </div>
        )}
        <div className="decree-composer">
          <textarea
            ref={inputRef}
            className="decree-textarea"
            placeholder="Issue your command. Type @ for files, / for commands."
            value={text}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !sendDisabled) {
                e.preventDefault();
                void send();
              }
            }}
            rows={5}
            disabled={busy || !unit.spawnedHere}
          />
          {mode.kind === "files" && fileSuggestions.length > 0 && (
            <Palette
              label="recent files"
              items={fileSuggestions}
              onPick={applySuggestion}
            />
          )}
          {mode.kind === "commands" && commandSuggestions.length > 0 && (
            <Palette
              label="commands"
              items={commandSuggestions}
              onPick={applySuggestion}
            />
          )}
          {mode.kind === "files" && fileSuggestions.length === 0 && (
            <div className="decree-empty">
              no recent files for {unit.displayName}
            </div>
          )}
        </div>
        <div className="decree-interval">
          <span className="decree-interval-label">repeat</span>
          {INTERVALS.map((i) => (
            <button
              key={i.label}
              type="button"
              className={
                "decree-interval-btn" + (i.ms === intervalMs ? " active" : "")
              }
              onClick={() => setIntervalMs(i.ms)}
              disabled={busy || !unit.spawnedHere}
            >
              {i.label}
            </button>
          ))}
        </div>
        <footer className="decree-footer">
          <span className="decree-hint">⌘↩ to send · esc to cancel</span>
          <button
            type="button"
            className="decree-send"
            onClick={() => void send()}
            disabled={sendDisabled}
          >
            {intervalMs === null ? "⚜ Issue Decree" : "⚜ Issue Standing Order"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Palette({
  label,
  items,
  onPick,
}: {
  label: string;
  items: string[];
  onPick: (item: string) => void;
}) {
  return (
    <div className="decree-palette" role="listbox" aria-label={label}>
      <div className="decree-palette-label">{label}</div>
      {items.map((item) => (
        <button
          key={item}
          type="button"
          className="decree-palette-item"
          onClick={() => onPick(item)}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

/**
 * Walk the event log newest-first; collect file paths from tool_use
 * inputs (Read / Edit / Write / Glob). Dedupe; cap at 30.
 */
function extractRecentFiles(events: AgentEvent[], sessionId: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = events.length - 1; i >= 0 && out.length < 30; i--) {
    const ev = events[i];
    if (ev.sessionId !== sessionId) continue;
    if (ev.kind !== "tool_use") continue;
    const input = ev.payload.input as { file_path?: unknown; pattern?: unknown } | undefined;
    const candidate =
      typeof input?.file_path === "string" ? input.file_path :
      typeof input?.pattern === "string" ? input.pattern :
      null;
    if (!candidate) continue;
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    out.push(candidate);
  }
  return out;
}
