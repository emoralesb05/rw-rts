/**
 * Throne Room — the home view. The King at Disney Castle surveys the
 * kingdom: every active wielder as a card, ranked letter feed, kingdom
 * stats, and the dispatch verb at top.
 *
 * Per-wielder verbs (Send word / Comfort / Recall) live on each card.
 * Letters click into the relevant world (cinematic dive). Kingdom-wide
 * stats live in the header. The Phaser ambient castle backdrop is a
 * polish-phase add — for v1 we use a CSS gradient + subtle pattern.
 */
import { useStore } from "../store";
import { ROLE_HEX, ROLE_PALETTE } from "../game/units";
import { themeFor, themeLabel } from "../game/gummi-worlds";
import type { UnitState, AgentTool, Letter } from "@shared/events";

const TOOL_LABEL: Record<AgentTool, string> = {
  claude: "Claude",
  cursor: "Cursor",
  codex: "Codex",
};

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

function moodFor(unit: UnitState): string {
  if (unit.status === "fallen") return "fallen";
  if (unit.status === "complete") return "complete";
  if (unit.hp < 25) return "desperate";
  if (unit.driveForm) return "triumphant";
  if (unit.status === "casting" || unit.status === "working") return "focused";
  if (unit.hp < 60) return "fatigued";
  return "eager";
}

function WielderCard({ unit }: { unit: UnitState }) {
  const palette = ROLE_PALETTE[unit.role];
  const selectWorld = useStore((s) => s.selectWorld);
  const comfort = useStore((s) => s.comfort);
  const worlds = useStore((s) => s.worlds);
  const world = worlds[unit.worldId];
  const worldLabel = world?.label ?? "—";
  const themeName = world ? themeLabel(themeFor(world.id)) : "—";
  const hpPct = Math.max(0, Math.min(100, unit.hp));
  const mpPct = Math.max(0, Math.min(100, unit.mp));
  const focusPct = unit.driveForm ? 100 : 35;
  const ghosted = unit.status === "complete" || unit.status === "fallen";
  const canComfort =
    !ghosted && unit.hp < 100 && (world?.munny ?? 0) >= 50;

  return (
    <div className={"throne-card" + (ghosted ? " ghosted" : "")}>
      <div className="throne-card-head">
        <div
          className="throne-card-portrait"
          style={{ background: ROLE_HEX[unit.role] }}
          title={`${unit.displayName} — ${palette.faction}`}
        >
          <img
            src={`/sprites/kh-default/${unit.role}.png`}
            alt=""
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
        <div className="throne-card-name-row">
          <span className="throne-card-name">{unit.displayName}</span>
          <span className={`tool-pill tool-${unit.tool}`}>
            {TOOL_LABEL[unit.tool]}
          </span>
        </div>
      </div>
      <div className="throne-card-meta">
        <span className="throne-card-mood">{moodFor(unit)}</span>
        <span className="throne-card-world">
          ▸{" "}
          <button
            type="button"
            className="throne-card-world-link"
            onClick={() => selectWorld(unit.worldId)}
            title="dive into this world"
          >
            {worldLabel} · {themeName}
          </button>
        </span>
      </div>
      <div className="throne-card-bars">
        <div className="bar-row">
          <span className="bar-label">HP</span>
          <div className="bar hp">
            <div style={{ width: `${hpPct}%` }} />
          </div>
          <span className="bar-num">{Math.round(hpPct)}</span>
        </div>
        <div className="bar-row">
          <span className="bar-label">MP</span>
          <div className="bar mp">
            <div style={{ width: `${mpPct}%` }} />
          </div>
          <span className="bar-num">{Math.round(mpPct)}</span>
        </div>
        <div className="bar-row">
          <span className="bar-label">FC</span>
          <div className="bar focus">
            <div style={{ width: `${focusPct}%` }} />
          </div>
          <span className="bar-num">{unit.driveForm ?? "—"}</span>
        </div>
      </div>
      <div className="throne-card-foot">
        <span className="throne-card-time">{timeAgo(unit.lastActivity)}</span>
        <div className="throne-card-actions">
          <button
            type="button"
            className="card-verb"
            disabled={ghosted}
            onClick={() => {
              // For v1: dive into the world; CommandInput is the input
              // surface for follow-ups. Inline modal lands in polish.
              selectWorld(unit.worldId);
            }}
            title="follow up — opens the world to send a prompt"
          >
            send word
          </button>
          <button
            type="button"
            className="card-verb"
            disabled={!canComfort}
            onClick={() => comfort(unit.id)}
            title={
              canComfort
                ? "restore +30 HP for 50µ"
                : ghosted
                ? "this wielder is no longer active"
                : unit.hp >= 100
                ? "already at full HP"
                : "not enough munny in this world (need 50µ)"
            }
          >
            ♥ comfort
          </button>
          <button
            type="button"
            className="card-verb destructive"
            disabled={ghosted}
            onClick={() => {
              if (
                confirm(`Recall ${unit.displayName}? This ends the session.`)
              ) {
                void window.kh.killAgent(unit.id).catch(() => {});
              }
            }}
            title="recall — end this session"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}

function LetterCard({ letter }: { letter: Letter }) {
  const applyLetterAction = useStore((s) => s.applyLetterAction);
  return (
    <div className={`throne-letter sev-${letter.severity}`}>
      <div className="throne-letter-head">
        <span className={`throne-letter-tag sev-${letter.severity}`}>
          {letter.severity}
        </span>
        <span className="throne-letter-time">{timeAgo(letter.createdAt)}</span>
      </div>
      <div className="throne-letter-title">{letter.title}</div>
      {letter.body && (
        <div className="throne-letter-body">{letter.body}</div>
      )}
      <div className="throne-letter-actions">
        {letter.actions.map((a, i) => (
          <button
            key={i}
            type="button"
            className={
              "letter-verb" +
              (a.action.kind === "seal"
                ? " primary"
                : a.action.kind === "dismiss"
                ? " ghost"
                : "")
            }
            onClick={() => applyLetterAction(letter, a.action)}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ThroneRoom() {
  // Always rendered as the left-side overlay panel in the unified-map
  // architecture. No view-gate; the panel is a permanent surface.
  const units = useStore((s) => s.units);
  const worlds = useStore((s) => s.worlds);
  const letters = useStore((s) => s.letters);
  const persisted = useStore((s) => s.persisted);
  const list = Object.values(units).sort(
    (a, b) => b.lastActivity - a.lastActivity
  );
  const liveUnits = list.filter(
    (u) => u.status !== "complete" && u.status !== "fallen"
  );
  // Persisted lifetime stats win when present; live deltas top them up.
  const sessionMunny = Object.values(worlds).reduce(
    (sum, w) => sum + (w.munny ?? 0),
    0
  );
  const totalMunny = Math.max(persisted.totalMunnyEver, sessionMunny);
  const sealedLifetime = Object.values(persisted.worlds).filter(
    (w) => w.sealedAt
  ).length;
  const sealedLive = Object.values(worlds).filter(
    (w) => w.alertLevel === "cleared"
  ).length;
  const sealedCount = Math.max(sealedLifetime, sealedLive);

  return (
    <div className="throne-room">
      <header className="throne-header">
        <div className="throne-banner">
          <span className="throne-banner-title">⌬ DISNEY CASTLE</span>
          <span className="throne-banner-sub">throne room of keykeeper</span>
        </div>
        <div className="kingdom-stats">
          <span title="total munny earned across all worlds">
            µ <strong>{totalMunny}</strong>
          </span>
          <span title="sealed keyholes">
            ✦ <strong>{sealedCount}</strong> sealed
          </span>
          <span title="active wielders">
            ◉ <strong>{liveUnits.length}</strong> wielders
          </span>
        </div>
        <button
          type="button"
          className="dispatch-btn"
          onClick={() => {
            // TODO: open a dispatch modal (world/tool/role picker).
            // Was previously routed to the now-removed Gummi Map tab.
          }}
          title="dispatch a wielder — opens picker (TODO)"
        >
          + Dispatch a wielder
        </button>
      </header>

      <div className="throne-body">
        <section className="throne-section throne-wielders">
          <h2 className="throne-section-title">
            Wielders <span className="throne-section-count">· {list.length}</span>
          </h2>
          {list.length === 0 ? (
            <div className="throne-empty">
              The kingdom is quiet. No wielders dispatched yet.
              <br />
              Spawn a Claude / Cursor / Codex agent or run one in any repo
              to begin.
            </div>
          ) : (
            <div className="throne-card-grid">
              {list.map((u) => (
                <WielderCard key={u.id} unit={u} />
              ))}
            </div>
          )}
        </section>

        <section className="throne-section throne-letters">
          <h2 className="throne-section-title">
            Letters{" "}
            <span className="throne-section-count">· {letters.length}</span>
          </h2>
          {letters.length === 0 ? (
            <div className="throne-empty">No letters from your wielders.</div>
          ) : (
            <div className="throne-letter-feed">
              {letters.map((l) => (
                <LetterCard key={l.id} letter={l} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
