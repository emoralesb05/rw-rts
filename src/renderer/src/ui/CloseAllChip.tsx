/**
 * Floating "✕ N" chip that appears whenever 1+ floating surfaces are
 * open (panels + chat drawer). Rendered INSIDE KingdomHeader's pill
 * wrapper so its CSS can anchor it to the pill's right edge — it
 * floats next to the pill instead of under it. Click closes them all;
 * Cmd/Ctrl+Shift+W keyboard shortcut also bound here for global reach.
 */
import { useEffect } from "react";
import { XSquare } from "lucide-react";
import { usePanels } from "./floating/panel-store";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../components/primitives/Tooltip";

export function CloseAllChip() {
  const closeAll = usePanels((s) => s.closeAll);
  // Only floating panels are counted. The chat drawer is excluded —
  // it has its own minimize affordance for the "get out of the way"
  // case, and its own ✕ for the rare full-clear case.
  const count = usePanels((s) => s.panels.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && (e.key === "w" || e.key === "W")) {
        e.preventDefault();
        closeAll();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeAll]);

  if (count === 0) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="close-all-chip"
          onClick={closeAll}
          aria-label={`Close all ${count} open panels`}
        >
          {/* Lucide XSquare reads as "close all in container" — sized to
           * fit a 28px circular chip. */}
          <XSquare size={16} strokeWidth={2.25} aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent>close all panels ({count}) — ⌘⇧W</TooltipContent>
    </Tooltip>
  );
}
