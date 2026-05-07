import {
  useEffect,
  useMemo,
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
import { Kbd } from "../components/chrome/Kbd";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../components/primitives/Dialog";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "../components/primitives/Command";
import { Separator } from "../components/primitives/Separator";
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
        setOpen((v) => {
          const next = !v;
          if (!next) setQuery("");
          return next;
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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

  const setPaletteOpen = (next: boolean) => {
    setOpen(next);
    if (!next) setQuery("");
  };

  const runItem = (item: CommandItem) => {
    item.run();
    setPaletteOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setPaletteOpen}>
      <DialogContent
        className={[
          "top-[13vh] w-[min(680px,calc(100vw-32px))] translate-y-0 p-0",
          "max-h-[calc(100vh-120px)] overflow-hidden border-accent/35",
          "bg-surface-1/95 shadow-[0_22px_80px_rgba(0,0,0,0.68),0_0_0_1px_rgba(255,216,107,0.07)]",
        ].join(" ")}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Search wielders, worlds, files, and actions.
        </DialogDescription>
        <Command label="Command palette" loop>
          <div className="flex items-center gap-2.5 px-3.5 py-3 text-accent">
            <Search size={15} aria-hidden />
            <CommandInput
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Search wielders, worlds, files, and actions..."
            />
            <Kbd>esc</Kbd>
          </div>
          <Separator className="bg-white/10" />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            {commands.map((item) => (
              <CommandItem
                key={item.id}
                value={`${item.label} ${item.id}`}
                keywords={[item.detail, item.keywords]}
                onSelect={() => runItem(item)}
              >
                <span className="inline-flex size-7 items-center justify-center rounded-md bg-accent-alt/10 text-accent-alt">
                  {item.icon}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[12.5px] font-bold">
                    {item.label}
                  </span>
                  <span className="truncate text-[11px] text-muted">
                    {item.detail}
                  </span>
                </span>
                {item.id.startsWith("chat:") && (
                  <span className="font-mono text-[10px] text-muted/85">
                    {shortAgo(
                      units[item.id.slice("chat:".length)]?.lastActivity ?? Date.now()
                    )}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
