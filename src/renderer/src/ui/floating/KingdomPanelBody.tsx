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
import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { useStore } from "../../store";
import { themeFor, themeLabel } from "../../game/gummi-worlds";
import { usePanels } from "./panel-store";
import { SettingsPanelBody } from "./SettingsPanelBody";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/primitives/Tabs";
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
} from "../../components/primitives/AlertDialog";
import { Button } from "../../components/kit/Button";
import { Code } from "../../components/kit/Code";
import { EmptyState } from "../../components/kit/EmptyState";
import { Skeleton } from "../../components/kit/Skeleton";
import { RenownBadge, type RenownTier } from "../RenownBadge";
import { cn } from "@/lib/cn";
import type { HooksStatus } from "@shared/schemas";

type TabKey = "overview" | "settings" | "connection" | "demos";

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
      { id: "gemini-turn", label: "Gemini · search + write" },
      { id: "subagent", label: "Claude · subagent (Final drive)" },
      { id: "combat", label: "Combat · heartless raid" },
      { id: "stress", label: "Stress · 30 events" },
      { id: "permission", label: "Permission · approval letter" },
    ],
  },
] as const;

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
          "m-0 text-[11px] font-bold uppercase tracking-[0.8px]",
          danger ? "text-[#ff7a3c]" : "text-accent"
        )}
      >
        {title}
        {typeof count === "number" && (
          <span className="ml-1.5 text-[10px] font-medium tracking-normal text-muted">
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

function KingdomFooterNote({
  className,
  ...props
}: ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "mb-0 mt-1.5 text-[10.5px] italic leading-[1.4] text-muted",
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
      <span className="text-[10px] uppercase tracking-[0.5px] text-muted">
        {label}
      </span>
      <div className="min-w-0 break-words text-text">{children}</div>
    </div>
  );
}

function KingdomStat({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-0.5 rounded-md border border-white/[0.06] bg-surface-2/55 px-2.5 py-2">
      <span className="text-lg font-bold leading-[1.1] text-accent-alt tabular-nums">
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-[0.5px] text-muted">
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

function OverviewTab() {
  const persisted = useStore((s) => s.persisted);
  const worlds = useStore((s) => s.worlds);
  const eventCount = useStore((s) => s.eventCount);
  const closeKind = usePanels((s) => s.closeKind);
  const reset = useStore((s) => s.resetKingdom);
  const sessionMunny = Object.values(worlds).reduce(
    (sum, w) => sum + (w.munny ?? 0),
    0
  );
  const totalMunny = Math.max(persisted.totalMunnyEver, sessionMunny);
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
      return { identity, tool: w.tool, repoRoot: w.repoRoot, score, tier, stars };
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
        <KingdomStat label="µ munny" value={totalMunny.toLocaleString()} />
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
          <KingdomEmpty>No keyholes sealed yet.</KingdomEmpty>
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
                Lifetime stats, sealed-keyhole history, and Renown all clear.
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
          Drops persisted state in <Code>~/Library/Application Support/keykeeper/state.json</Code>.
          Active sessions stay running.
        </KingdomFooterNote>
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
};

function HookBridgeSection(props: HookBridgeProps) {
  const { title, status, busy, onToggle, configPathLabel, description } = props;
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

/** Call an optional `window.kh.*` method safely. Returns null if the
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
  const [claudeMissing, setClaudeMissing] = useState(false);
  const [cursorMissing, setCursorMissing] = useState(false);
  const [codexMissing, setCodexMissing] = useState(false);
  const [geminiMissing, setGeminiMissing] = useState(false);
  const [claudeBusy, setClaudeBusy] = useState(false);
  const [cursorBusy, setCursorBusy] = useState(false);
  const [codexBusy, setCodexBusy] = useState(false);
  const [geminiBusy, setGeminiBusy] = useState(false);

  useEffect(() => {
    void safeIpc(window.kh.hooksStatus?.bind(window.kh)).then((r) => {
      if (r) setClaudeStatus(r);
      else setClaudeMissing(true);
    });
    void safeIpc(window.kh.cursorHooksStatus?.bind(window.kh)).then((r) => {
      if (r) setCursorStatus(r);
      else setCursorMissing(true);
    });
    void safeIpc(window.kh.codexHooksStatus?.bind(window.kh)).then((r) => {
      if (r) setCodexStatus(r);
      else setCodexMissing(true);
    });
    void safeIpc(window.kh.geminiHooksStatus?.bind(window.kh)).then((r) => {
      if (r) setGeminiStatus(r);
      else setGeminiMissing(true);
    });
  }, []);

  const toggleClaude = async () => {
    if (!claudeStatus || claudeBusy) return;
    setClaudeBusy(true);
    try {
      const next = claudeStatus.installed
        ? await window.kh.uninstallHooks()
        : await window.kh.installHooks();
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
        ? await window.kh.uninstallCursorHooks()
        : await window.kh.installCursorHooks();
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
        ? await window.kh.uninstallCodexHooks()
        : await window.kh.installCodexHooks();
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
        ? await window.kh.uninstallGeminiHooks()
        : await window.kh.installGeminiHooks();
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
          description={
            <>
              Forwards Claude Code tool-call events and gates permission
              requests for any session running on this machine. Entries live
              in <Code>~/.claude/settings.json</Code>.
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
          description={
            <>
              Forwards Cursor agent activity for any chat on this machine.
              Permissions are observation-only — Cursor's allowlist
              approvalMode requires the King to confirm in Cursor's inline
              UI. Entries live in <Code>~/.cursor/hooks.json</Code>.
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
              Forwards Codex CLI events and gates permission requests for
              any session on this machine — same architecture as Claude.
              Managed in a marker block at the end of{" "}
              <Code>~/.codex/config.toml</Code>; the rest of the file is
              left untouched.
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
          description={
            <>
              Forwards Gemini CLI session, prompt, tool, result, and response
              events for any session on this machine. Keykeeper owns Gemini
              tool approvals via a fail-closed BeforeTool hook and a managed
              user policy that suppresses Gemini's native prompt. Entries live
              in <Code>~/.gemini/settings.json</Code> and{" "}
              <Code>~/.gemini/policies/keykeeper-managed.toml</Code>.
            </>
          }
        />
      )}
    </KingdomTab>
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
    if (id.startsWith("summon-")) {
      // Summon demos land in fresh /tmp worlds; clear any selection
      // so the new world isn't pre-targeted.
      selectWorld(null);
    }
    void window.kh.playFixture({ scenario: id as never });
  };
  return (
    <KingdomTab>
      <KingdomFooterNote className="mt-0">
        Scripted demos for visual + chat + combat iteration. None of these
        burn API tokens — they emit synthetic events.
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
      className="flex flex-col font-ui"
    >
      <TabsList aria-label="kingdom panel">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
        <TabsTrigger value="connection">Connection</TabsTrigger>
        <TabsTrigger value="demos">Demos</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <OverviewTab />
      </TabsContent>
      <TabsContent value="settings">
        <SettingsPanelBody
          onSaved={() => window.dispatchEvent(new Event("kh:settings-changed"))}
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
