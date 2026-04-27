import { useStore } from "../store";
import { ROLE_HEX, ROLE_PALETTE } from "../game/units";

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
  if (list.length === 0) return null;

  return (
    <div className="unit-dock">
      <div className="unit-dock-header">
        units · {list.length}
      </div>
      <div className="unit-dock-grid">
        {list.map((u) => {
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
                (isMuted ? " muted" : "")
              }
              onClick={() => selectUnit(isSel ? null : u.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                toggleMute(u.sessionId);
              }}
              title={`${palette.label} · ${u.tool} · ${u.status}\nright-click to ${
                isMuted ? "unmute" : "mute"
              }`}
            >
              <span
                className="unit-tile-portrait"
                style={{ background: ROLE_HEX[u.role] }}
              >
                <span className="unit-tile-tool">{u.tool[0].toUpperCase()}</span>
              </span>
              <div className="unit-tile-bars">
                <div className="bar hp">
                  <div style={{ width: `${u.hp}%` }} />
                </div>
                <div className="bar mp">
                  <div style={{ width: `${u.mp}%` }} />
                </div>
              </div>
              <span className="unit-tile-name">{palette.label}</span>
              {isMuted && <span className="unit-tile-mute-badge">🔇</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
