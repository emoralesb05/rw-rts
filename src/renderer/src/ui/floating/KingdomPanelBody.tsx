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
import { useEffect, useState, type ReactNode } from "react";
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
import { Button } from "../../components/chrome/Button";
import { Code } from "../../components/chrome/Code";
import { Skeleton } from "../../components/chrome/Skeleton";
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
      const tier =
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
    <div className="kingdom-tab">
      <div className="kingdom-stats-grid">
        <div className="kingdom-stat">
          <span className="kingdom-stat-num">{sealedWorlds.length}</span>
          <span className="kingdom-stat-label">sealed</span>
        </div>
        <div className="kingdom-stat">
          <span className="kingdom-stat-num">{totalMunny.toLocaleString()}</span>
          <span className="kingdom-stat-label">µ munny</span>
        </div>
        <div className="kingdom-stat">
          <span className="kingdom-stat-num">{eventCount}</span>
          <span className="kingdom-stat-label">events</span>
        </div>
        <div className="kingdom-stat">
          <span className="kingdom-stat-num">
            {persisted.kingdomFoundedAt
              ? fmtRelDays(persisted.kingdomFoundedAt)
              : "today"}
          </span>
          <span className="kingdom-stat-label">
            {persisted.kingdomFoundedAt
              ? `since ${fmtAbsoluteDate(persisted.kingdomFoundedAt)}`
              : "founded today"}
          </span>
        </div>
      </div>

      <section className="kingdom-section">
        <h3 className="kingdom-section-title">
          Sealed worlds <span className="kingdom-section-count">{sealedWorlds.length}</span>
        </h3>
        {sealedWorlds.length === 0 ? (
          <div className="kingdom-empty">No keyholes sealed yet.</div>
        ) : (
          <ul className="kingdom-list">
            {sealedWorlds.map((w) => {
              const theme = themeFor(w.repoRoot.split("/").pop() ?? w.repoRoot);
              const repo = w.repoRoot.split("/").slice(-2).join("/");
              return (
                <li key={w.repoRoot} className="kingdom-list-item">
                  <span className="kingdom-list-icon">✦</span>
                  <span className="kingdom-list-primary">{repo}</span>
                  <span className="kingdom-list-secondary">
                    {themeLabel(theme)}
                  </span>
                  <span className="kingdom-list-meta">
                    {fmtRelDays(w.sealedAt ?? 0)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="kingdom-section">
        <h3 className="kingdom-section-title">
          Top wielders by Renown
        </h3>
        {topWielders.length === 0 ? (
          <div className="kingdom-empty">No wielders yet.</div>
        ) : (
          <ul className="kingdom-list">
            {topWielders.map((w) => {
              const repo = w.repoRoot.split("/").slice(-2).join("/");
              return (
                <li key={w.identity} className="kingdom-list-item">
                  <span
                    className={`throne-card-renown rank-${w.tier.toLowerCase()}`}
                  >
                    {w.stars && <span className="throne-card-renown-stars">{w.stars}</span>}
                    <span className="throne-card-renown-tier">{w.tier}</span>
                  </span>
                  <span className="kingdom-list-primary">{w.tool}</span>
                  <span className="kingdom-list-secondary">{repo}</span>
                  <span className="kingdom-list-meta">{w.score} pts</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="kingdom-section kingdom-danger">
        <h3 className="kingdom-section-title">Danger zone</h3>
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
        <p className="kingdom-footer-note">
          Drops persisted state in <Code>~/Library/Application Support/keykeeper/state.json</Code>.
          Active sessions stay running.
        </p>
      </section>
    </div>
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
      <section className="kingdom-section">
        <h3 className="kingdom-section-title">{title}</h3>
        <div
          className="flex flex-col gap-2 py-2"
          role="status"
          aria-label={`Loading ${title} status`}
        >
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-56" />
          <Skeleton className="h-8 w-28" />
        </div>
      </section>
    );
  }
  return (
    <section className="kingdom-section">
      <h3 className="kingdom-section-title">{title}</h3>
      <div className="kingdom-kv">
        <span>status</span>
        <strong className={status.installed ? "ok" : "warn"}>
          {status.installed ? "installed · listening" : "not installed"}
        </strong>
      </div>
      <div className="kingdom-kv">
        <span>config</span>
        <Code>{status.hooksConfigPath ?? configPathLabel}</Code>
      </div>
      <div className="kingdom-kv">
        <span>socket</span>
        <Code>{status.socketPath}</Code>
      </div>
      <div className="kingdom-kv">
        <span>script</span>
        <Code>{status.hookScriptPath}</Code>
      </div>
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
      <p className="kingdom-footer-note">{description}</p>
    </section>
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
    <div className="kingdom-tab">
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
    </div>
  );
}

function PreloadRestartHint({ title }: { title: string }) {
  return (
    <section className="kingdom-section">
      <h3 className="kingdom-section-title">{title}</h3>
      <div className="kingdom-empty">
        bridge IPC missing — restart <Code>bun run dev</Code> to rebuild the
        preload bundle.
      </div>
    </section>
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
    <div className="kingdom-tab">
      <p className="kingdom-footer-note">
        Scripted demos for visual + chat + combat iteration. None of these
        burn API tokens — they emit synthetic events.
      </p>
      {DEMO_FIXTURES.map((group) => (
        <section key={group.label} className="kingdom-section">
          <h3 className="kingdom-section-title">{group.label}</h3>
          <div className="kingdom-demo-grid">
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
        </section>
      ))}
    </div>
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
      className="kingdom-panel"
    >
      <TabsList className="wielder-panel-tabs" aria-label="kingdom panel">
        <TabsTrigger value="overview" className="wielder-panel-tab">
          Overview
        </TabsTrigger>
        <TabsTrigger value="settings" className="wielder-panel-tab">
          Settings
        </TabsTrigger>
        <TabsTrigger value="connection" className="wielder-panel-tab">
          Connection
        </TabsTrigger>
        <TabsTrigger value="demos" className="wielder-panel-tab">
          Demos
        </TabsTrigger>
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
