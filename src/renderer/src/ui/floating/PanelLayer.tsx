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
import { ChatDrawer } from "./ChatDrawer";

export function PanelLayer() {
  const panels = usePanels((s) => s.panels);
  return (
    <>
      {panels.map((p) => (
        <FloatingPanel key={p.id} panel={p}>
          {p.kind === "wielder" && p.key ? (
            <WielderPanelBody unitId={p.key} />
          ) : p.kind === "settings" ? (
            <SettingsPanelBody
              onSaved={() =>
                window.dispatchEvent(new Event("rw:settings-changed"))
              }
            />
          ) : p.kind === "kingdom" ? (
            <KingdomPanelBody
              initialTab={
                p.data?.initialTab as
                  | "overview"
                  | "settings"
                  | "connection"
                  | "demos"
                  | undefined
              }
            />
          ) : p.kind === "dispatch" ? (
            <DispatchPanelBody />
          ) : null}
        </FloatingPanel>
      ))}
      <ChatDrawer />
    </>
  );
}
