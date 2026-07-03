/**
 * Kingdom panel — tabbed dialog opened from the KingdomHeader pill.
 * Centralizes everything kingdom-level the King might want:
 *
 *   Overview   — stats, sealed worlds, top wielders by Renown,
 *                Reset Kingdom (danger zone)
 *   Settings   — workspace root + exclude patterns (the same
 *                content the standalone Settings panel had)
 *   Connection — hook bridge install/uninstall + socket path
 */
import {
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  Activity,
  Check,
  Copy,
  Download,
  Mail,
  MessageSquare,
  Pause,
  Play,
  RotateCw,
  Square,
  Trash2,
} from "lucide-react";
import {
  projectTraces,
  type SpanRecord,
  type TraceRecord,
} from "@shared/traces";
import {
  evaluateTraceMonitors,
  type TraceMonitorSignal,
} from "@shared/trace-monitors";
import type { Letter, UnitState } from "@shared/events";
import type {
  OrchestrationRun,
  OrchestrationRunStatus,
} from "@shared/orchestration";
import {
  defaultBudgetForTemplate,
  FIX_THEN_TEST_TEMPLATE_ID,
  ORCHESTRATION_TEMPLATES,
  PARALLEL_COMPARISON_TEMPLATE_ID,
  PROVIDER_HANDOFF_TEMPLATE_ID,
  type OrchestrationTemplateId,
} from "@shared/orchestration-templates";
import { resolveSessionCapabilities } from "@shared/session-capabilities";
import { useStore } from "../../store";
import { themeFor, themeLabel } from "../../game/realm-worlds";
import { seedVisualQaState } from "../../dev/visual-qa-seed";
import { usePanels } from "./panel-store";
import { SettingsPanelBody } from "./SettingsPanelBody";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/primitives/Tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/primitives/Select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../components/primitives/AlertDialog";
import { Button } from "../components/kit/Button";
import { Code } from "../components/kit/Code";
import { EmptyState } from "../components/kit/EmptyState";
import { Field } from "../components/kit/Field";
import { Skeleton } from "../components/kit/Skeleton";
import { Textarea } from "../components/kit/Textarea";
import { RenownBadge, type RenownTier } from "../RenownBadge";
import { cn } from "@/lib/cn";
import type { HooksStatus, PermissionRule } from "@shared/schemas";

type TabKey =
  | "overview"
  | "observatory"
  | "runs"
  | "settings"
  | "connection"
  | "demos";

const DEMO_FIXTURES = [
  {
    label: "Summon",
    items: [
      { id: "summon-vaelen", label: "Summon Vaelen (purple)" },
      { id: "summon-selene", label: "Summon Selene (pink)" },
      { id: "summon-ryder", label: "Summon Ryder (orange)" },
      { id: "summon-lyris", label: "Summon Lyris (cyan)" },
      { id: "summon-all", label: "Summon all 4 wielders" },
    ],
  },
  {
    label: "Flows",
    items: [
      { id: "demo", label: "All 4 tools (claude / cursor / codex / gemini)" },
      { id: "cursor-turn", label: "Cursor · multi-tool turn" },
      { id: "codex-shell", label: "Codex · shell" },
      { id: "codex-inputs", label: "Codex · answer letters" },
      { id: "codex-decline-only-inputs", label: "Codex · decline-only asks" },
      { id: "claude-question", label: "Claude · question letter" },
      { id: "gemini-turn", label: "Gemini · search + write" },
      { id: "subagent", label: "Claude · subagent (Link aura)" },
      { id: "combat", label: "Combat · riftling raid" },
      { id: "stress", label: "Stress · 30 events" },
      { id: "permission", label: "Permission · approval letter" },
    ],
  },
  {
    label: "Visual QA",
    items: [{ id: "visual-qa-board", label: "RTS board · all states" }],
  },
] as const;

const RUN_TEMPLATE_OPTIONS: OrchestrationTemplateId[] = [
  PROVIDER_HANDOFF_TEMPLATE_ID,
  PARALLEL_COMPARISON_TEMPLATE_ID,
  FIX_THEN_TEST_TEMPLATE_ID,
];

const DEFAULT_HANDOFF_PROMPT =
  "Review the selected session. Identify risks, missed tests, and next actions.";
const DEFAULT_COMPARISON_PROMPT =
  "Compare approaches for the current task. Call out tradeoffs and recommended next steps.";
const DEFAULT_FIX_TASK_PROMPT = "Implement the selected task.";
const DEFAULT_VERIFICATION_COMMAND = "bun run test";

type RunTarget = {
  unitId: string;
  sessionId: string;
  tool: UnitState["tool"];
  cwd: string;
  status: UnitState["status"];
  displayName: string;
};

type DraftRunContext = {
  selectedTarget: RunTarget | null;
  comparisonTargets: RunTarget[];
  handoffPrompt: string;
  comparisonPrompt: string;
  taskPrompt: string;
  verificationCommand: string;
};

function targetPayload(target: RunTarget): Record<string, unknown> {
  return {
    unitId: target.unitId,
    sessionId: target.sessionId,
    tool: target.tool,
    cwd: target.cwd,
    status: target.status,
  };
}

function targetLabel(target: RunTarget): string {
  return `${target.displayName} · ${target.tool} · ${target.status}`;
}

function traceIdForTarget(target: RunTarget): string {
  return `trace:${target.tool}:${target.sessionId}`;
}

function targetsForUnits(units: Record<string, UnitState>): RunTarget[] {
  return Object.values(units)
    .filter((unit) => {
      if (!unit.sessionId || !unit.cwd) return false;
      const capabilities = resolveSessionCapabilities({
        tool: unit.tool,
        spawnedHere: unit.spawnedHere,
        status: unit.status,
      });
      return capabilities.controls.send.available;
    })
    .sort(
      (a, b) =>
        (b.spawnedAt ?? b.lastActivity) - (a.spawnedAt ?? a.lastActivity) ||
        a.displayName.localeCompare(b.displayName)
    )
    .map((unit) => ({
      unitId: unit.id,
      sessionId: unit.sessionId,
      tool: unit.tool,
      cwd: unit.cwd,
      status: unit.status,
      displayName: unit.displayName,
    }));
}

type RunLinkTarget = {
  unitId?: string;
  sessionId: string;
  tool?: string;
  traceId?: string;
  unit?: UnitState;
};

function recordParam(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function stringRecordValue(
  record: Record<string, unknown> | null | undefined,
  key: string
): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value ? value : undefined;
}

function runLinkTargets(
  run: OrchestrationRun,
  units: Record<string, UnitState>
): RunLinkTarget[] {
  const targets: RunLinkTarget[] = [];
  for (const session of run.providerSessions) {
    targets.push({
      unitId: session.unitId,
      sessionId: session.sessionId,
      tool: session.tool,
      traceId: session.traceId,
    });
  }
  const params = run.params ?? {};
  const directSessionId = stringRecordValue(params, "sessionId");
  if (directSessionId) {
    targets.push({
      unitId: stringRecordValue(params, "unitId"),
      sessionId: directSessionId,
      tool: stringRecordValue(params, "tool"),
      traceId: stringRecordValue(params, "traceId"),
    });
  }
  const target = targetFromRecord(recordParam(params.target));
  if (target) targets.push(target);
  if (Array.isArray(params.providerTargets)) {
    for (const item of params.providerTargets) {
      const providerTarget = targetFromRecord(recordParam(item));
      if (providerTarget) targets.push(providerTarget);
    }
  }

  const bySession = new Map<string, RunLinkTarget>();
  for (const target of targets) {
    const unit =
      (target.unitId ? units[target.unitId] : undefined) ??
      units[target.sessionId] ??
      Object.values(units).find(
        (candidate) => candidate.sessionId === target.sessionId
      );
    const key = `${target.tool ?? unit?.tool ?? "provider"}:${
      target.sessionId
    }`;
    if (!bySession.has(key)) bySession.set(key, { ...target, unit });
  }
  return Array.from(bySession.values());
}

function targetFromRecord(
  record: Record<string, unknown> | null
): RunLinkTarget | null {
  const sessionId = stringRecordValue(record, "sessionId");
  if (!sessionId) return null;
  const tool = stringRecordValue(record, "tool");
  return {
    unitId: stringRecordValue(record, "unitId"),
    sessionId,
    tool,
    traceId: tool ? traceIdForProvider(tool, sessionId) : undefined,
  };
}

function traceIdForProvider(tool: string, sessionId: string): string {
  return `trace:${tool}:${sessionId}`;
}

function runTraceIds(
  run: OrchestrationRun,
  targets: RunLinkTarget[]
): string[] {
  return Array.from(
    new Set([
      ...run.traceIds,
      ...targets
        .map(
          (target) =>
            target.traceId ??
            (target.tool
              ? traceIdForProvider(target.tool, target.sessionId)
              : undefined)
        )
        .filter((value): value is string => Boolean(value)),
    ])
  );
}

function runLetterCount(run: OrchestrationRun, targets: RunLinkTarget[]) {
  const sessionIds = new Set(targets.map((target) => target.sessionId));
  const requestIds = new Set([
    ...run.permissionRequestIds,
    ...run.userInputRequestIds,
  ]);
  return (letter: Letter) => {
    if (letter.sessionId && sessionIds.has(letter.sessionId)) return true;
    return letter.actions.some((entry) => {
      const action = entry.action;
      return "requestId" in action && requestIds.has(action.requestId);
    });
  };
}

function draftRunParams(
  templateId: OrchestrationTemplateId,
  context: DraftRunContext
): Record<string, unknown> | null {
  switch (templateId) {
    case PROVIDER_HANDOFF_TEMPLATE_ID: {
      if (!context.selectedTarget) return null;
      return {
        target: targetPayload(context.selectedTarget),
        sourceTraceId: traceIdForTarget(context.selectedTarget),
        handoffPrompt: context.handoffPrompt.trim(),
      };
    }
    case PARALLEL_COMPARISON_TEMPLATE_ID: {
      if (context.comparisonTargets.length === 0) return null;
      return {
        providerTargets: context.comparisonTargets.map(targetPayload),
        comparisonPrompt: context.comparisonPrompt.trim(),
      };
    }
    case FIX_THEN_TEST_TEMPLATE_ID: {
      if (!context.selectedTarget) return null;
      return {
        target: targetPayload(context.selectedTarget),
        taskPrompt: context.taskPrompt.trim(),
        verificationCommand: context.verificationCommand.trim(),
      };
    }
    case "standing-order":
      return {};
  }
}

function draftRunUnavailableReason(
  templateId: OrchestrationTemplateId,
  context: DraftRunContext
): string {
  if (
    (templateId === PROVIDER_HANDOFF_TEMPLATE_ID ||
      templateId === FIX_THEN_TEST_TEMPLATE_ID) &&
    !context.selectedTarget
  ) {
    return "No send-capable target session.";
  }
  if (
    templateId === PARALLEL_COMPARISON_TEMPLATE_ID &&
    context.comparisonTargets.length === 0
  ) {
    return "No send-capable provider sessions.";
  }
  if (
    templateId === PROVIDER_HANDOFF_TEMPLATE_ID &&
    !context.handoffPrompt.trim()
  ) {
    return "Handoff prompt is required.";
  }
  if (
    templateId === PARALLEL_COMPARISON_TEMPLATE_ID &&
    !context.comparisonPrompt.trim()
  ) {
    return "Comparison prompt is required.";
  }
  if (templateId === FIX_THEN_TEST_TEMPLATE_ID) {
    if (!context.taskPrompt.trim()) return "Task prompt is required.";
    if (!context.verificationCommand.trim()) {
      return "Verification command is required.";
    }
  }
  return "";
}

type KingdomTabProps = ComponentProps<"div">;

function KingdomTab({ className, ...props }: KingdomTabProps) {
  return (
    <div
      className={cn(
        "flex max-h-[calc(80vh-100px)] flex-col gap-4 overflow-y-auto px-4 py-3.5",
        className
      )}
      {...props}
    />
  );
}

type KingdomSectionProps = ComponentProps<"section"> & {
  count?: number;
  danger?: boolean;
  title: ReactNode;
};

function KingdomSection({
  children,
  className,
  count,
  danger,
  title,
  ...props
}: KingdomSectionProps) {
  return (
    <section
      className={cn(
        "flex flex-col gap-1.5",
        danger &&
          "mt-2 rounded-md border border-[#ff5a3c]/30 bg-[#ff5a3c]/[0.04] p-3",
        className
      )}
      {...props}
    >
      <h3
        className={cn(
          "m-0 text-[11px] font-bold tracking-[0.8px] uppercase",
          danger ? "text-[#ff7a3c]" : "text-accent"
        )}
      >
        {title}
        {typeof count === "number" && (
          <span className="text-muted ml-1.5 text-[10px] font-medium tracking-normal">
            {count}
          </span>
        )}
      </h3>
      {children}
    </section>
  );
}

function KingdomEmpty({
  className,
  ...props
}: ComponentProps<typeof EmptyState>) {
  return (
    <EmptyState
      className={cn("min-h-0 rounded-sm px-2.5 py-2.5 text-[11px]", className)}
      {...props}
    />
  );
}

function KingdomFooterNote({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "text-muted mt-1.5 mb-0 text-[10.5px] leading-[1.4] italic",
        className
      )}
      {...props}
    />
  );
}

function KingdomKv({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="grid grid-cols-[80px_1fr] items-baseline gap-2.5 py-1 text-[11px]">
      <span className="text-muted text-[10px] tracking-[0.5px] uppercase">
        {label}
      </span>
      <div className="text-text min-w-0 break-words">{children}</div>
    </div>
  );
}

function KingdomStat({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="bg-surface-2/55 flex flex-col items-start gap-0.5 rounded-md border border-white/[0.06] px-2.5 py-2">
      <span className="text-accent-alt text-lg leading-[1.1] font-bold tabular-nums">
        {value}
      </span>
      <span className="text-muted text-[10px] tracking-[0.5px] uppercase">
        {label}
      </span>
    </div>
  );
}

const KINGDOM_LIST_CLASS = "m-0 flex list-none flex-col gap-0.5 p-0";
const KINGDOM_LIST_ITEM_CLASS =
  "grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 rounded-sm bg-surface-2/40 px-2 py-1 text-[11px]";
const KINGDOM_LIST_PRIMARY_CLASS =
  "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] text-text";
const KINGDOM_LIST_SECONDARY_CLASS = "text-[10px] text-muted";
const KINGDOM_LIST_META_CLASS = "font-mono text-[10px] tabular-nums text-muted";

function fmtAbsoluteDate(ts: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function fmtRelDays(ts: number): string {
  if (!ts) return "—";
  const days = Math.max(0, Math.floor((Date.now() - ts) / 86400_000));
  return days === 0 ? "today" : `${days}d ago`;
}

function fmtDuration(ms: number | undefined): string {
  if (ms === undefined) return "active";
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m`;
}

function pluralLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function traceStatusClass(status: TraceRecord["status"]): string {
  if (status === "error") return "text-danger";
  if (status === "completed") return "text-success";
  return "text-warning";
}

function runStatusClass(status: OrchestrationRunStatus): string {
  if (status === "failed") return "text-danger";
  if (status === "completed") return "text-success";
  if (status === "stopped" || status === "paused") return "text-warning";
  return "text-accent-alt";
}

function waitingLabel(span: SpanRecord): string {
  if (span.kind === "permission_wait") return "permission";
  if (span.kind === "user_input_wait") return "input";
  return span.name;
}

function traceDisplayName(trace: TraceRecord): string {
  return `${trace.tool} · ${trace.sessionId.slice(0, 12)}`;
}

function signalClass(signal: TraceMonitorSignal): string {
  return signal.severity === "critical" ? "text-danger" : "text-warning";
}

function exportDay(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function OverviewTab() {
  const persisted = useStore((s) => s.persisted);
  const worlds = useStore((s) => s.worlds);
  const eventCount = useStore((s) => s.eventCount);
  const closeKind = usePanels((s) => s.closeKind);
  const reset = useStore((s) => s.resetKingdom);
  const sessionGlimmer = Object.values(worlds).reduce(
    (sum, w) => sum + (w.glimmer ?? 0),
    0
  );
  const totalGlimmer = Math.max(persisted.totalGlimmerEver, sessionGlimmer);
  const sealedWorlds = Object.values(persisted.worlds)
    .filter((w) => w.sealedAt)
    .sort((a, b) => (b.sealedAt ?? 0) - (a.sealedAt ?? 0))
    .slice(0, 8);
  const topWielders = Object.entries(persisted.wielders)
    .map(([identity, w]) => {
      const score = w.visits + w.seals * 3 - w.falls * 2;
      const tier: RenownTier =
        score >= 24
          ? "Hero"
          : score >= 12
            ? "Veteran"
            : score >= 4
              ? "Apprentice"
              : "New";
      const stars =
        score >= 24 ? "★★★" : score >= 12 ? "★★" : score >= 4 ? "★" : "";
      return {
        identity,
        tool: w.tool,
        repoRoot: w.repoRoot,
        score,
        tier,
        stars,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const resetKingdom = async () => {
    await reset();
    closeKind("kingdom");
  };

  return (
    <KingdomTab>
      <div className="grid grid-cols-4 gap-2">
        <KingdomStat label="sealed" value={sealedWorlds.length} />
        <KingdomStat label="✧ glimmer" value={totalGlimmer.toLocaleString()} />
        <KingdomStat label="events" value={eventCount} />
        <KingdomStat
          value={
            persisted.kingdomFoundedAt
              ? fmtRelDays(persisted.kingdomFoundedAt)
              : "today"
          }
          label={
            persisted.kingdomFoundedAt
              ? `since ${fmtAbsoluteDate(persisted.kingdomFoundedAt)}`
              : "founded today"
          }
        />
      </div>

      <KingdomSection title="Sealed worlds" count={sealedWorlds.length}>
        {sealedWorlds.length === 0 ? (
          <KingdomEmpty>No realms sealed yet.</KingdomEmpty>
        ) : (
          <ul className={KINGDOM_LIST_CLASS}>
            {sealedWorlds.map((w) => {
              const theme = themeFor(w.repoRoot.split("/").pop() ?? w.repoRoot);
              const repo = w.repoRoot.split("/").slice(-2).join("/");
              return (
                <li key={w.repoRoot} className={KINGDOM_LIST_ITEM_CLASS}>
                  <span className="text-accent-alt">✦</span>
                  <span className={KINGDOM_LIST_PRIMARY_CLASS}>{repo}</span>
                  <span className={KINGDOM_LIST_SECONDARY_CLASS}>
                    {themeLabel(theme)}
                  </span>
                  <span className={KINGDOM_LIST_META_CLASS}>
                    {fmtRelDays(w.sealedAt ?? 0)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </KingdomSection>

      <KingdomSection title="Top wielders by Renown">
        {topWielders.length === 0 ? (
          <KingdomEmpty>No wielders yet.</KingdomEmpty>
        ) : (
          <ul className={KINGDOM_LIST_CLASS}>
            {topWielders.map((w) => {
              const repo = w.repoRoot.split("/").slice(-2).join("/");
              return (
                <li key={w.identity} className={KINGDOM_LIST_ITEM_CLASS}>
                  <RenownBadge tier={w.tier} stars={w.stars} />
                  <span className={KINGDOM_LIST_PRIMARY_CLASS}>{w.tool}</span>
                  <span className={KINGDOM_LIST_SECONDARY_CLASS}>{repo}</span>
                  <span className={KINGDOM_LIST_META_CLASS}>{w.score} pts</span>
                </li>
              );
            })}
          </ul>
        )}
      </KingdomSection>

      <KingdomSection title="Danger zone" danger>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="danger">
              Reset kingdom
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset the kingdom?</AlertDialogTitle>
              <AlertDialogDescription>
                Lifetime stats, sealed-realm history, and Renown all clear.
                Active sessions are not killed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void resetKingdom()}>
                Reset kingdom
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <KingdomFooterNote>
          Drops persisted state in{" "}
          <Code>~/Library/Application Support/realmkeeper/state.json</Code>.
          Active sessions stay running.
        </KingdomFooterNote>
      </KingdomSection>
    </KingdomTab>
  );
}

function ObservatoryTab() {
  const events = useStore((s) => s.events);
  const units = useStore((s) => s.units);
  const openDrawerTab = usePanels((s) => s.openDrawerTab);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportResult, setExportResult] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const traces = useMemo(
    () => projectTraces(events).sort((a, b) => b.lastEventAt - a.lastEventAt),
    [events]
  );
  const signals = useMemo(() => evaluateTraceMonitors(traces), [traces]);
  const waiting = traces
    .flatMap((trace) =>
      trace.spans
        .filter(
          (span) =>
            span.status === "active" &&
            (span.kind === "permission_wait" || span.kind === "user_input_wait")
        )
        .map((span) => ({ trace, span }))
    )
    .slice(0, 6);
  const recentErrors = traces
    .flatMap((trace) =>
      trace.spans
        .filter((span) => span.status === "error")
        .map((span) => ({ trace, span }))
    )
    .sort((a, b) => b.span.startTime - a.span.startTime)
    .slice(0, 6);
  const activeCount = traces.filter(
    (trace) => trace.status === "active"
  ).length;
  const completedCount = traces.filter(
    (trace) => trace.status === "completed"
  ).length;
  const errorCount = traces.filter((trace) => trace.status === "error").length;
  const day = exportDay(traces[0]?.lastEventAt ?? Date.now());

  const openTrace = (trace: TraceRecord) => {
    const unit = units[trace.sessionId];
    if (unit) openDrawerTab(unit.id);
  };

  const exportCurrentDay = async () => {
    if (exportBusy) return;
    setExportBusy(true);
    setExportResult(null);
    setExportError(null);
    try {
      const result = await safeIpc(() => window.rw.exportTraces({ day }));
      if (!result) {
        setExportError("Export unavailable.");
        return;
      }
      setExportResult(
        `${result.traceCount} traces · ${result.spanCount} spans · ${result.path}`
      );
    } finally {
      setExportBusy(false);
    }
  };

  return (
    <KingdomTab>
      <div className="grid grid-cols-4 gap-2">
        <KingdomStat label="traces" value={traces.length} />
        <KingdomStat label="active" value={activeCount} />
        <KingdomStat label="signals" value={signals.length} />
        <KingdomStat label="errors" value={errorCount} />
      </div>

      <KingdomSection title="Trace export">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => void exportCurrentDay()}
            disabled={exportBusy}
          >
            <Download className="size-3.5" />
            {exportBusy ? "Exporting..." : "Export today"}
          </Button>
          <Code>{day}</Code>
        </div>
        {exportResult ? (
          <KingdomFooterNote>{exportResult}</KingdomFooterNote>
        ) : null}
        {exportError ? (
          <KingdomFooterNote>{exportError}</KingdomFooterNote>
        ) : null}
      </KingdomSection>

      <KingdomSection title="Monitor signals" count={signals.length}>
        {signals.length === 0 ? (
          <KingdomEmpty>No monitor signals.</KingdomEmpty>
        ) : (
          <ul className={KINGDOM_LIST_CLASS}>
            {signals.slice(0, 6).map((signal) => (
              <li key={signal.id} className={KINGDOM_LIST_ITEM_CLASS}>
                <span className={signalClass(signal)}>
                  {signal.severity === "critical" ? "×" : "!"}
                </span>
                <span className={KINGDOM_LIST_PRIMARY_CLASS}>
                  {signal.title}
                </span>
                <span className={KINGDOM_LIST_SECONDARY_CLASS}>
                  {signal.detail}
                </span>
                <span className={KINGDOM_LIST_META_CLASS}>
                  {fmtDuration(signal.durationMs)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </KingdomSection>

      <KingdomSection title="Active waits" count={waiting.length}>
        {waiting.length === 0 ? (
          <KingdomEmpty>No active waits.</KingdomEmpty>
        ) : (
          <ul className={KINGDOM_LIST_CLASS}>
            {waiting.map(({ trace, span }) => (
              <li key={span.spanId} className={KINGDOM_LIST_ITEM_CLASS}>
                <span className="text-warning">!</span>
                <span className={KINGDOM_LIST_PRIMARY_CLASS}>
                  {traceDisplayName(trace)}
                </span>
                <span className={KINGDOM_LIST_SECONDARY_CLASS}>
                  {waitingLabel(span)}
                </span>
                <span className={KINGDOM_LIST_META_CLASS}>
                  {fmtDuration(trace.lastEventAt - span.startTime)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </KingdomSection>

      <KingdomSection title="Recent errors" count={recentErrors.length}>
        {recentErrors.length === 0 ? (
          <KingdomEmpty>
            No trace errors in the current event window.
          </KingdomEmpty>
        ) : (
          <ul className={KINGDOM_LIST_CLASS}>
            {recentErrors.map(({ trace, span }) => (
              <li key={span.spanId} className={KINGDOM_LIST_ITEM_CLASS}>
                <span className="text-danger">×</span>
                <span className={KINGDOM_LIST_PRIMARY_CLASS}>
                  {traceDisplayName(trace)}
                </span>
                <span className={KINGDOM_LIST_SECONDARY_CLASS}>
                  {span.content?.summary ?? span.name}
                </span>
                <span className={KINGDOM_LIST_META_CLASS}>
                  {fmtDuration(trace.lastEventAt - span.startTime)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </KingdomSection>

      <KingdomSection title="Trace sessions" count={traces.length}>
        {traces.length === 0 ? (
          <KingdomEmpty>No traces yet.</KingdomEmpty>
        ) : (
          <ul className={KINGDOM_LIST_CLASS}>
            {traces.slice(0, 10).map((trace) => {
              const unit = units[trace.sessionId];
              const body = (
                <>
                  <span className={traceStatusClass(trace.status)}>●</span>
                  <span className={KINGDOM_LIST_PRIMARY_CLASS}>
                    {unit?.displayName ?? traceDisplayName(trace)}
                  </span>
                  <span className={KINGDOM_LIST_SECONDARY_CLASS}>
                    {trace.tool} · {trace.spans.length} spans · {trace.status}
                  </span>
                  <span className={KINGDOM_LIST_META_CLASS}>
                    {fmtDuration(trace.lastEventAt - trace.startedAt)}
                  </span>
                </>
              );
              return unit ? (
                <li key={trace.traceId}>
                  <button
                    type="button"
                    className={cn(
                      KINGDOM_LIST_ITEM_CLASS,
                      "hover:bg-accent-alt/[0.08] w-full cursor-pointer border-0 text-left"
                    )}
                    onClick={() => openTrace(trace)}
                  >
                    {body}
                  </button>
                </li>
              ) : (
                <li key={trace.traceId} className={KINGDOM_LIST_ITEM_CLASS}>
                  {body}
                </li>
              );
            })}
          </ul>
        )}
      </KingdomSection>

      <KingdomFooterNote>
        Completed traces: {completedCount}. Error traces: {errorCount}.
      </KingdomFooterNote>
    </KingdomTab>
  );
}

function RunsTab({ onOpenObservatory }: { onOpenObservatory: () => void }) {
  const orchestrationRuns = useStore((s) => s.orchestrationRuns);
  const missing = useStore((s) => s.orchestrationRunsMissing);
  const units = useStore((s) => s.units);
  const letters = useStore((s) => s.letters);
  const refreshOrchestrationRuns = useStore((s) => s.refreshOrchestrationRuns);
  const openDrawerTab = usePanels((s) => s.openDrawerTab);
  const focusAlerts = usePanels((s) => s.focusAlerts);
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedTargetUnitId, setSelectedTargetUnitId] = useState("");
  const [handoffPrompt, setHandoffPrompt] = useState(DEFAULT_HANDOFF_PROMPT);
  const [comparisonPrompt, setComparisonPrompt] = useState(
    DEFAULT_COMPARISON_PROMPT
  );
  const [taskPrompt, setTaskPrompt] = useState(DEFAULT_FIX_TASK_PROMPT);
  const [verificationCommand, setVerificationCommand] = useState(
    DEFAULT_VERIFICATION_COMMAND
  );
  const runs = useMemo(
    () =>
      Object.values(orchestrationRuns).sort(
        (a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt
      ),
    [orchestrationRuns]
  );
  const runTargets = useMemo(() => targetsForUnits(units), [units]);
  const selectedTarget =
    runTargets.find((target) => target.unitId === selectedTargetUnitId) ??
    runTargets[0] ??
    null;

  useEffect(() => {
    if (!runTargets.length) {
      if (selectedTargetUnitId) setSelectedTargetUnitId("");
      return;
    }
    if (!runTargets.some((target) => target.unitId === selectedTargetUnitId)) {
      setSelectedTargetUnitId(runTargets[0].unitId);
    }
  }, [runTargets, selectedTargetUnitId]);

  useEffect(() => {
    void refreshOrchestrationRuns();
  }, [refreshOrchestrationRuns]);

  const replaceRun = (run: OrchestrationRun) => {
    useStore.getState().upsertOrchestrationRun(run);
  };

  const controlRun = async (
    run: OrchestrationRun,
    action: "start" | "pause" | "resume" | "stop"
  ) => {
    const key = `${run.id}:${action}`;
    if (busy) return;
    setBusy(key);
    try {
      const result = await safeIpc(() =>
        window.rw.controlOrchestrationRun({
          runId: run.id,
          action,
          reason:
            action === "pause"
              ? "Paused from Run Board."
              : action === "stop"
                ? "Stopped from Run Board."
                : undefined,
        })
      );
      if (result) replaceRun(result);
      else await refreshOrchestrationRuns();
    } finally {
      setBusy(null);
    }
  };

  const createRun = async (templateId: OrchestrationTemplateId) => {
    const key = `create:${templateId}`;
    if (busy) return;
    const context: DraftRunContext = {
      selectedTarget,
      comparisonTargets: runTargets,
      handoffPrompt,
      comparisonPrompt,
      taskPrompt,
      verificationCommand,
    };
    const params = draftRunParams(templateId, context);
    if (!params) return;
    setBusy(key);
    try {
      const template = ORCHESTRATION_TEMPLATES[templateId];
      const result = await safeIpc(() =>
        window.rw.createOrchestrationRun({
          template: template.id,
          title: `${template.title} draft`,
          params,
          budget: defaultBudgetForTemplate(template.id),
          status: "queued",
        })
      );
      if (result) replaceRun(result);
      else await refreshOrchestrationRuns();
    } finally {
      setBusy(null);
    }
  };

  const openRunSession = (targets: RunLinkTarget[]) => {
    const unit = targets.find((target) => target.unit)?.unit;
    if (unit) openDrawerTab(unit.id);
  };

  const openRunTrace = (targets: RunLinkTarget[]) => {
    openRunSession(targets);
    onOpenObservatory();
  };

  const activeCount = runs.filter((run) => run.status === "running").length;
  const pausedCount = runs.filter((run) => run.status === "paused").length;
  const terminalCount = runs.filter((run) =>
    ["completed", "failed", "stopped"].includes(run.status)
  ).length;
  const draftContext: DraftRunContext = {
    selectedTarget,
    comparisonTargets: runTargets,
    handoffPrompt,
    comparisonPrompt,
    taskPrompt,
    verificationCommand,
  };

  if (missing) return <PreloadRestartHint title="Run board" />;

  return (
    <KingdomTab>
      <div className="grid grid-cols-4 gap-2">
        <KingdomStat label="runs" value={runs.length} />
        <KingdomStat label="running" value={activeCount} />
        <KingdomStat label="paused" value={pausedCount} />
        <KingdomStat label="closed" value={terminalCount} />
      </div>

      <KingdomSection title="New run">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(160px,0.8fr)_1fr_1fr_0.8fr]">
          <Field label="Target">
            <Select
              value={selectedTarget?.unitId ?? ""}
              onValueChange={setSelectedTargetUnitId}
              disabled={runTargets.length === 0}
            >
              <SelectTrigger aria-label="Run template target">
                <SelectValue
                  placeholder={
                    runTargets.length === 0 ? "No send-capable sessions" : ""
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {runTargets.map((target) => (
                  <SelectItem key={target.unitId} value={target.unitId}>
                    {targetLabel(target)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Handoff prompt">
            <Textarea
              className="min-h-[66px] text-[11px]"
              value={handoffPrompt}
              onChange={(event) => setHandoffPrompt(event.target.value)}
            />
          </Field>
          <Field label="Comparison prompt">
            <Textarea
              className="min-h-[66px] text-[11px]"
              value={comparisonPrompt}
              onChange={(event) => setComparisonPrompt(event.target.value)}
            />
          </Field>
          <Field label="Fix/test">
            <Textarea
              className="min-h-[40px] text-[11px]"
              value={taskPrompt}
              onChange={(event) => setTaskPrompt(event.target.value)}
            />
            <input
              className="border-line bg-surface-2 text-text focus-visible:border-accent mt-1 min-h-8 w-full rounded-sm border px-3 py-1.5 font-mono text-[11px] shadow-sm focus:outline-none"
              value={verificationCommand}
              onChange={(event) => setVerificationCommand(event.target.value)}
              aria-label="Verification command"
            />
          </Field>
        </div>
        <KingdomFooterNote>
          Comparison uses {runTargets.length} send-capable session
          {runTargets.length === 1 ? "" : "s"}.
        </KingdomFooterNote>
        <div className="grid grid-cols-1 gap-1.5 md:grid-cols-3">
          {RUN_TEMPLATE_OPTIONS.map((templateId) => {
            const template = ORCHESTRATION_TEMPLATES[templateId];
            const unavailableReason = draftRunUnavailableReason(
              template.id,
              draftContext
            );
            return (
              <Button
                key={template.id}
                type="button"
                className="min-h-[44px] justify-start px-2.5 py-2 text-left text-[11px]"
                disabled={busy !== null || !!unavailableReason}
                onClick={() => void createRun(template.id)}
                aria-label={`Create ${template.title} run`}
                title={unavailableReason || undefined}
              >
                <Play className="size-3" />
                <span className="min-w-0">
                  <span className="block truncate">{template.title}</span>
                  <span className="text-muted block truncate font-mono text-[10px]">
                    {unavailableReason || template.id}
                  </span>
                </span>
              </Button>
            );
          })}
        </div>
      </KingdomSection>

      <KingdomSection title="Run board" count={runs.length}>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            className="min-h-0 px-2 py-1 text-[10px]"
            onClick={() => void refreshOrchestrationRuns()}
          >
            <RotateCw className="size-3" />
            Refresh
          </Button>
        </div>
        {runs.length === 0 ? (
          <KingdomEmpty>No orchestration runs yet.</KingdomEmpty>
        ) : (
          <ul className={KINGDOM_LIST_CLASS}>
            {runs.map((run) => {
              const targets = runLinkTargets(run, units);
              const primaryTarget = targets.find((target) => target.unit);
              const traceIds = runTraceIds(run, targets);
              const letterCount = letters.filter(
                runLetterCount(run, targets)
              ).length;
              return (
                <li
                  key={run.id}
                  className="bg-surface-2/40 grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-sm px-2 py-1 text-[11px]"
                >
                  <span className={runStatusClass(run.status)}>●</span>
                  <span className="min-w-0">
                    <span className={KINGDOM_LIST_PRIMARY_CLASS}>
                      {run.title}
                    </span>
                    <span className="text-muted mt-0.5 flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 font-mono text-[10px]">
                      <span>{run.template}</span>
                      <span>{run.status}</span>
                      <span>{run.steps.length} steps</span>
                      <span>{fmtDuration(run.updatedAt - run.createdAt)}</span>
                      {traceIds.length > 0 ? (
                        <span>{pluralLabel(traceIds.length, "trace")}</span>
                      ) : null}
                      {letterCount > 0 ? (
                        <span>{pluralLabel(letterCount, "letter")}</span>
                      ) : null}
                    </span>
                    {run.pauseReason || run.failureReason ? (
                      <span className="text-muted mt-0.5 block truncate text-[10px]">
                        {run.pauseReason ?? run.failureReason}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex flex-wrap items-center justify-end gap-1">
                    {primaryTarget?.unit ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="min-h-0 px-2 py-1 text-[10px]"
                        onClick={() => openRunSession(targets)}
                        aria-label={`Open session for run ${run.title}`}
                      >
                        <MessageSquare className="size-3" />
                        session
                      </Button>
                    ) : null}
                    {traceIds.length > 0 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="min-h-0 px-2 py-1 text-[10px]"
                        onClick={() => openRunTrace(targets)}
                        aria-label={`Open trace for run ${run.title}`}
                      >
                        <Activity className="size-3" />
                        trace
                      </Button>
                    ) : null}
                    {letterCount > 0 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="min-h-0 px-2 py-1 text-[10px]"
                        onClick={() => focusAlerts()}
                        aria-label={`Open letters for run ${run.title}`}
                      >
                        <Mail className="size-3" />
                        letters
                      </Button>
                    ) : null}
                    {run.status === "queued" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="min-h-0 px-2 py-1 text-[10px]"
                        disabled={busy !== null}
                        onClick={() => void controlRun(run, "start")}
                        aria-label={`Start run ${run.title}`}
                      >
                        <Play className="size-3" />
                        start
                      </Button>
                    ) : null}
                    {run.status === "paused" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="min-h-0 px-2 py-1 text-[10px]"
                        disabled={busy !== null}
                        onClick={() => void controlRun(run, "resume")}
                        aria-label={`Resume run ${run.title}`}
                      >
                        <Play className="size-3" />
                        resume
                      </Button>
                    ) : null}
                    {run.status === "running" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="min-h-0 px-2 py-1 text-[10px]"
                        disabled={busy !== null}
                        onClick={() => void controlRun(run, "pause")}
                        aria-label={`Pause run ${run.title}`}
                      >
                        <Pause className="size-3" />
                        pause
                      </Button>
                    ) : null}
                    {run.status === "running" || run.status === "paused" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="min-h-0 px-2 py-1 text-[10px]"
                        disabled={busy !== null}
                        onClick={() => void controlRun(run, "stop")}
                        aria-label={`Stop run ${run.title}`}
                      >
                        <Square className="size-3" />
                        stop
                      </Button>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </KingdomSection>
    </KingdomTab>
  );
}

type HookBridgeProps = {
  title: string;
  status: HooksStatus | null;
  busy: boolean;
  onToggle: () => void;
  configPathLabel: string;
  description: ReactNode;
  details?: { label: string; value: ReactNode }[];
};

function HookBridgeSection(props: HookBridgeProps) {
  const {
    title,
    status,
    busy,
    onToggle,
    configPathLabel,
    description,
    details = [],
  } = props;
  if (!status) {
    return (
      <KingdomSection title={title}>
        <div
          className="flex flex-col gap-2 py-2"
          role="status"
          aria-label={`Loading ${title} status`}
        >
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-56" />
          <Skeleton className="h-8 w-28" />
        </div>
      </KingdomSection>
    );
  }
  return (
    <KingdomSection title={title}>
      <KingdomKv label="status">
        <strong
          className={cn(
            "font-semibold",
            status.installed ? "text-success" : "text-warning"
          )}
        >
          {status.installed ? "installed · listening" : "not installed"}
        </strong>
      </KingdomKv>
      <KingdomKv label="config">
        <Code>{status.hooksConfigPath ?? configPathLabel}</Code>
      </KingdomKv>
      <KingdomKv label="socket">
        <Code>{status.socketPath}</Code>
      </KingdomKv>
      <KingdomKv label="script">
        <Code>{status.hookScriptPath}</Code>
      </KingdomKv>
      {details.map((detail) => (
        <KingdomKv key={detail.label} label={detail.label}>
          {detail.value}
        </KingdomKv>
      ))}
      <Button
        type="button"
        variant={status.installed ? "danger" : "primary"}
        onClick={onToggle}
        disabled={busy}
      >
        {busy
          ? "Working…"
          : status.installed
            ? "Uninstall hooks"
            : "Install hooks"}
      </Button>
      <KingdomFooterNote>{description}</KingdomFooterNote>
    </KingdomSection>
  );
}

/** Call an optional `window.rw.*` method safely. Returns null if the
 * binding isn't present in the loaded preload (which happens after a
 * preload-shape change without restarting electron — main + preload
 * don't hot-reload, so the renderer can momentarily race ahead).
 * Surfaces an inline restart hint instead of unmounting the panel. */
async function safeIpc<T>(
  fn: (() => Promise<T>) | undefined
): Promise<T | null> {
  if (typeof fn !== "function") return null;
  try {
    return await fn();
  } catch {
    return null;
  }
}

function ConnectionTab() {
  const [claudeStatus, setClaudeStatus] = useState<HooksStatus | null>(null);
  const [cursorStatus, setCursorStatus] = useState<HooksStatus | null>(null);
  const [codexStatus, setCodexStatus] = useState<HooksStatus | null>(null);
  const [geminiStatus, setGeminiStatus] = useState<HooksStatus | null>(null);
  const [permissionRules, setPermissionRules] = useState<PermissionRule[]>([]);
  const [claudeMissing, setClaudeMissing] = useState(false);
  const [cursorMissing, setCursorMissing] = useState(false);
  const [codexMissing, setCodexMissing] = useState(false);
  const [geminiMissing, setGeminiMissing] = useState(false);
  const [permissionRulesMissing, setPermissionRulesMissing] = useState(false);
  const [claudeBusy, setClaudeBusy] = useState(false);
  const [cursorBusy, setCursorBusy] = useState(false);
  const [codexBusy, setCodexBusy] = useState(false);
  const [geminiBusy, setGeminiBusy] = useState(false);

  useEffect(() => {
    void safeIpc(window.rw.hooksStatus?.bind(window.rw)).then((r) => {
      if (r) setClaudeStatus(r);
      else setClaudeMissing(true);
    });
    void safeIpc(window.rw.cursorHooksStatus?.bind(window.rw)).then((r) => {
      if (r) setCursorStatus(r);
      else setCursorMissing(true);
    });
    void safeIpc(window.rw.codexHooksStatus?.bind(window.rw)).then((r) => {
      if (r) setCodexStatus(r);
      else setCodexMissing(true);
    });
    void safeIpc(window.rw.geminiHooksStatus?.bind(window.rw)).then((r) => {
      if (r) setGeminiStatus(r);
      else setGeminiMissing(true);
    });
    void safeIpc(window.rw.listPermissionRules?.bind(window.rw)).then((r) => {
      if (r) setPermissionRules(r);
      else setPermissionRulesMissing(true);
    });
  }, []);

  const removeRule = async (ruleId: string) => {
    const ok = await safeIpc(() => window.rw.removePermissionRule(ruleId));
    if (!ok) return;
    const next = await safeIpc(window.rw.listPermissionRules?.bind(window.rw));
    if (next) setPermissionRules(next);
  };

  const toggleClaude = async () => {
    if (!claudeStatus || claudeBusy) return;
    setClaudeBusy(true);
    try {
      const next = claudeStatus.installed
        ? await window.rw.uninstallHooks()
        : await window.rw.installHooks();
      setClaudeStatus(next);
    } finally {
      setClaudeBusy(false);
    }
  };

  const toggleCursor = async () => {
    if (!cursorStatus || cursorBusy) return;
    setCursorBusy(true);
    try {
      const next = cursorStatus.installed
        ? await window.rw.uninstallCursorHooks()
        : await window.rw.installCursorHooks();
      setCursorStatus(next);
    } finally {
      setCursorBusy(false);
    }
  };

  const toggleCodex = async () => {
    if (!codexStatus || codexBusy) return;
    setCodexBusy(true);
    try {
      const next = codexStatus.installed
        ? await window.rw.uninstallCodexHooks()
        : await window.rw.installCodexHooks();
      setCodexStatus(next);
    } finally {
      setCodexBusy(false);
    }
  };

  const toggleGemini = async () => {
    if (!geminiStatus || geminiBusy) return;
    setGeminiBusy(true);
    try {
      const next = geminiStatus.installed
        ? await window.rw.uninstallGeminiHooks()
        : await window.rw.installGeminiHooks();
      setGeminiStatus(next);
    } finally {
      setGeminiBusy(false);
    }
  };

  return (
    <KingdomTab>
      {claudeMissing ? (
        <PreloadRestartHint title="Claude Code hook bridge" />
      ) : (
        <HookBridgeSection
          title="Claude Code hook bridge"
          status={claudeStatus}
          busy={claudeBusy}
          onToggle={toggleClaude}
          configPathLabel="~/.claude/settings.json"
          details={claudeDetails(claudeStatus)}
          description={
            <>
              Forwards Claude Code tool-call events and gates permission
              requests for any session running on this machine. Entries live in{" "}
              <Code>~/.claude/settings.json</Code>.
            </>
          }
        />
      )}
      {cursorMissing ? (
        <PreloadRestartHint title="Cursor hook bridge" />
      ) : (
        <HookBridgeSection
          title="Cursor hook bridge"
          status={cursorStatus}
          busy={cursorBusy}
          onToggle={toggleCursor}
          configPathLabel="~/.cursor/hooks.json"
          details={cursorDetails(cursorStatus)}
          description={
            <>
              Forwards Cursor agent activity for any chat on this machine.
              Permissions are observation-only — Cursor's allowlist approvalMode
              requires the King to confirm in Cursor's inline UI. Entries live
              in <Code>~/.cursor/hooks.json</Code>.
            </>
          }
        />
      )}
      {codexMissing ? (
        <PreloadRestartHint title="Codex hook bridge" />
      ) : (
        <HookBridgeSection
          title="Codex hook bridge"
          status={codexStatus}
          busy={codexBusy}
          onToggle={toggleCodex}
          configPathLabel="~/.codex/config.toml"
          description={
            <>
              Forwards Codex CLI events and gates permission requests for any
              session on this machine — same architecture as Claude. Managed in
              a marker block at the end of <Code>~/.codex/config.toml</Code>;
              the rest of the file is left untouched.
            </>
          }
        />
      )}
      {geminiMissing ? (
        <PreloadRestartHint title="Gemini hook bridge" />
      ) : (
        <HookBridgeSection
          title="Gemini hook bridge"
          status={geminiStatus}
          busy={geminiBusy}
          onToggle={toggleGemini}
          configPathLabel="~/.gemini/settings.json"
          details={geminiDetails(geminiStatus)}
          description={
            <>
              Forwards Gemini CLI session, prompt, tool, result, and response
              events for any session on this machine. Realmkeeper owns Gemini
              tool approvals via a fail-closed BeforeTool hook and a managed
              user policy that suppresses Gemini's native prompt. Entries live
              in <Code>~/.gemini/settings.json</Code> and{" "}
              <Code>~/.gemini/policies/realmkeeper-managed.toml</Code>.
            </>
          }
        />
      )}
      <PermissionRulesSection
        missing={permissionRulesMissing}
        rules={permissionRules}
        onRemove={removeRule}
      />
    </KingdomTab>
  );
}

function PermissionRulesSection({
  missing,
  onRemove,
  rules,
}: {
  missing: boolean;
  onRemove(ruleId: string): Promise<void>;
  rules: PermissionRule[];
}) {
  if (missing) return <PreloadRestartHint title="Saved permission rules" />;
  return (
    <KingdomSection title="Saved permission rules" count={rules.length}>
      {rules.length === 0 ? (
        <KingdomEmpty>No saved permission rules yet.</KingdomEmpty>
      ) : (
        <div className="border-line/60 overflow-hidden rounded-md border">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="border-line/50 grid grid-cols-[1fr_auto] items-center gap-2 border-b px-2.5 py-2 last:border-b-0"
            >
              <div className="min-w-0">
                <div className="text-text text-[11px] font-semibold break-words">
                  {rule.label}
                </div>
                <div className="text-muted mt-0.5 flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 font-mono text-[9.5px]">
                  <span>{rule.provider}</span>
                  <span>{rule.scope}</span>
                  {rule.repoRoot ? (
                    <span className="max-w-[220px] overflow-hidden text-ellipsis whitespace-nowrap">
                      {rule.repoRoot}
                    </span>
                  ) : null}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="min-h-0 px-2 py-1 text-[10px]"
                onClick={() => void onRemove(rule.id)}
                aria-label={`Remove rule ${rule.label}`}
              >
                <Trash2 size={12} aria-hidden />
                remove
              </Button>
            </div>
          ))}
        </div>
      )}
      <KingdomFooterNote>
        Rules are Realmkeeper-local. They auto-answer matching Claude, Codex,
        and Gemini permission requests before a letter is shown; Cursor remains
        observe-only in allowlist mode.
      </KingdomFooterNote>
    </KingdomSection>
  );
}

function yesNo(value: boolean | undefined): string {
  if (value === undefined) return "unknown";
  return value ? "yes" : "no";
}

function enabledOff(value: boolean | undefined): string {
  if (value === undefined) return "unknown";
  return value ? "on" : "off";
}

function loggedInLabel(value: boolean | undefined): string {
  if (value === undefined) return "unknown";
  return value ? "logged in" : "not logged in";
}

function claudeDetails(status: HooksStatus | null) {
  if (!status) return [];
  return [
    {
      label: "version",
      value: status.cliVersion ? (
        <Code>{status.cliVersion}</Code>
      ) : (
        <span className="text-muted">unavailable</span>
      ),
    },
    {
      label: "auth",
      value: status.authStatus ? (
        <span>
          <Code>{loggedInLabel(status.authStatus.loggedIn)}</Code>
          {status.authStatus.authMethod ? (
            <>
              {" "}
              · <Code>{status.authStatus.authMethod}</Code>
            </>
          ) : null}
          {status.authStatus.apiProvider ? (
            <>
              {" "}
              · <Code>{status.authStatus.apiProvider}</Code>
            </>
          ) : null}
          {status.authStatus.subscriptionType ? (
            <>
              {" "}
              · <Code>{status.authStatus.subscriptionType}</Code>
            </>
          ) : null}
        </span>
      ) : (
        <span className="text-muted">unavailable</span>
      ),
    },
    {
      label: "transcript",
      value: (
        <span>
          <Code>{status.transcriptWatcherPath ?? "~/.claude/projects"}</Code>
          {typeof status.transcriptWatcherPollMs === "number" ? (
            <span className="text-muted">
              {" "}
              · {status.transcriptWatcherPollMs}ms
            </span>
          ) : null}
        </span>
      ),
    },
    {
      label: "rich",
      value: (
        <span>
          hooks{" "}
          <Code>{enabledOff(status.richStreamFlags?.includeHookEvents)}</Code> ·
          partials{" "}
          <Code>
            {enabledOff(status.richStreamFlags?.includePartialMessages)}
          </Code>{" "}
          · suggestions{" "}
          <Code>{enabledOff(status.richStreamFlags?.promptSuggestions)}</Code>
        </span>
      ),
    },
  ];
}

function cursorDetails(status: HooksStatus | null) {
  if (!status) return [];
  return [
    {
      label: "version",
      value: status.cliVersion ? (
        <Code>{status.cliVersion}</Code>
      ) : (
        <span className="text-muted">unavailable</span>
      ),
    },
    {
      label: "auth",
      value: status.authStatus ? (
        <span>
          <Code>{loggedInLabel(status.authStatus.loggedIn)}</Code>
          {status.authStatus.authMethod ? (
            <>
              {" "}
              · <Code>{status.authStatus.authMethod}</Code>
            </>
          ) : null}
        </span>
      ) : (
        <span className="text-muted">unavailable</span>
      ),
    },
    ...(status.authIssue
      ? [
          {
            label: "auth note",
            value: (
              <span className="text-warning">
                {status.authIssue.message}
                {status.authIssue.action ? (
                  <>
                    {" "}
                    <span className="text-muted">
                      {status.authIssue.action}
                    </span>
                  </>
                ) : null}
              </span>
            ),
          },
        ]
      : []),
    {
      label: "spawn",
      value: (
        <span>
          Realmkeeper starts Cursor with <Code>--force</Code> and{" "}
          <Code>--trust</Code>
        </span>
      ),
    },
    {
      label: "permissions",
      value: (
        <span>
          observed IDE asks stay <Code>observe-only</Code>
        </span>
      ),
    },
  ];
}

function GeminiSettingsTemplateButton({ template }: { template?: string }) {
  const [copied, setCopied] = useState(false);
  const [blocked, setBlocked] = useState(false);
  if (!template) return <span className="text-muted">unavailable</span>;

  const copyTemplate = async () => {
    try {
      await navigator.clipboard.writeText(template);
      setCopied(true);
      setBlocked(false);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
      setBlocked(true);
    }
  };

  const Icon = copied ? Check : Copy;

  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="default"
        className="min-h-0 px-2 py-1 text-[10px]"
        onClick={() => void copyTemplate()}
        aria-label="Copy Gemini settings template"
      >
        <Icon aria-hidden className="h-3 w-3" />
        {copied ? "Copied" : "Copy template"}
      </Button>
      {blocked ? (
        <span className="text-warning text-[10px]">clipboard blocked</span>
      ) : (
        <Code>hooksConfig.enabled</Code>
      )}
    </span>
  );
}

function geminiDetails(status: HooksStatus | null) {
  if (!status) return [];
  return [
    {
      label: "version",
      value: status.cliVersion ? (
        <Code>{status.cliVersion}</Code>
      ) : (
        <span className="text-muted">unavailable</span>
      ),
    },
    {
      label: "auth",
      value: status.authStatus ? (
        <span>
          <Code>{status.authStatus.authMethod ?? "unknown"}</Code>
          {status.authStatus.apiProvider ? (
            <>
              {" "}
              · <Code>{status.authStatus.apiProvider}</Code>
            </>
          ) : null}
          {status.authStatus.subscriptionType ? (
            <>
              {" "}
              · <Code>{status.authStatus.subscriptionType}</Code>
            </>
          ) : null}
        </span>
      ) : (
        <span className="text-muted">unavailable</span>
      ),
    },
    ...(status.authIssue
      ? [
          {
            label: "auth note",
            value: (
              <span
                className={cn(
                  status.authIssue.severity === "error"
                    ? "text-danger"
                    : status.authIssue.severity === "warning"
                      ? "text-warning"
                      : "text-muted"
                )}
              >
                {status.authIssue.message}
                {status.authIssue.action ? (
                  <>
                    {" "}
                    <span className="text-muted">
                      {status.authIssue.action}
                    </span>
                  </>
                ) : null}
              </span>
            ),
          },
        ]
      : []),
    {
      label: "hooks",
      value: (
        <strong
          className={cn(
            "font-semibold",
            status.hooksEnabled === false ? "text-warning" : "text-success"
          )}
        >
          {status.hooksEnabled === false ? "disabled globally" : "enabled"}
        </strong>
      ),
    },
    {
      label: "gate",
      value: (
        <span>
          fail-closed <Code>{yesNo(status.failClosedHookInstalled)}</Code> ·
          policy <Code>{yesNo(status.managedPolicyInstalled)}</Code>
        </span>
      ),
    },
    {
      label: "launch",
      value: (
        <span>
          spawned Gemini uses{" "}
          <Code>--approval-mode {status.launchApprovalMode ?? "default"}</Code>
        </span>
      ),
    },
    {
      label: "sessions",
      value: geminiSessionDiagnostics(status),
    },
    {
      label: "template",
      value: (
        <GeminiSettingsTemplateButton template={status.settingsTemplate} />
      ),
    },
  ];
}

function geminiSessionDiagnostics(status: HooksStatus) {
  const diagnostics = status.sessionDiagnostics;
  if (!diagnostics) return <span className="text-muted">not checked</span>;
  if (diagnostics.listSessionsAvailable) {
    return (
      <span>
        <Code>
          {typeof diagnostics.sessionCount === "number"
            ? `${diagnostics.sessionCount} sessions`
            : "available"}
        </Code>{" "}
        through <Code>--list-sessions</Code>
      </span>
    );
  }
  return (
    <span className="text-warning">
      unavailable
      {diagnostics.error ? (
        <>
          {" "}
          <span className="text-muted">{diagnostics.error}</span>
        </>
      ) : null}
    </span>
  );
}

function PreloadRestartHint({ title }: { title: string }) {
  return (
    <KingdomSection title={title}>
      <KingdomEmpty>
        bridge IPC missing — restart <Code>bun run dev</Code> to rebuild the
        preload bundle.
      </KingdomEmpty>
    </KingdomSection>
  );
}

function DemosTab() {
  const selectWorld = useStore((s) => s.selectWorld);
  const fire = (id: string) => {
    if (id === "visual-qa-board") {
      seedVisualQaState();
      return;
    }
    if (id.startsWith("summon-")) {
      // Summon demos land in fresh /tmp worlds; clear any selection
      // so the new world isn't pre-targeted.
      selectWorld(null);
    }
    void window.rw.playFixture({ scenario: id as never });
  };
  return (
    <KingdomTab>
      <KingdomFooterNote className="mt-0">
        Scripted demos for visual + chat + combat iteration. None of these burn
        API tokens — they emit synthetic events.
      </KingdomFooterNote>
      {DEMO_FIXTURES.map((group) => (
        <KingdomSection key={group.label} title={group.label}>
          <div className="grid grid-cols-2 gap-1.5">
            {group.items.map((item) => (
              <Button
                key={item.id}
                type="button"
                className="justify-start px-2.5 py-1.5 text-left text-[11px]"
                onClick={() => fire(item.id)}
              >
                ▶ {item.label}
              </Button>
            ))}
          </div>
        </KingdomSection>
      ))}
    </KingdomTab>
  );
}

export function KingdomPanelBody({ initialTab }: { initialTab?: TabKey }) {
  const [tab, setTab] = useState<TabKey>(initialTab ?? "overview");
  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as TabKey)}
      className="font-ui flex flex-col"
    >
      <TabsList aria-label="kingdom panel">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="observatory">Observatory</TabsTrigger>
        <TabsTrigger value="runs">Runs</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
        <TabsTrigger value="connection">Connection</TabsTrigger>
        <TabsTrigger value="demos">Demos</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <OverviewTab />
      </TabsContent>
      <TabsContent value="observatory">
        <ObservatoryTab />
      </TabsContent>
      <TabsContent value="runs">
        <RunsTab onOpenObservatory={() => setTab("observatory")} />
      </TabsContent>
      <TabsContent value="settings">
        <SettingsPanelBody
          onSaved={() => window.dispatchEvent(new Event("rw:settings-changed"))}
        />
      </TabsContent>
      <TabsContent value="connection">
        <ConnectionTab />
      </TabsContent>
      <TabsContent value="demos">
        <DemosTab />
      </TabsContent>
    </Tabs>
  );
}
