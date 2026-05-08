/**
 * Floating "✕ N" chip that appears whenever 1+ floating surfaces are
 * open. It renders as a compact utility action inside the KingdomHeader
 * pill; click closes them all. Cmd/Ctrl+Shift+W keyboard shortcut also
 * bound here for global reach.
 */
import { useEffect } from "react";
import { XSquare } from "lucide-react";
import { usePanels } from "./floating/panel-store";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./components/primitives/Tooltip";
import { IconButton } from "./components/kit/IconButton";

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

  const visible = count > 0;

  return (
    <div className="relative size-6 shrink-0">
      {visible && (
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted hover:border-danger/60 hover:bg-danger/10 hover:text-danger focus-visible:border-danger/60 focus-visible:text-danger active:border-danger/80 active:bg-danger/15 absolute inset-0 size-6 border-transparent bg-transparent transition-[border-color,background-color,color] duration-150"
              onClick={closeAll}
              aria-label={`Close all ${count} open panels`}
            >
              <XSquare size={14} strokeWidth={2.2} aria-hidden />
            </IconButton>
          </TooltipTrigger>
          <TooltipContent>close all panels ({count}) — ⌘⇧W</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
