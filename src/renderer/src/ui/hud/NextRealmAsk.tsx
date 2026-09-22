import { useStore } from "../../store";
import { sessionActivity } from "../../game/session-activity";
import { inspectRealmAgent } from "../inspect-realm-agent";

export function NextRealmAsk() {
  const units = useStore((s) => s.units);
  const letters = useStore((s) => s.letters);
  const selected = useStore((s) => s.selectedUnitId);
  const waiting = Object.values(units)
    .filter((unit) => sessionActivity(unit, letters).state === "blocked")
    .sort((a, b) => a.id.localeCompare(b.id));
  return (
    <button
      type="button"
      disabled={!waiting.length}
      className="px-3 py-1 text-[11px] font-semibold text-amber-200 disabled:text-slate-500"
      title="Find the next session waiting for your input; does not approve anything"
      onClick={() => {
        const index = waiting.findIndex((unit) => unit.id === selected);
        const next = waiting[(index + 1) % waiting.length];
        if (next) inspectRealmAgent(next.id, true);
      }}
    >
      {waiting.length ? `Next ask · ${waiting.length}` : "No pending asks"}
    </button>
  );
}
