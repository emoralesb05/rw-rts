/**
 * Floating "✕ N" chip that appears whenever 1+ floating surfaces are
 * open (panels + chat drawer). It renders as a compact danger action
 * inside the KingdomHeader pill; click closes them all. Cmd/Ctrl+Shift+W
 * keyboard shortcut also bound here for global reach.
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

  if (count === 0) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <IconButton
          type="button"
          variant="danger"
          size="md"
          className="rounded-pill border-danger/50 bg-danger/15 text-danger hover:border-danger hover:bg-danger/25 size-7 animate-[close-all-chip-pop_180ms_cubic-bezier(0.34,1.56,0.64,1)] font-mono text-[11px] font-bold tracking-[0.4px] shadow-lg backdrop-blur-sm"
          onClick={closeAll}
          aria-label={`Close all ${count} open panels`}
        >
          {/* Lucide XSquare reads as "close all in container" — sized to
           * fit a 28px circular chip. */}
          <XSquare size={16} strokeWidth={2.25} aria-hidden />
        </IconButton>
      </TooltipTrigger>
      <TooltipContent>close all panels ({count}) — ⌘⇧W</TooltipContent>
    </Tooltip>
  );
}
