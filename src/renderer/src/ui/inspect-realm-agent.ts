import { useStore } from "../store";
import { usePanels } from "./floating/panel-store";

/** Navigation only: never sends a prompt, approval, or process command. */
export function inspectRealmAgent(unitId: string, focusWorld = false) {
  const state = useStore.getState();
  const unit = state.units[unitId];
  if (!unit) return;
  state.selectUnit(unitId);
  if (focusWorld) state.setCameraTarget(unit.worldId);
  usePanels.getState().openPanel({
    kind: "wielder",
    key: unitId,
    title: `${unit.displayName} · ${unit.tool}`,
    width: 560,
  });
}
