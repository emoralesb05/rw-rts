import { useStore } from "../store";

export function WorldNav() {
  const worlds = useStore((s) => s.worlds);
  const activeWorldId = useStore((s) => s.activeWorldId);
  const selectWorld = useStore((s) => s.selectWorld);
  const list = Object.values(worlds);

  return (
    <div className="world-nav">
      <button
        className={"btn" + (activeWorldId === null ? " primary" : "")}
        onClick={() => selectWorld(null)}
      >
        Gummi Map
      </button>
      {list.map((w) => (
        <button
          key={w.id}
          className={"btn" + (activeWorldId === w.id ? " primary" : "")}
          onClick={() => selectWorld(w.id)}
          title={w.path}
        >
          {w.label} ({w.unitIds.length})
        </button>
      ))}
    </div>
  );
}
