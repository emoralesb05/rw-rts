/**
 * Translucent floating strip at top-center — the de-facto top chrome.
 * Shows kingdom-level info (sealed / wielders / munny / age) plus the
 * two persistent action icons (🔊 mute toggle, ⚙ Kingdom panel).
 *
 * The pill replaced the old topbar; window-drag has moved to a
 * separate invisible strip behind it.
 */
import { useEffect, useState } from "react";
import { Settings, Volume2, VolumeX } from "lucide-react";
import { useStore } from "../../store";
import { isMuted, toggleMuted } from "../../audio/sounds";
import { usePanels } from "../floating/panel-store";
import { CloseAllChip } from "../CloseAllChip";
import type { AgentTool } from "@shared/events";

const PROVIDERS: { tool: AgentTool; label: string; short: string }[] = [
  { tool: "claude", label: "Claude", short: "Cl" },
  { tool: "cursor", label: "Cursor", short: "Cu" },
  { tool: "codex", label: "Codex", short: "Cx" },
];

function fmtDays(foundedAt: number): string {
  const days = Math.max(0, Math.floor((Date.now() - foundedAt) / 86400_000));
  return days === 0 ? "today" : `${days}d`;
}

function fmtAge(ts: number | undefined, now: number): string {
  if (!ts) return "none";
  const sec = Math.max(0, Math.floor((now - ts) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  return `${hr}h`;
}

export function KingdomHeader() {
  const persisted = useStore((s) => s.persisted);
  const worlds = useStore((s) => s.worlds);
  const units = useStore((s) => s.units);
  const events = useStore((s) => s.events);
  const openPanel = usePanels((s) => s.openPanel);
  const [muted, setMuted] = useState(isMuted());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  const liveWielders = Object.values(units).filter(
    (u) => u.status !== "complete" && u.status !== "fallen"
  ).length;
  const sealedLifetime = Object.values(persisted.worlds).filter(
    (w) => w.sealedAt
  ).length;
  const sessionMunny = Object.values(worlds).reduce(
    (sum, w) => sum + (w.munny ?? 0),
    0
  );
  const totalMunny = Math.max(persisted.totalMunnyEver, sessionMunny);
  const providerHealth = PROVIDERS.map((p) => {
    const active = Object.values(units).filter(
      (u) => u.tool === p.tool && u.status !== "complete" && u.status !== "fallen"
    ).length;
    const lastEvent = events.find((ev) => ev.tool === p.tool);
    const ageMs = lastEvent ? now - lastEvent.timestamp : Number.POSITIVE_INFINITY;
    const state =
      active > 0
        ? "active"
        : ageMs < 15 * 60_000
        ? "warm"
        : lastEvent
        ? "idle"
        : "none";
    return {
      ...p,
      active,
      lastAt: lastEvent?.timestamp,
      state,
    };
  });
  return (
    <div className="kingdom-header">
      <span className="kingdom-header-title">⌬ Keykeeper</span>
      <span className="kingdom-header-sep">·</span>
      <span className="kingdom-header-stat" title="sealed keyholes (lifetime)">
        ✦ {sealedLifetime} sealed
      </span>
      <span className="kingdom-header-stat" title="active wielders">
        ⚔ {liveWielders} wielders
      </span>
      <span className="kingdom-header-stat" title="total munny earned">
        µ {totalMunny.toLocaleString()}
      </span>
      <span className="kingdom-header-sep">·</span>
      <span className="kingdom-header-meta">
        founded {fmtDays(persisted.kingdomFoundedAt)} ago
      </span>
      <span className="provider-health-strip" aria-label="provider health">
        {providerHealth.map((p) => (
          <span
            key={p.tool}
            className={`provider-health-chip provider-${p.state}`}
            title={`${p.label}: ${p.active} active · last event ${fmtAge(
              p.lastAt,
              now
            )}`}
          >
            <span className="provider-health-dot" aria-hidden />
            <span className="provider-health-name">{p.short}</span>
            <span className="provider-health-count">{p.active}</span>
            <span className="provider-health-age">{fmtAge(p.lastAt, now)}</span>
          </span>
        ))}
      </span>
      <span className="kingdom-header-actions">
        <button
          type="button"
          className="kingdom-header-icon-btn"
          onClick={() => setMuted(toggleMuted())}
          title={muted ? "unmute" : "mute"}
          aria-label={muted ? "unmute" : "mute"}
        >
          {muted ? <VolumeX size={14} aria-hidden /> : <Volume2 size={14} aria-hidden />}
        </button>
        <button
          type="button"
          className="kingdom-header-icon-btn"
          onClick={() =>
            openPanel({ kind: "kingdom", title: "Kingdom", width: 520 })
          }
          title="Kingdom — overview, settings, connection, demos"
          aria-label="Open Kingdom panel"
        >
          <Settings size={14} aria-hidden />
        </button>
      </span>
      {/* Floating "close all" chip — visually separate (own pill) but
       * absolutely positioned to the pill's right edge so it always
       * sits next to it regardless of pill width. */}
      <CloseAllChip />
    </div>
  );
}
