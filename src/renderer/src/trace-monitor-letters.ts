import type { Letter, UnitState } from "@shared/events";
import {
  evaluateTraceMonitors,
  type TraceMonitorSignal,
} from "@shared/trace-monitors";
import { projectTraces } from "@shared/traces";
import { useStore } from "./store";

const MONITOR_LETTER_PREFIX = "monitor:";
const MONITOR_POLL_MS = 15_000;

export type TraceMonitorLetterContext = {
  letters: readonly Letter[];
  units: Record<string, UnitState>;
  now?: number;
  emittedSignalIds?: ReadonlySet<string>;
};

export type TraceMonitorLetterEntry = {
  signalId: string;
  letter: Letter;
};

export function traceMonitorLetterEntries(
  signals: readonly TraceMonitorSignal[],
  context: TraceMonitorLetterContext
): TraceMonitorLetterEntry[] {
  const entries: TraceMonitorLetterEntry[] = [];
  const existingIds = new Set(context.letters.map((letter) => letter.id));
  const sessionsWithLetters = new Set<string>();

  for (const signal of signals) {
    if (sessionsWithLetters.has(signal.sessionId)) continue;
    const entry = traceMonitorLetterEntry(signal, context);
    if (!entry) continue;
    if (existingIds.has(entry.letter.id)) continue;
    existingIds.add(entry.letter.id);
    sessionsWithLetters.add(signal.sessionId);
    entries.push(entry);
  }

  return entries;
}

export function emitTraceMonitorLetters(
  emittedSignalIds = new Set<string>()
): TraceMonitorLetterEntry[] {
  const state = useStore.getState();
  const signals = evaluateTraceMonitors(projectTraces(state.events));
  const entries = traceMonitorLetterEntries(signals, {
    letters: state.letters,
    units: state.units,
    emittedSignalIds,
  });
  for (const entry of entries) {
    emittedSignalIds.add(entry.signalId);
    useStore.getState().addLetter(entry.letter);
  }
  return entries;
}

export function attachTraceMonitorLetters(
  intervalMs = MONITOR_POLL_MS
): () => void {
  const emittedSignalIds = new Set<string>();

  const run = () => {
    emitTraceMonitorLetters(emittedSignalIds);
  };
  run();

  const unsubscribe = useStore.subscribe((state, previous) => {
    if (state.eventCount !== previous.eventCount) run();
  });
  const timer = window.setInterval(run, intervalMs);

  return () => {
    unsubscribe();
    window.clearInterval(timer);
  };
}

function traceMonitorLetterEntry(
  signal: TraceMonitorSignal,
  context: TraceMonitorLetterContext
): TraceMonitorLetterEntry | null {
  if (context.emittedSignalIds?.has(signal.id)) return null;
  if (
    signal.kind === "waiting" &&
    hasBlockingLetterForSession(context.letters, signal.sessionId)
  ) {
    return null;
  }

  const unit = context.units[signal.sessionId];
  const name = unit?.displayName ?? signal.tool;
  const letter: Letter = {
    id: `${MONITOR_LETTER_PREFIX}${signal.id}`,
    createdAt: context.now ?? Date.now(),
    severity: signal.severity === "critical" ? "important" : "notable",
    title: monitorTitle(signal, name),
    body: `${signal.detail} Active for ${formatDuration(signal.durationMs)}.`,
    sessionId: signal.sessionId,
    worldId: unit?.worldId,
    actions: monitorActions(signal, unit),
  };
  return { signalId: signal.id, letter };
}

function monitorTitle(signal: TraceMonitorSignal, name: string): string {
  switch (signal.kind) {
    case "waiting":
      return `${name} is waiting`;
    case "slow_tool":
      return `${name}'s tool is slow`;
    case "stale_trace":
      return `${name} went quiet`;
    case "error_trace":
      return `${name} hit a trace error`;
  }
}

function monitorActions(
  signal: TraceMonitorSignal,
  unit: UnitState | undefined
): Letter["actions"] {
  if (!unit) {
    return [{ label: "dismiss", action: { kind: "dismiss" } }];
  }

  const actions: Letter["actions"] = [
    { label: "send word", action: { kind: "send-word", sessionId: unit.id } },
  ];
  if (signal.kind !== "waiting") {
    actions.push({
      label: "recall",
      action: { kind: "recall", sessionId: unit.id },
    });
  }
  actions.push({ label: "dismiss", action: { kind: "dismiss" } });
  return actions;
}

function hasBlockingLetterForSession(
  letters: readonly Letter[],
  sessionId: string
): boolean {
  return letters.some(
    (letter) =>
      letter.sessionId === sessionId &&
      letter.actions.some(
        (entry) =>
          entry.action.kind === "permission-allow" ||
          entry.action.kind === "permission-deny" ||
          entry.action.kind === "permission-choice" ||
          entry.action.kind === "permission-observe" ||
          entry.action.kind === "user-input-submit"
      )
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}
