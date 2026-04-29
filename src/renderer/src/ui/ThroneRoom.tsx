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
import { useEffect, useMemo, useState } from "react";
import { useStore, unitIdentityFor } from "../store";
import { ROLE_HEX, ROLE_PALETTE } from "../game/units";
import { themeFor, themeLabel } from "../game/gummi-worlds";
import { usePanels } from "./floating/panel-store";
import type { UnitState, AgentTool, Letter, WielderStats } from "@shared/events";

/**
 * Renown — derived from persisted wielder stats per Q12.
 * Formula: visit + seal*3 - fall*2.
 * Tiers: New · Apprentice ★ · Veteran ★★ · Hero ★★★.
 */
function renownFor(stats: WielderStats | undefined): { tier: string; stars: string; score: number } {
  if (!stats) return { tier: "New", stars: "", score: 0 };
  const score = stats.visits + stats.seals * 3 - stats.falls * 2;
  if (score >= 24) return { tier: "Hero", stars: "★★★", score };
  if (score >= 12) return { tier: "Veteran", stars: "★★", score };
  if (score >= 4) return { tier: "Apprentice", stars: "★", score };
  return { tier: "New", stars: "", score };
}

/**
 * Attention scorer (Phase 2B #11). Ranks letters by recency × severity ×
 * wielder-status. The top-scoring letter wins the pinned ATTENTION banner
 * at the top of the side panel.
 *
 * Recency decays linearly over 10 minutes. Severity dominates (critical >>
 * important > notable). HP critical / fallen on the related wielder boosts
 * the score so an old "HP < 25%" letter can outrank a newer notable.
 */
function attentionScore(
  letter: Letter,
  units: Record<string, UnitState>,
  now: number
): number {
  const ageMs = now - letter.createdAt;
  const ageScore = Math.max(0, 1 - ageMs / (10 * 60_000));
  if (ageScore === 0) return 0;
  const sev =
    letter.severity === "critical" ? 100 :
    letter.severity === "important" ? 40 :
    10;
  let unitBoost = 0;
  if (letter.sessionId) {
    const unit = Object.values(units).find((u) => u.sessionId === letter.sessionId);
    if (unit) {
      if (unit.hp < 25) unitBoost += 30;
      if (unit.status === "fallen") unitBoost += 20;
    }
  }
  return ageScore * (sev + unitBoost);
}

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

/** Status icons row — small chips that summarize "what is this wielder
 * up to right now." Uses tight glyphs so 4-5 fit in a tiny strip on
 * the party row.
 */
function StatusIcons({ unit, hasOrder }: { unit: UnitState; hasOrder: boolean }) {
  const icons: { key: string; glyph: string; title: string; cls: string }[] = [];
  if (unit.driveForm) {
    icons.push({
      key: "drive",
      glyph: unit.driveForm === "valor" ? "⚡" : unit.driveForm === "wisdom" ? "✦" : "★",
      title: `${unit.driveForm} form active`,
      cls: `drive-${unit.driveForm}`,
    });
  }
  if (unit.status === "casting" || unit.status === "working") {
    icons.push({ key: "casting", glyph: "◐", title: `${unit.status}…`, cls: "casting" });
  }
  if (hasOrder) {
    icons.push({ key: "order", glyph: "⟲", title: "standing order active", cls: "order" });
  }
  if (unit.hp < 25 && unit.status !== "fallen") {
    icons.push({ key: "low", glyph: "!", title: "HP critical", cls: "danger" });
  }
  if (icons.length === 0) return null;
  return (
    <span className="status-icons">
      {icons.map((i) => (
        <span key={i.key} className={`status-icon status-${i.cls}`} title={i.title}>
          {i.glyph}
        </span>
      ))}
    </span>
  );
}

/** Compact party-list row — tight three-tier layout: portrait, name+pills,
 * dual HP/MP bars + status icons. Click opens (or focuses) a draggable
 * wielder panel; multiple wielder panels can be open at once. */
function PartyRow({ unit }: { unit: UnitState }) {
  const palette = ROLE_PALETTE[unit.role];
  const selectUnit = useStore((s) => s.selectUnit);
  const openPanel = usePanels((s) => s.openPanel);
  const panels = usePanels((s) => s.panels);
  const standingOrders = useStore((s) => s.standingOrders);
  const hasOrder = Object.values(standingOrders).some(
    (o) => o.unitId === unit.id && o.status === "active"
  );
  const hpPct = Math.max(0, Math.min(100, unit.hp));
  const mpPct = Math.max(0, Math.min(100, unit.mp));
  const ghosted = unit.status === "complete" || unit.status === "fallen";
  const hasPanelOpen = panels.some((p) => p.kind === "wielder" && p.key === unit.id);
  return (
    <button
      type="button"
      className={
        "party-row" +
        (ghosted ? " ghosted" : "") +
        (hasPanelOpen ? " selected" : "")
      }
      onClick={() => {
        // Keep selectedUnitId in sync so other surfaces (CommandInput
        // placeholder, etc.) still reflect the most recently focused
        // wielder.
        selectUnit(unit.id);
        openPanel({
          kind: "wielder",
          key: unit.id,
          title: `${unit.displayName} · ${unit.tool}`,
          width: 420,
        });
      }}
      title={`${unit.displayName} · ${palette.faction}`}
    >
      <div
        className="party-row-portrait"
        style={{ background: ROLE_HEX[unit.role] }}
      >
        <img
          src={`/sprites/kh-default/${unit.role}.png`}
          alt=""
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      </div>
      <div className="party-row-body">
        <div className="party-row-line">
          <span className="party-row-name">{unit.displayName}</span>
          <span className={`tool-pill tool-${unit.tool}`}>{TOOL_LABEL[unit.tool]}</span>
          <StatusIcons unit={unit} hasOrder={hasOrder} />
        </div>
        <div className="party-row-bars">
          <div className="bar-mini hp" title={`HP ${Math.round(hpPct)}/100`}>
            <div style={{ width: `${hpPct}%` }} />
          </div>
          <div className="bar-mini mp" title={`MP ${Math.round(mpPct)}/100`}>
            <div style={{ width: `${mpPct}%` }} />
          </div>
        </div>
      </div>
    </button>
  );
}


function LetterCard({ letter }: { letter: Letter }) {
  const applyLetterAction = useStore((s) => s.applyLetterAction);
  const [showReasoning, setShowReasoning] = useState(false);
  const [denyReason, setDenyReason] = useState("");
  // Permission letters carry a permission-deny action — when present we
  // render an inline "deny reason (optional)" field. Allow ignores the
  // text per upstream contract (decision.message is deny-only).
  const isPermissionLetter = letter.actions.some(
    (a) => a.action.kind === "permission-deny"
  );
  return (
    <div className={`throne-letter sev-${letter.severity}`}>
      <div className="throne-letter-head">
        <span className={`throne-letter-tag sev-${letter.severity}`}>
          {letter.severity}
        </span>
        {letter.risk && (
          <span className={`letter-risk-chip risk-${letter.risk}`}>
            {letter.risk === "high" ? "HIGH RISK" :
             letter.risk === "elevated" ? "ELEVATED" :
             "LOW RISK"}
          </span>
        )}
        <span className="throne-letter-time">{timeAgo(letter.createdAt)}</span>
      </div>
      <div className="throne-letter-title">{letter.title}</div>
      {letter.body && (
        <div className="throne-letter-body">{letter.body}</div>
      )}
      {letter.reasoning && (
        <div className="throne-letter-reasoning">
          <button
            type="button"
            className="letter-reasoning-toggle"
            onClick={() => setShowReasoning((v) => !v)}
            title="show what the wielder was thinking right before this ask"
          >
            {showReasoning ? "▲ thinking" : "▼ thinking"}
          </button>
          {showReasoning && (
            <div className="letter-reasoning-body">{letter.reasoning}</div>
          )}
        </div>
      )}
      {isPermissionLetter && (
        <input
          type="text"
          className="letter-deny-reason"
          placeholder="deny reason (optional, shown to Claude)"
          value={denyReason}
          onChange={(e) => setDenyReason(e.target.value)}
          aria-label="Deny reason"
        />
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
            onClick={() => {
              // Inject the typed reason into deny actions only; allow
              // is fast-path with no message slot.
              if (
                a.action.kind === "permission-deny" &&
                denyReason.trim()
              ) {
                applyLetterAction(letter, {
                  ...a.action,
                  message: denyReason.trim(),
                });
              } else {
                applyLetterAction(letter, a.action);
              }
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function AttentionBanner({ letter }: { letter: Letter }) {
  const applyLetterAction = useStore((s) => s.applyLetterAction);
  const setCameraTarget = useStore((s) => s.setCameraTarget);
  const primary = letter.actions[0];
  return (
    <div
      className={`attention-banner sev-${letter.severity}`}
      onClick={() => letter.worldId && setCameraTarget(letter.worldId)}
    >
      <div className="attention-banner-head">
        <span className="attention-banner-eye">◉</span>
        <span className="attention-banner-tag">NEEDS YOU</span>
        {letter.risk && (
          <span className={`letter-risk-chip risk-${letter.risk}`}>
            {letter.risk === "high" ? "HIGH RISK" :
             letter.risk === "elevated" ? "ELEVATED" :
             "LOW RISK"}
          </span>
        )}
        <span className="attention-banner-time">{timeAgo(letter.createdAt)}</span>
      </div>
      <div className="attention-banner-title">{letter.title}</div>
      {letter.body && (
        <div className="attention-banner-body">{letter.body}</div>
      )}
      {primary && (
        <div className="attention-banner-actions">
          <button
            type="button"
            className="attention-banner-act"
            onClick={(e) => {
              e.stopPropagation();
              applyLetterAction(letter, primary.action);
            }}
          >
            {primary.label}
          </button>
        </div>
      )}
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

  // Attention queue: pick the highest-scoring active letter as the
  // pinned "needs you" banner. Re-derived each render; cheap (50 letters
  // max). Only show if the score crosses a threshold so we don't pin
  // stale low-priority noise.
  const attention = useMemo(() => {
    const now = Date.now();
    let best: Letter | null = null;
    let bestScore = 25; // threshold — must beat this to pin
    for (const l of letters) {
      const s = attentionScore(l, units, now);
      if (s > bestScore) {
        bestScore = s;
        best = l;
      }
    }
    return best;
  }, [letters, units]);
  // Stable spawn-order sort: oldest wielder first. spawnedAt was added
  // 2026-04-29 — earlier units may lack it, so fall back to lastActivity
  // (their initial value at creation, before further events drift it).
  const list = Object.values(units).sort(
    (a, b) => (a.spawnedAt ?? a.lastActivity) - (b.spawnedAt ?? b.lastActivity)
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
      <div className="throne-dust" aria-hidden="true" />
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

      {attention && <AttentionBanner letter={attention} />}

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
            <div className="party-list">
              {list.map((u) => (
                <PartyRow key={u.id} unit={u} />
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
