import { useStore } from "../store";
import { ROLE_HEX, ROLE_PALETTE } from "../game/units";

export function UnitInspector() {
  const selectedUnitId = useStore((s) => s.selectedUnitId);
  const activeWorldId = useStore((s) => s.activeWorldId);
  const units = useStore((s) => s.units);
  const selectUnit = useStore((s) => s.selectUnit);
  const muted = useStore((s) => s.mutedSessionIds);
  const toggleMute = useStore((s) => s.toggleMute);

  const list = Object.values(units).filter(
    (u) => !activeWorldId || u.worldId === activeWorldId
  );
  const selected = selectedUnitId ? units[selectedUnitId] : null;

  return (
    <div className="section">
      <h3>Units</h3>
      {list.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--muted)" }}>no units yet</div>
      )}
      {list.map((u) => {
        const palette = ROLE_PALETTE[u.role];
        void palette;
        const isSel = u.id === selectedUnitId;
        return (
          <div
            key={u.id}
            className="unit-card"
            onClick={() => selectUnit(isSel ? null : u.id)}
            style={{
              cursor: "pointer",
              borderLeft: `3px solid ${isSel ? "var(--accent)" : "transparent"}`,
              paddingLeft: 8,
              opacity: isSel
                ? 1
                : u.status === "complete" || u.status === "fallen"
                  ? 0.55
                  : 1,
            }}
          >
            <span className="swatch" style={{ background: ROLE_HEX[u.role] }} />
            <div style={{ flex: 1 }}>
              <div className="name">
                {u.displayName}{" "}
                <span className="meta">· {u.tool} · {u.status}</span>
              </div>
              <div className="meta">{u.cwd.split("/").slice(-2).join("/")}</div>
              <div className="bar hp"><div style={{ width: `${u.hp}%` }} /></div>
              <div className="bar mp"><div style={{ width: `${u.mp}%` }} /></div>
            </div>
            <button
              className="unit-mute"
              onClick={(e) => {
                e.stopPropagation();
                toggleMute(u.sessionId);
              }}
              title={
                muted[u.sessionId]
                  ? "unmute — show events from this unit in the chat"
                  : "mute — hide events from this unit in the chat"
              }
            >
              {muted[u.sessionId] ? "🔇" : "🔊"}
            </button>
          </div>
        );
      })}
      {selected && (
        <div style={{ marginTop: 10, fontSize: 11, color: "var(--muted)" }}>
          last tool: {selected.lastTool ?? "—"}
        </div>
      )}
    </div>
  );
}
