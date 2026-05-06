import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  FileCode,
  MapPin,
  MessageSquare,
  PanelTop,
  Play,
  Search,
  Settings,
  ShieldAlert,
} from "lucide-react";
import { useStore } from "../store";
import { usePanels } from "./floating/panel-store";
import { summarizeEvent, shortAgo } from "./event-summary";
import type { AgentEvent, UnitState, WorldState } from "@shared/events";

type CommandItem = {
  id: string;
  label: string;
  detail: string;
  keywords: string;
  icon: ReactNode;
  run: () => void;
};

function isLive(unit: UnitState): boolean {
  return unit.status !== "complete" && unit.status !== "fallen";
}

function pathFromInput(ev: AgentEvent): string | null {
  const input = ev.payload.input;
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const raw =
    typeof record.file_path === "string"
      ? record.file_path
      : typeof record.path === "string"
      ? record.path
      : null;
  if (!raw || raw.startsWith("http://") || raw.startsWith("https://")) {
    return null;
  }
  if (raw.startsWith("/")) return raw;
  const base = ev.repoRoot ?? ev.cwd;
  return `${base.replace(/\/$/, "")}/${raw.replace(/^\.\//, "")}`;
}

function basename(path: string): string {
  return path.split("/").filter(Boolean).slice(-1)[0] ?? path;
}

function unitDetail(unit: UnitState, world?: WorldState): string {
  const cwdParts = unit.cwd.split("/").filter(Boolean);
  const worldLabel = world?.label ?? cwdParts[cwdParts.length - 1] ?? unit.cwd;
  return `${unit.tool} · ${unit.status} · ${worldLabel}`;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const units = useStore((s) => s.units);
  const worlds = useStore((s) => s.worlds);
  const letters = useStore((s) => s.letters);
  const events = useStore((s) => s.events);
  const selectWorld = useStore((s) => s.selectWorld);
  const openPanel = usePanels((s) => s.openPanel);
  const openDrawerTab = usePanels((s) => s.openDrawerTab);
  const focusAlerts = usePanels((s) => s.focusAlerts);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    setSelected(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const commands = useMemo<CommandItem[]>(() => {
    const openKingdom = (initialTab?: "overview" | "settings" | "connection" | "demos") =>
      openPanel({
        kind: "kingdom",
        title: "Kingdom",
        width: 520,
        data: initialTab ? { initialTab } : undefined,
      });
    const items: CommandItem[] = [
      {
        id: "dispatch",
        label: "Dispatch a wielder",
        detail: "Spawn Claude, Cursor, Codex, or Gemini into a repo",
        keywords: "spawn dispatch claude cursor codex gemini",
        icon: <Play size={14} aria-hidden />,
        run: () => openPanel({ kind: "dispatch", title: "Dispatch", width: 520 }),
      },
      {
        id: "connection",
        label: "Open connection status",
        detail: "Hook bridge installers, socket paths, provider status",
        keywords: "hooks connection provider bridge claude cursor codex gemini",
        icon: <Settings size={14} aria-hidden />,
        run: () => openKingdom("connection"),
      },
    ];

    const pendingAlerts = letters.filter((l) =>
      l.actions.some(
        (a) =>
          a.action.kind === "permission-allow" ||
          a.action.kind === "permission-deny" ||
          a.action.kind === "permission-observe"
      )
    );
    if (pendingAlerts.length > 0) {
      items.push({
        id: "alerts",
        label: `Focus alerts (${pendingAlerts.length})`,
        detail: "Bring pending permission requests to the top",
        keywords: "alerts permission allow deny requests",
        icon: <ShieldAlert size={14} aria-hidden />,
        run: focusAlerts,
      });
    }

    const sortedUnits = Object.values(units).sort((a, b) => {
      const liveDelta = Number(isLive(b)) - Number(isLive(a));
      return liveDelta || b.lastActivity - a.lastActivity;
    });
    for (const unit of sortedUnits) {
      const world = worlds[unit.worldId];
      const detail = unitDetail(unit, world);
      const key = `${unit.displayName} ${unit.tool} ${unit.status} ${world?.label ?? ""}`;
      items.push(
        {
          id: `chat:${unit.id}`,
          label: `Open ${unit.displayName} chat`,
          detail,
          keywords: `chat message send word ${key}`,
          icon: <MessageSquare size={14} aria-hidden />,
          run: () => openDrawerTab(unit.id),
        },
        {
          id: `find:${unit.id}`,
          label: `Find ${unit.displayName}`,
          detail: world ? `Pan to ${world.label}` : detail,
          keywords: `find pan world map ${key}`,
          icon: <MapPin size={14} aria-hidden />,
          run: () => selectWorld(unit.worldId),
        },
        {
          id: `status:${unit.id}`,
          label: `${unit.displayName} status`,
          detail,
          keywords: `status panel details ${key}`,
          icon: <PanelTop size={14} aria-hidden />,
          run: () =>
            openPanel({
              kind: "wielder",
              key: unit.id,
              title: unit.displayName,
              width: 460,
            }),
        }
      );
    }

    for (const world of Object.values(worlds).sort((a, b) =>
      a.label.localeCompare(b.label)
    )) {
      items.push({
        id: `world:${world.id}`,
        label: `Go to ${world.label}`,
        detail: `${world.alertLevel} · ${world.path}`,
        keywords: `world map pan repo ${world.label} ${world.path} ${world.alertLevel}`,
        icon: <MapPin size={14} aria-hidden />,
        run: () => selectWorld(world.id),
      });
    }

    const seenPaths = new Set<string>();
    for (const ev of events) {
      const path = pathFromInput(ev);
      if (!path || seenPaths.has(path)) continue;
      seenPaths.add(path);
      const summary = summarizeEvent(ev).text;
      items.push({
        id: `file:${path}`,
        label: `Open ${basename(path)}`,
        detail: `${summary} · ${path}`,
        keywords: `file path open ${path} ${summary}`,
        icon: <FileCode size={14} aria-hidden />,
        run: () => void window.kh.openPath(path).catch(() => {}),
      });
      if (seenPaths.size >= 12) break;
    }

    return items;
  }, [events, focusAlerts, letters, openDrawerTab, openPanel, selectWorld, units, worlds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands.slice(0, 14);
    return commands
      .filter((item) =>
        `${item.label} ${item.detail} ${item.keywords}`.toLowerCase().includes(q)
      )
      .slice(0, 14);
  }, [commands, query]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  if (!open) return null;

  const runSelected = () => {
    const item = filtered[selected];
    if (!item) return;
    item.run();
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="command-palette-overlay" onMouseDown={() => setOpen(false)}>
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="command-palette-input-row">
          <Search size={15} aria-hidden />
          <input
            ref={inputRef}
            className="command-palette-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
                return;
              }
              if (e.key === "ArrowDown") {
                e.preventDefault();
                if (filtered.length === 0) return;
                setSelected((i) => Math.min(filtered.length - 1, i + 1));
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                if (filtered.length === 0) return;
                setSelected((i) => Math.max(0, i - 1));
                return;
              }
              if (e.key === "Enter") {
                e.preventDefault();
                runSelected();
              }
            }}
            placeholder="Search wielders, worlds, files, and actions..."
          />
          <span className="command-palette-kbd">esc</span>
        </div>
        <div className="command-palette-list" role="listbox">
          {filtered.length === 0 ? (
            <div className="command-palette-empty">No matches.</div>
          ) : (
            filtered.map((item, i) => (
              <button
                key={item.id}
                type="button"
                className={
                  "command-palette-item" + (i === selected ? " active" : "")
                }
                onMouseEnter={() => setSelected(i)}
                onClick={() => {
                  item.run();
                  setOpen(false);
                  setQuery("");
                }}
                role="option"
                aria-selected={i === selected}
              >
                <span className="command-palette-item-icon">{item.icon}</span>
                <span className="command-palette-item-main">
                  <span className="command-palette-item-label">{item.label}</span>
                  <span className="command-palette-item-detail">{item.detail}</span>
                </span>
                {item.id.startsWith("chat:") && (
                  <span className="command-palette-item-meta">
                    {shortAgo(
                      units[item.id.slice("chat:".length)]?.lastActivity ?? Date.now()
                    )}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
