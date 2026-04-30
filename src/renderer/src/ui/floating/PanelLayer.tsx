/**
 * Renders all currently-open floating panels. Mounted once at the App
 * root so any component can request a panel via the panel-store
 * without thinking about where it lives in the React tree.
 *
 * Adding a new panel kind: add a switch case and a renderer below.
 */
import { usePanels } from "./panel-store";
import { FloatingPanel } from "./FloatingPanel";
import { WielderPanelBody } from "./WielderPanelBody";
import { SettingsPanelBody } from "./SettingsPanelBody";
import { KingdomPanelBody } from "./KingdomPanelBody";
import { DispatchPanelBody } from "./DispatchPanelBody";

export function PanelLayer() {
  const panels = usePanels((s) => s.panels);
  return (
    <>
      {panels.map((p) => (
        <FloatingPanel key={p.id} panel={p}>
          {p.kind === "wielder" && p.key ? (
            <WielderPanelBody
              unitId={p.key}
              initialTab={
                p.data?.initialTab === "messages" ? "messages" : "status"
              }
              initialTabTick={
                typeof p.data?.tick === "number" ? p.data.tick : 0
              }
              scrollToTs={
                typeof p.data?.scrollToTs === "number"
                  ? p.data.scrollToTs
                  : undefined
              }
              scrollToTick={
                typeof p.data?.tick === "number" ? p.data.tick : 0
              }
            />
          ) : p.kind === "settings" ? (
            <SettingsPanelBody onSaved={() => window.dispatchEvent(new Event("kh:settings-changed"))} />
          ) : p.kind === "kingdom" ? (
            <KingdomPanelBody />
          ) : p.kind === "dispatch" ? (
            <DispatchPanelBody />
          ) : null}
        </FloatingPanel>
      ))}
    </>
  );
}
