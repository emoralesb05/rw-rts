/**
 * Decree composer — Phase 2B verb #14, layered modal per Q39=b.
 *
 * Free-text primary; type `@` to open a file palette (populated from the
 * wielder's recent Read/Edit tool calls in the event log) and `/` to
 * open a command palette (predefined common commands + free-form).
 *
 * RW-flavored as a royal proclamation: gold sigil, formal framing,
 * distinct from Send word's gentle text-only prompt.
 *
 * Wired via store.openDecreeFor(unitId) — set on a wielder card click.
 * Modal closes on Esc or click-outside. Send dispatches via the
 * existing sendPrompt IPC (same channel as Send word).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogIconClose,
  DialogTitle,
} from "./components/primitives/Dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./components/primitives/AlertDialog";
import {
  Command,
  CommandItem,
  CommandList,
} from "./components/primitives/Command";
import { Button } from "./components/kit/Button";
import { Textarea } from "./components/kit/Textarea";
import { useStore } from "../store";
import { cn } from "@/lib/cn";
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

type Mode =
  | { kind: "idle" }
  | { kind: "files"; query: string }
  | { kind: "commands"; query: string };
type PendingOrder = {
  intervalLabel: string;
  intervalMs: number;
  text: string;
};

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
  const [pendingOrder, setPendingOrder] = useState<PendingOrder | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Reset state when modal opens for a different wielder.
  useEffect(() => {
    if (decreeUnitId) {
      setText("");
      setMode({ kind: "idle" });
      setIntervalMs(null);
      setPendingOrder(null);
      // Focus next tick so React mounts the textarea first.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [decreeUnitId]);

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
    return COMMON_COMMANDS.filter((c) => c.toLowerCase().includes(q)).slice(
      0,
      8
    );
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
    setMode(
      trigger === "@" ? { kind: "files", query } : { kind: "commands", query }
    );
  }

  function applySuggestion(s: string) {
    // Replace the trailing token (the @foo or /foo) with the formatted insert.
    const insert =
      mode.kind === "files"
        ? `\`${s}\``
        : mode.kind === "commands"
          ? `\`${s}\``
          : s;
    const replaced = text.replace(/(?:[@/])([^\s@/]*)$/, insert + " ");
    setText(replaced);
    setMode({ kind: "idle" });
    inputRef.current?.focus();
  }

  async function send() {
    if (!unit || !text.trim() || busy) return;
    if (!unit.spawnedHere) return;
    const trimmed = text.trim();
    if (intervalMs !== null) {
      const intervalLabel =
        INTERVALS.find((i) => i.ms === intervalMs)?.label ?? "interval";
      setPendingOrder({ intervalLabel, intervalMs, text: trimmed });
      return;
    }
    setBusy(true);
    try {
      const prompt = `[Decree from the King]\n\n${trimmed}`;
      await window.rw.sendPrompt({ unitId: unit.id, prompt });
      closeDecree();
    } finally {
      setBusy(false);
    }
  }

  function confirmStandingOrder() {
    if (!unit || !pendingOrder || busy) return;
    setBusy(true);
    try {
      useStore
        .getState()
        .startStandingOrder(
          unit.id,
          pendingOrder.text,
          pendingOrder.intervalMs
        );
      setPendingOrder(null);
      closeDecree();
    } finally {
      setBusy(false);
    }
  }

  const sendDisabled = busy || !text.trim() || !unit.spawnedHere;

  return (
    <Dialog
      open={!!unit}
      onOpenChange={(open) => {
        if (!open) closeDecree();
      }}
    >
      <DialogContent
        className="border-accent-alt/40 flex max-h-[80vh] w-[min(620px,calc(100vw-48px))] flex-col overflow-hidden rounded-[10px] bg-[linear-gradient(180deg,#1a1340_0%,#0a0518_100%)] p-0 shadow-[0_12px_60px_rgba(0,0,0,0.7),0_0_24px_rgba(255,216,107,0.18)]"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <DialogHeader className="border-accent-alt/25 border-b bg-[linear-gradient(180deg,rgba(214,64,64,0.18),transparent)] px-4 py-3">
          <span className="text-accent-alt text-xl">⚜</span>
          <DialogTitle asChild>
            <span className="text-accent-alt font-mono text-sm font-extrabold tracking-[3px] uppercase">
              DECREE
            </span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Compose and send a decree to {unit.displayName}.
          </DialogDescription>
          <span className="text-muted flex-1 text-xs">
            to {unit.displayName}
          </span>
          <DialogIconClose className="ml-auto" aria-label="close" />
        </DialogHeader>
        {!unit.spawnedHere && (
          <div className="border-b border-[#ff5a3c]/30 bg-[#ff5a3c]/[0.12] px-4 py-2.5 text-xs text-[#ffb6a0]">
            {unit.displayName} is observed-only — Realmkeeper didn't spawn this
            wielder, so we can't send it commands.
          </div>
        )}
        <div className="relative min-h-0 flex-1 p-4">
          <Textarea
            ref={inputRef}
            className="font-ui focus-visible:border-accent-alt/60 min-h-[100px] resize-y rounded-md bg-[rgba(10,5,24,0.6)] px-3 py-2.5 text-[13px]"
            placeholder="Issue your command. Type @ for files, / for commands."
            value={text}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                (e.metaKey || e.ctrlKey) &&
                !sendDisabled
              ) {
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
            <div className="text-muted mt-2 px-2.5 py-2 text-[11px] italic">
              no recent files for {unit.displayName}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 border-t border-white/[0.06] px-4 py-2">
          <span className="text-muted mr-1 font-mono text-[10px] font-bold tracking-[1.2px] uppercase">
            repeat
          </span>
          {INTERVALS.map((i) => (
            <Button
              key={i.label}
              type="button"
              variant="ghost"
              className={cn(
                "min-h-0 rounded-sm px-2.5 py-1 font-mono text-[11px]",
                i.ms === intervalMs
                  ? "border-accent-alt bg-accent-alt/[0.08] text-accent-alt"
                  : "border-line text-muted hover:border-accent-alt/50 hover:text-text"
              )}
              onClick={() => setIntervalMs(i.ms)}
              disabled={busy || !unit.spawnedHere}
            >
              {i.label}
            </Button>
          ))}
        </div>
        <footer className="border-accent-alt/25 flex items-center justify-between border-t bg-[rgba(10,5,24,0.4)] px-4 py-3">
          <span className="text-muted font-mono text-[11px]">
            ⌘↩ to send · esc to cancel
          </span>
          <Button
            type="button"
            variant={sendDisabled ? "default" : "gold"}
            className={cn(
              "rounded-md px-4 py-2 text-xs font-bold tracking-[0.5px]",
              !sendDisabled && "hover:shadow-[0_0_12px_rgba(255,216,107,0.5)]"
            )}
            onClick={() => void send()}
            disabled={sendDisabled}
          >
            {intervalMs === null ? "⚜ Issue Decree" : "⚜ Issue Standing Order"}
          </Button>
        </footer>
      </DialogContent>
      <AlertDialog
        open={pendingOrder !== null}
        onOpenChange={(open) => {
          if (!open) setPendingOrder(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Issue Standing Order to {unit.displayName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Will run {pendingOrder?.intervalLabel ?? "on interval"} with a max
              of 24 iterations, halting after 3 consecutive failures.
            </AlertDialogDescription>
            {pendingOrder && (
              <div className="border-line text-text mt-1 rounded-sm border bg-black/25 p-2 text-xs leading-relaxed">
                {pendingOrder.text.slice(0, 240)}
                {pendingOrder.text.length > 240 ? "…" : ""}
              </div>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={() => confirmStandingOrder()}
            >
              Issue order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
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
    <Command
      className="border-accent-alt/45 bg-panel-2/[0.98] absolute right-4 bottom-[-4px] left-4 z-[1] max-h-[240px] overflow-y-auto rounded-md border p-1.5 shadow-[0_6px_18px_rgba(0,0,0,0.5)]"
      label={label}
      shouldFilter={false}
      loop
    >
      <div className="text-muted px-1.5 pt-1 pb-1.5 font-mono text-[9px] font-bold tracking-[1.5px] uppercase">
        {label}
      </div>
      <CommandList className="max-h-none overflow-visible p-0">
        {items.map((item) => (
          <CommandItem
            key={item}
            className="hover:bg-accent-alt/[0.12] hover:text-accent-alt data-[selected=true]:bg-accent-alt/10 data-[selected=true]:text-accent-alt block min-h-0 w-full cursor-pointer rounded-sm px-2 py-1.5 font-mono text-xs"
            value={item}
            onSelect={() => onPick(item)}
          >
            {item}
          </CommandItem>
        ))}
      </CommandList>
    </Command>
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
    const input = ev.payload.input as
      | { file_path?: unknown; pattern?: unknown }
      | undefined;
    const candidate =
      typeof input?.file_path === "string"
        ? input.file_path
        : typeof input?.pattern === "string"
          ? input.pattern
          : null;
    if (!candidate) continue;
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    out.push(candidate);
  }
  return out;
}
