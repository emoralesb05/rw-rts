/**
 * Bottom-center world inspector and command surface. Phaser owns the
 * canvas selection affordance; this HUD turns the selected world into
 * actionable RTS-style orders without duplicating the larger panels.
 */
import { Crosshair, Play, ShieldCheck, Swords, X } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStore, type WorldCommandAnchor } from "../../store";
import { themeFor, themeLabel } from "../../game/gummi-worlds";
import { summarizeEvent, shortAgo } from "../event-summary";
import { AgentToolBadge } from "../AgentToolBadge";
import { usePanels } from "../floating/panel-store";
import { Badge } from "../components/kit/Badge";
import { Bar } from "../components/kit/Bar";
import { Button } from "../components/kit/Button";
import { IconButton } from "../components/kit/IconButton";
import { TooltipHint } from "../components/kit/TooltipHint";
import { cn } from "@/lib/cn";
import {
  createWorldCommandBrief,
  type WorldCommandBrief,
  type WorldCommandReadState,
} from "./world-command";
import type { UnitState } from "@shared/events";

const STATE_LABEL: Record<WorldCommandReadState, string> = {
  calm: "calm",
  active: "active",
  hold: "hold",
  pressure: "pressure",
  sealed: "sealed",
};

const STATE_TONE: Record<
  WorldCommandReadState,
  "accent" | "gold" | "warning" | "danger" | "success"
> = {
  calm: "accent",
  active: "gold",
  hold: "warning",
  pressure: "danger",
  sealed: "success",
};

const COMMAND_POPOVER_FALLBACK = { width: 720, height: 220 };
const COMMAND_POPOVER_MARGIN = 12;
const COMMAND_POPOVER_TOP_MARGIN = 42;
const COMMAND_POPOVER_GAP = 18;

type ViewportSize = {
  width: number;
  height: number;
};

type PopoverPlacement = {
  left: number;
  top: number;
  arrowLeft: number;
  side: "above" | "below";
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function currentViewportSize(): ViewportSize {
  if (typeof window === "undefined") {
    return { width: 1400, height: 900 };
  }
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function useViewportSize() {
  const [viewport, setViewport] = useState(currentViewportSize);

  useLayoutEffect(() => {
    const update = () => setViewport(currentViewportSize());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return viewport;
}

function useMeasuredSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState(COMMAND_POPOVER_FALLBACK);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const update = () => {
      const rect = element.getBoundingClientRect();
      const next = {
        width: rect.width || COMMAND_POPOVER_FALLBACK.width,
        height: rect.height || COMMAND_POPOVER_FALLBACK.height,
      };
      setSize((current) =>
        Math.round(current.width) === Math.round(next.width) &&
        Math.round(current.height) === Math.round(next.height)
          ? current
          : next
      );
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  return [ref, size] as const;
}

function createPopoverPlacement(
  anchor: WorldCommandAnchor | null,
  panelSize: ViewportSize,
  viewport: ViewportSize
): PopoverPlacement {
  const width = Math.min(
    panelSize.width || COMMAND_POPOVER_FALLBACK.width,
    Math.max(320, viewport.width - COMMAND_POPOVER_MARGIN * 2)
  );
  const height = panelSize.height || COMMAND_POPOVER_FALLBACK.height;
  const anchorX = anchor?.visible ? anchor.x : viewport.width / 2;
  const anchorY = anchor?.visible
    ? anchor.y
    : viewport.height - COMMAND_POPOVER_GAP;
  const preferredTop =
    anchorY - height - (anchor?.visible ? COMMAND_POPOVER_GAP : 168);
  const canSitAbove = preferredTop >= COMMAND_POPOVER_TOP_MARGIN;
  const side = canSitAbove ? "above" : "below";
  const top = clamp(
    canSitAbove ? preferredTop : anchorY + COMMAND_POPOVER_GAP,
    COMMAND_POPOVER_TOP_MARGIN,
    Math.max(
      COMMAND_POPOVER_TOP_MARGIN,
      viewport.height - height - COMMAND_POPOVER_MARGIN
    )
  );
  const maxLeft = Math.max(COMMAND_POPOVER_MARGIN, viewport.width - width - 12);
  const left = clamp(anchorX - width / 2, COMMAND_POPOVER_MARGIN, maxLeft);

  return {
    left,
    top,
    arrowLeft: clamp(anchorX - left, 28, Math.max(28, width - 28)),
    side,
  };
}

function statusTone(
  status: UnitState["status"]
): "muted" | "accent" | "gold" | "warning" | "danger" | "success" {
  switch (status) {
    case "casting":
      return "warning";
    case "working":
    case "moving":
      return "gold";
    case "complete":
      return "success";
    case "fallen":
      return "danger";
    default:
      return "muted";
  }
}

function commandLabel(unit: UnitState): string {
  if (unit.status === "fallen") return "down";
  if (unit.status === "complete") return "done";
  if (unit.lastTool) return unit.lastTool;
  return unit.status;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-sm border border-white/[0.06] bg-black/20 px-2 py-1">
      <div className="text-muted font-mono text-[9px] tracking-[0.6px] uppercase">
        {label}
      </div>
      <div className="text-text font-mono text-[12px] font-bold tabular-nums">
        {value}
      </div>
    </div>
  );
}

function UnitLine({ unit }: { unit: UnitState }) {
  const selectUnit = useStore((state) => state.selectUnit);
  const openPanel = usePanels((state) => state.openPanel);
  const unitCommandLabel = commandLabel(unit);
  const statusLabel = `${unit.displayName} ${unit.tool} ${unitCommandLabel} ${unit.sessionId.slice(0, 8)}`;
  const openWielder = () => {
    selectUnit(unit.id);
    openPanel({
      kind: "wielder",
      key: unit.id,
      title: `${unit.displayName} · ${unit.tool}`,
      width: 560,
    });
  };

  return (
    <button
      type="button"
      className="hover:border-accent-alt/35 hover:bg-accent-alt/[0.08] focus-visible:border-accent-alt focus-visible:ring-accent-alt/40 flex min-w-0 items-center gap-2 rounded-sm border border-white/[0.06] bg-black/20 px-2 py-1.5 text-left transition-colors focus-visible:ring-1 focus-visible:outline-none"
      onClick={openWielder}
      aria-label={`Open ${statusLabel} status`}
    >
      <img
        className="size-6 shrink-0 rounded-sm object-cover [image-rendering:pixelated]"
        src={`/sprites/kh-default/${unit.role}.png`}
        alt=""
        onError={(event) => {
          (event.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="text-text min-w-0 overflow-hidden text-[11px] font-semibold text-ellipsis whitespace-nowrap">
            {unit.displayName}
          </span>
          <AgentToolBadge tool={unit.tool} className="shrink-0" />
          <Badge
            tone={statusTone(unit.status)}
            className="h-4 min-h-0 max-w-[74px] min-w-0 overflow-hidden px-1 text-[8px] text-ellipsis"
          >
            {unitCommandLabel}
          </Badge>
        </div>
        <div className="mt-1 grid grid-cols-[16px_1fr_16px_1fr] items-center gap-1 font-mono text-[8px]">
          <span className="text-muted">HP</span>
          <Bar
            className="h-1 rounded-sm border border-black/50 bg-black/50"
            tone={unit.status === "fallen" ? "danger" : "hp"}
            value={unit.hp}
          />
          <span className="text-muted">MP</span>
          <Bar
            className="h-1 rounded-sm border border-black/50 bg-black/50"
            tone="mp"
            value={unit.mp}
          />
        </div>
      </div>
    </button>
  );
}

function CommandButton({
  children,
  disabled,
  label,
  onClick,
  variant = "default",
}: {
  children: React.ReactNode;
  disabled?: boolean;
  label: React.ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary" | "gold" | "ghost" | "danger";
}) {
  return (
    <TooltipHint label={label}>
      <span className="inline-flex min-w-0">
        <Button
          type="button"
          className="h-7 min-h-0 w-full min-w-0 justify-start px-2 py-0 text-[10.5px]"
          disabled={disabled}
          onClick={onClick}
          variant={variant}
        >
          {children}
        </Button>
      </span>
    </TooltipHint>
  );
}

function RecentSignals({ brief }: { brief: WorldCommandBrief }) {
  if (brief.recentEvents.length === 0) {
    return (
      <div className="text-muted rounded-sm border border-dashed border-white/10 px-2 py-2 text-[11px]">
        no recent signals
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      {brief.recentEvents.slice(0, 3).map((event, index) => {
        const summary = summarizeEvent(event);
        return (
          <div
            key={`${event.sessionId}-${event.timestamp}-${index}`}
            className="flex min-w-0 items-center gap-2 rounded-sm bg-black/15 px-2 py-1 font-mono text-[10px]"
          >
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                summary.tone === "danger"
                  ? "bg-danger"
                  : summary.tone === "warn"
                    ? "bg-warning"
                    : summary.tone === "ok"
                      ? "bg-accent-alt"
                      : "bg-muted"
              )}
            />
            <span className="text-muted shrink-0">
              {shortAgo(event.timestamp)}
            </span>
            <span className="text-text min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
              {summary.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function WorldCommandHUD() {
  const activeWorldId = useStore((state) => state.activeWorldId);
  const worlds = useStore((state) => state.worlds);
  const units = useStore((state) => state.units);
  const letters = useStore((state) => state.letters);
  const events = useStore((state) => state.events);
  const selectWorld = useStore((state) => state.selectWorld);
  const sealKeyhole = useStore((state) => state.sealKeyhole);
  const openPanel = usePanels((state) => state.openPanel);
  const focusAlerts = usePanels((state) => state.focusAlerts);
  const world = activeWorldId ? worlds[activeWorldId] : undefined;
  const worldCommandAnchor = useStore((state) => state.worldCommandAnchor);
  const viewport = useViewportSize();
  const [panelRef, panelSize] = useMeasuredSize<HTMLElement>();
  const activeAnchor =
    world && worldCommandAnchor?.worldId === world.id
      ? worldCommandAnchor
      : null;
  const placement = useMemo(
    () => createPopoverPlacement(activeAnchor, panelSize, viewport),
    [activeAnchor, panelSize, viewport]
  );
  const hideOffscreen = activeAnchor?.visible === false;
  const brief = useMemo(
    () =>
      world
        ? createWorldCommandBrief({ world, units, letters, events })
        : undefined,
    [events, letters, units, world]
  );

  if (!world || !brief) return null;

  const themeName = themeLabel(themeFor(world.id));

  const openDispatch = () => {
    selectWorld(world.id);
    openPanel({ kind: "dispatch", title: "Dispatch", width: 520 });
  };

  return (
    <section
      ref={panelRef}
      className={cn(
        "z-hud pointer-events-auto absolute flex max-h-[calc(100vh-72px)] w-[min(720px,calc(100vw-32px))] min-w-0 flex-col overflow-visible rounded-md transition-opacity duration-150",
        "border-accent-alt/25 font-ui border bg-[#071025]/72 shadow-[0_18px_56px_rgba(0,0,0,0.46)] backdrop-blur-md",
        hideOffscreen && "pointer-events-none opacity-0"
      )}
      style={{ left: placement.left, top: placement.top }}
      data-placement={placement.side}
      aria-label={`${world.label} world command`}
    >
      {activeAnchor?.visible && (
        <span
          className={cn(
            "bg-panel pointer-events-none absolute size-3 rotate-45 border-white/[0.07]",
            placement.side === "above"
              ? "bottom-[-7px] border-r border-b"
              : "top-[-7px] border-t border-l"
          )}
          style={{ left: placement.arrowLeft - 6 }}
          aria-hidden="true"
        />
      )}
      <header className="bg-accent-alt/[0.05] flex min-w-0 items-start gap-2 border-b border-white/[0.07] px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <Badge
              tone={STATE_TONE[brief.readState]}
              className="h-4 min-h-0 px-1.5 text-[8.5px]"
            >
              {STATE_LABEL[brief.readState]}
            </Badge>
            <span className="text-text min-w-0 overflow-hidden text-[13px] font-bold text-ellipsis whitespace-nowrap">
              {world.label}
            </span>
            <span className="text-muted hidden shrink-0 font-mono text-[10px] sm:inline">
              {themeName}
            </span>
          </div>
          <p className="text-muted mt-1 line-clamp-2 text-[11px] leading-relaxed">
            {brief.objective}
          </p>
        </div>
        <TooltipHint label="close world command">
          <IconButton
            type="button"
            variant="ghost"
            size="sm"
            className="mt-0.5"
            onClick={() => selectWorld(null)}
            aria-label="Close world command"
          >
            <X size={13} aria-hidden />
          </IconButton>
        </TooltipHint>
      </header>

      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(300px,1fr)] gap-2 p-2.5 max-lg:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="grid grid-cols-4 gap-1.5">
            <Metric label="wielders" value={brief.unitCounts.live} />
            <Metric label="heartless" value={world.heartless.length} />
            <Metric label="munny" value={world.munny} />
            <Metric label="pressure" value={`${brief.pressureScore}%`} />
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <CommandButton
              label="Pan the Star Chart camera to this world"
              onClick={() => selectWorld(world.id)}
            >
              <Crosshair size={12} aria-hidden /> focus
            </CommandButton>
            <CommandButton
              label="Open dispatch to send another wielder"
              onClick={openDispatch}
              variant="gold"
            >
              <Play size={12} aria-hidden /> dispatch
            </CommandButton>
            <CommandButton
              disabled={!brief.canSeal}
              label={
                brief.canSeal
                  ? "Seal this world's keyhole"
                  : "Clear pressure before sealing"
              }
              onClick={() => sealKeyhole(world.id)}
              variant={brief.canSeal ? "gold" : "default"}
            >
              <ShieldCheck size={12} aria-hidden /> seal
            </CommandButton>
          </div>

          {brief.pendingLetters.length > 0 && (
            <button
              type="button"
              className="border-warning/35 bg-warning/[0.08] text-warning hover:bg-warning/[0.13] flex min-w-0 items-center gap-2 rounded-sm border px-2 py-1.5 text-left text-[11px]"
              onClick={focusAlerts}
            >
              <Swords size={13} aria-hidden />
              <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                {brief.pendingLetters.length} permission ask
                {brief.pendingLetters.length === 1 ? "" : "s"} blocking this
                world
              </span>
            </button>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted font-mono text-[9px] tracking-[0.7px] uppercase">
              mission line
            </span>
          </div>
          <div className="flex max-h-[184px] min-w-0 flex-col gap-1 overflow-y-auto pr-1">
            {brief.worldUnits.length > 0 ? (
              brief.worldUnits.map((unit) => (
                <UnitLine key={unit.id} unit={unit} />
              ))
            ) : (
              <div className="text-muted rounded-sm border border-dashed border-white/10 px-2 py-2 text-[11px]">
                no wielders present
              </div>
            )}
          </div>
          <div className="border-t border-white/[0.07] pt-2">
            <div className="text-muted mb-1 font-mono text-[9px] tracking-[0.7px] uppercase">
              recent signals
            </div>
            <RecentSignals brief={brief} />
          </div>
        </aside>
      </div>
    </section>
  );
}
