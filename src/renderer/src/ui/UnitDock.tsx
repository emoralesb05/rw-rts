import { useEffect, useState } from "react";
import { useStore } from "../store";
import { ROLE_HEX, ROLE_PALETTE } from "../game/units";
import type { AgentTool } from "@shared/events";

const PAGE_SIZE = 6;

const TOOL_LABEL: Record<AgentTool, string> = {
  claude: "Claude",
  cursor: "Cursor",
  codex: "Codex",
};

export function UnitDock() {
  const selectedUnitId = useStore((s) => s.selectedUnitId);
  const activeWorldId = useStore((s) => s.activeWorldId);
  const units = useStore((s) => s.units);
  const selectUnit = useStore((s) => s.selectUnit);
  const muted = useStore((s) => s.mutedSessionIds);
  const toggleMute = useStore((s) => s.toggleMute);

  const list = Object.values(units).filter(
    (u) => !activeWorldId || u.worldId === activeWorldId
  );
  const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const [page, setPage] = useState(0);

  // If the world changes (or units leave), clamp the page so we don't end
  // up on an empty trailing page.
  useEffect(() => {
    if (page >= pageCount) setPage(Math.max(0, pageCount - 1));
  }, [page, pageCount]);

  // Auto-advance to the page containing the currently selected unit, so a
  // unit clicked in the world is always visible in the dock.
  useEffect(() => {
    if (!selectedUnitId) return;
    const idx = list.findIndex((u) => u.id === selectedUnitId);
    if (idx < 0) return;
    const targetPage = Math.floor(idx / PAGE_SIZE);
    if (targetPage !== page) setPage(targetPage);
    // We intentionally only react to selection changes — list length flicker
    // shouldn't drag the user off their current page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUnitId]);

  if (list.length === 0) return null;
  const start = page * PAGE_SIZE;
  const visible = list.slice(start, start + PAGE_SIZE);

  return (
    <div className="unit-dock">
      <div className="unit-dock-header">
        <span>units · {list.length}</span>
        {pageCount > 1 && (
          <span className="unit-dock-pager">
            <button
              type="button"
              className="unit-dock-page-btn"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              aria-label="previous page"
            >
              ‹
            </button>
            <span className="unit-dock-page-label">
              {page + 1}/{pageCount}
            </span>
            <button
              type="button"
              className="unit-dock-page-btn"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={page >= pageCount - 1}
              aria-label="next page"
            >
              ›
            </button>
          </span>
        )}
      </div>
      <div className="unit-dock-grid">
        {visible.map((u) => {
          const palette = ROLE_PALETTE[u.role];
          const isSel = u.id === selectedUnitId;
          const isMuted = !!muted[u.sessionId];
          const ghosted = u.status === "complete" || u.status === "fallen";
          return (
            <button
              key={u.id}
              type="button"
              className={
                "unit-tile" +
                (isSel ? " selected" : "") +
                (ghosted ? " ghosted" : "") +
                (isMuted ? " muted" : "") +
                ` tool-${u.tool}`
              }
              onClick={() => selectUnit(isSel ? null : u.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                toggleMute(u.sessionId);
              }}
              title={`${palette.label} · ${TOOL_LABEL[u.tool]} · ${u.status}\nright-click to ${
                isMuted ? "unmute" : "mute"
              }`}
            >
              <span
                className="unit-tile-portrait"
                style={{ background: ROLE_HEX[u.role] }}
              >
                <span className="unit-tile-tool">{u.tool[0].toUpperCase()}</span>
              </span>
              <span className="unit-tile-name">{palette.label}</span>
              <span className={`unit-tile-tool-pill tool-${u.tool}`}>
                {TOOL_LABEL[u.tool]}
              </span>
              <div className="unit-tile-bars">
                <div className="bar hp">
                  <div style={{ width: `${u.hp}%` }} />
                </div>
                <div className="bar mp">
                  <div style={{ width: `${u.mp}%` }} />
                </div>
              </div>
              {isMuted && <span className="unit-tile-mute-badge">🔇</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
