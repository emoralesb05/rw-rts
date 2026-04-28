import { useStore } from "../store";

export function WorldNav() {
  const worlds = useStore((s) => s.worlds);
  const activeWorldId = useStore((s) => s.activeWorldId);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const selectWorld = useStore((s) => s.selectWorld);
  const list = Object.values(worlds);

  const onThrone = view === "throne" && activeWorldId === null;
  const onGummi = view === "gummi" && activeWorldId === null;

  return (
    <div className="world-nav">
      <button
        className={"btn" + (onThrone ? " primary" : "")}
        onClick={() => {
          setView("throne");
          selectWorld(null);
        }}
        title="home — your throne room"
      >
        ⌬ Throne
      </button>
      <button
        className={"btn" + (onGummi ? " primary" : "")}
        onClick={() => {
          setView("gummi");
          selectWorld(null);
        }}
        title="see all worlds in space"
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
