/**
 * Translucent floating strip at top-center showing kingdom-level info
 * (sealed worlds, wielders, founded date) — like FFXIV's status line.
 * Distinct from the topbar (which holds app controls).
 */
import { useStore } from "../../store";

function fmtDays(foundedAt: number): string {
  const days = Math.max(0, Math.floor((Date.now() - foundedAt) / 86400_000));
  return days === 0 ? "today" : `${days}d`;
}

export function KingdomHeader() {
  const persisted = useStore((s) => s.persisted);
  const worlds = useStore((s) => s.worlds);
  const units = useStore((s) => s.units);
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
  return (
    <div className="kingdom-header">
      <span className="kingdom-header-title">⌬ Disney Castle</span>
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
    </div>
  );
}
