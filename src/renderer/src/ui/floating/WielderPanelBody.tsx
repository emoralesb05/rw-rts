/**
 * Wielder detail body — renders inside a FloatingPanel. Same content
 * the inline TargetPanel had: portrait, name + pills, mood/renown/world,
 * standing orders, full HP/MP/Focus bars, action card.
 *
 * If the unit no longer exists (session ended and was cleaned up), the
 * body shows a stub instead of crashing — the user can close the panel.
 */
import { useEffect } from "react";
import {
  ChevronRight,
  CornerDownRight,
  Heart,
  MapPin,
  MessageSquare,
  Power,
  RotateCw,
} from "lucide-react";
import { usePanels } from "./panel-store";
import { useStore, unitIdentityForUnit } from "../../store";
import { ROLE_HEX, ROLE_PALETTE } from "../../game/units";
import { themeFor, themeLabel } from "../../game/realm-worlds";
import { classifyArchetype, ARCHETYPE_TITLE } from "../role-archetype";
import { AgentToolBadge } from "../AgentToolBadge";
import { ArchetypeChip } from "../ArchetypeChip";
import { RenownBadge, type RenownTier } from "../RenownBadge";
import { Badge } from "../components/kit/Badge";
import { Bar } from "../components/kit/Bar";
import { Button } from "../components/kit/Button";
import { EmptyState } from "../components/kit/EmptyState";
import { TooltipHint } from "../components/kit/TooltipHint";
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
import { cn } from "@/lib/cn";
import type { UnitState, WielderStats } from "@shared/events";

function moodFor(unit: UnitState): string {
  if (unit.status === "fallen") return "fallen";
  if (unit.status === "complete") return "complete";
  if (unit.hp < 25) return "desperate";
  if (unit.auraState) return "triumphant";
  if (unit.status === "casting" || unit.status === "working") return "focused";
  if (unit.hp < 60) return "fatigued";
  return "eager";
}

function renownFor(stats: WielderStats | undefined): {
  tier: RenownTier;
  stars: string;
  score: number;
} {
  if (!stats) return { tier: "New", stars: "", score: 0 };
  const score = stats.visits + stats.seals * 3 - stats.falls * 2;
  if (score >= 24) return { tier: "Hero", stars: "★★★", score };
  if (score >= 12) return { tier: "Veteran", stars: "★★", score };
  if (score >= 4) return { tier: "Apprentice", stars: "★", score };
  return { tier: "New", stars: "", score };
}

function timeAgo(ts: number): string {
  const ms = Date.now() - ts;
  if (ms < 30_000) return "just now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

type Props = {
  unitId: string;
};

export function WielderPanelBody({ unitId }: Props) {
  const unit = useStore((s) => s.units[unitId]);
  const worlds = useStore((s) => s.worlds);
  const events = useStore((s) => s.events);
  const standingOrders = useStore((s) => s.standingOrders);
  const persistedWielders = useStore((s) => s.persisted.wielders);
  const selectWorld = useStore((s) => s.selectWorld);
  const comfort = useStore((s) => s.comfort);
  const haltStandingOrder = useStore((s) => s.haltStandingOrder);
  const setPanelSize = usePanels((s) => s.setSize);
  const openDrawerTab = usePanels((s) => s.openDrawerTab);
  const archetype = unit ? classifyArchetype(unit.id, events) : "roamer";

  // Status panel is content-driven; reset any height a previous body
  // may have set so a re-opened panel sits at its natural height.
  useEffect(() => {
    setPanelSize(`wielder:${unitId}`, { width: 560, height: null });
  }, [unitId, setPanelSize]);

  if (!unit) {
    return (
      <EmptyState className="m-3 min-h-0 border border-dashed border-white/10 bg-transparent">
        This wielder is no longer active.
      </EmptyState>
    );
  }

  const palette = ROLE_PALETTE[unit.role];
  const activeOrders = Object.values(standingOrders).filter(
    (o) => o.unitId === unit.id && o.status === "active"
  );
  const renown = renownFor(persistedWielders[unitIdentityForUnit(unit)]);
  const world = worlds[unit.worldId];
  const worldLabel = world?.label ?? "—";
  const themeName = world ? themeLabel(themeFor(world.id)) : "—";
  const hpPct = Math.max(0, Math.min(100, unit.hp));
  const mpPct = Math.max(0, Math.min(100, unit.mp));
  const focusPct = unit.auraState ? 100 : 35;
  const ghosted = unit.status === "complete" || unit.status === "fallen";
  const canComfort = !ghosted && unit.hp < 100 && (world?.glimmer ?? 0) >= 50;

  return (
    <div className={cn("flex flex-col gap-2.5 p-3", ghosted && "opacity-50")}>
      <div className="flex items-start gap-3">
        <TooltipHint label={`${unit.displayName} — ${palette.faction}`}>
          <div
            className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/10"
            style={{ background: ROLE_HEX[unit.role] }}
          >
            <img
              className="size-full object-cover [image-rendering:pixelated]"
              src={`/sprites/rw-default/${unit.role}.png`}
              alt=""
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        </TooltipHint>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-text text-sm font-bold tracking-[0.3px]">
              {unit.displayName}
            </span>
            <AgentToolBadge tool={unit.tool} className="self-start" />
            <TooltipHint
              label={
                unit.spawnedHere
                  ? "spawned by Realmkeeper — you can send prompts here"
                  : "observed terminal session — read-only"
              }
            >
              <Badge
                className={cn(
                  "h-4 min-h-0 self-start px-1 text-[8px]",
                  unit.spawnedHere
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "text-muted border-white/10 bg-white/[0.04]"
                )}
              >
                {unit.spawnedHere ? "spawned" : "observed"}
              </Badge>
            </TooltipHint>
          </div>
          <div className="text-muted flex flex-wrap items-center gap-2 text-[10px]">
            <span className="font-mono tracking-[0.6px] uppercase">
              {moodFor(unit)}
            </span>
            <TooltipHint label={ARCHETYPE_TITLE[archetype]}>
              <ArchetypeChip archetype={archetype} labeled />
            </TooltipHint>
            <TooltipHint label={`Renown: ${renown.score} (${renown.tier})`}>
              <RenownBadge tier={renown.tier} stars={renown.stars} />
            </TooltipHint>
            <TooltipHint label="dive into this world">
              <button
                type="button"
                className="text-accent inline-flex items-center gap-1 border-0 bg-transparent p-0 font-mono text-[10.5px] hover:underline"
                onClick={() => selectWorld(unit.worldId)}
              >
                <ChevronRight size={11} aria-hidden /> {worldLabel} ·{" "}
                {themeName}
              </button>
            </TooltipHint>
          </div>
        </div>
      </div>
      {activeOrders.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {activeOrders.map((o) => (
            <TooltipHint
              key={o.id}
              label={`Standing Order — ${o.iterationsRun}/${o.maxIterations} iterations · click to halt`}
            >
              <button
                type="button"
                className="border-accent-alt/45 bg-accent-alt/[0.08] text-accent-alt hover:bg-accent-alt/[0.18] inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-left font-mono text-[10px] font-semibold hover:border-[#ff5a3c]/60 hover:text-[#ff5a3c]"
                onClick={() => haltStandingOrder(o.id)}
              >
                <RotateCw size={11} aria-hidden />{" "}
                {Math.round(o.intervalMs / 60_000)}m · {o.iterationsRun}/
                {o.maxIterations} · halt
              </button>
            </TooltipHint>
          ))}
        </div>
      )}
      <div className="text-muted grid grid-cols-[18px_1fr_28px] gap-x-1.5 gap-y-1 font-mono text-[9.5px]">
        <div className="contents">
          <span className="tracking-[0.5px] uppercase">HP</span>
          <Bar
            className="mt-0.5 h-1.5 rounded-sm border border-black/50 bg-black/45 shadow-inner"
            tone="hp"
            value={hpPct}
            aria-label={`${unit.displayName} HP`}
          />
          <span className="text-text text-right tabular-nums">
            {Math.round(hpPct)}
          </span>
        </div>
        <div className="contents">
          <span className="tracking-[0.5px] uppercase">MP</span>
          <Bar
            className="mt-0.5 h-1.5 rounded-sm border border-black/50 bg-black/45 shadow-inner"
            tone="mp"
            value={mpPct}
            aria-label={`${unit.displayName} MP`}
          />
          <span className="text-text text-right tabular-nums">
            {Math.round(mpPct)}
          </span>
        </div>
        <div className="contents">
          <span className="tracking-[0.5px] uppercase">FC</span>
          <Bar
            className="mt-0.5 h-1.5 rounded-sm border border-black/50 bg-black/45 shadow-inner"
            tone="focus"
            value={focusPct}
            aria-label={`${unit.displayName} focus`}
          />
          <span className="text-text text-right tabular-nums">
            {unit.auraState ?? "—"}
          </span>
        </div>
      </div>
      <div className="text-muted flex items-center justify-between border-t border-white/[0.07] pt-1.5 font-mono text-[10px]">
        <span>{timeAgo(unit.lastActivity)}</span>
        {unit.lastTool && (
          <TooltipHint label="last tool call">
            <span className="text-accent">
              <CornerDownRight size={11} aria-hidden /> {unit.lastTool}
            </span>
          </TooltipHint>
        )}
      </div>
      <div className="grid grid-cols-5 gap-1">
        <TooltipHint label="open chat in the drawer">
          <span className="inline-flex w-full">
            <Button
              type="button"
              className="h-6 min-h-0 w-full gap-1 rounded-sm px-1 py-0 text-[10px]"
              disabled={ghosted}
              onClick={() => openDrawerTab(unit.id)}
            >
              <MessageSquare size={11} aria-hidden /> chat
            </Button>
          </span>
        </TooltipHint>
        <TooltipHint label="find — pan camera to this wielder's world">
          <span className="inline-flex w-full">
            <Button
              type="button"
              className="h-6 min-h-0 w-full gap-1 rounded-sm px-1 py-0 text-[10px]"
              disabled={ghosted}
              onClick={() => selectWorld(unit.worldId)}
            >
              <MapPin size={11} aria-hidden /> find
            </Button>
          </span>
        </TooltipHint>
        <TooltipHint
          label={
            !unit.spawnedHere
              ? "observed-only — Realmkeeper didn't spawn this wielder"
              : "decree — directive command (file/function/shell)"
          }
        >
          <span className="inline-flex w-full">
            <Button
              type="button"
              className="border-accent-alt/45 bg-accent-alt/[0.06] text-accent-alt hover:border-accent-alt/70 hover:bg-accent-alt/[0.14] h-6 min-h-0 w-full gap-1 rounded-sm px-1 py-0 text-[10px] font-semibold"
              disabled={ghosted || !unit.spawnedHere}
              onClick={() => useStore.getState().openDecreeFor(unit.id)}
            >
              {/* ⚜ stays as the gold royal sigil — RW-themed and intentional. */}
              ⚜ decree
            </Button>
          </span>
        </TooltipHint>
        <TooltipHint
          label={
            canComfort
              ? "restore +30 HP for 50✧"
              : ghosted
                ? "this wielder is no longer active"
                : unit.hp >= 100
                  ? "already at full HP"
                  : "not enough glimmer in this world (need 50✧)"
          }
        >
          <span className="inline-flex w-full">
            <Button
              type="button"
              className="h-6 min-h-0 w-full gap-1 rounded-sm px-1 py-0 text-[10px]"
              disabled={!canComfort}
              onClick={() => comfort(unit.id)}
            >
              <Heart size={11} aria-hidden /> comfort
            </Button>
          </span>
        </TooltipHint>
        <AlertDialog>
          <TooltipHint
            label={
              !unit.spawnedHere
                ? "observed-only — Realmkeeper didn't spawn this wielder, no process to recall"
                : "recall — end this session"
            }
          >
            <span className="inline-flex w-full">
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="danger"
                  className="h-6 min-h-0 w-full gap-1 rounded-sm px-1 py-0 text-[10px]"
                  // Recall calls window.rw.killAgent, which only knows about
                  // processes Realmkeeper spawned. For hook-observed wielders it
                  // would silently no-op; gate the same way decree does so the
                  // button reflects what's actually possible.
                  disabled={ghosted || !unit.spawnedHere}
                >
                  <Power size={11} aria-hidden /> recall
                </Button>
              </AlertDialogTrigger>
            </span>
          </TooltipHint>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Recall {unit.displayName}?</AlertDialogTitle>
              <AlertDialogDescription>
                This ends the spawned session. Hook-observed sessions cannot be
                recalled from Realmkeeper.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  void window.rw.killAgent(unit.id).catch(() => {})
                }
              >
                Recall
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
