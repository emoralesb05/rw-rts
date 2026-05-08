/**
 * Bottom-right HUD: informational letters — sealed keyholes, drive
 * form transitions, finished sessions, stuck-loop hints. Permission
 * letters are filtered OUT (they live in AlertsHUD top-right).
 */
import { Trash2 } from "lucide-react";
import { useStore } from "../../store";
import { Button } from "../../components/kit/Button";
import { EmptyState } from "../../components/kit/EmptyState";
import { HudWidget } from "./HudWidget";
import { LetterCard, isPermissionLetter } from "./LetterCard";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/primitives/Tooltip";

export function LettersHUD() {
  const letters = useStore((s) => s.letters);
  const dismissInformationalLetters = useStore(
    (s) => s.dismissInformationalLetters
  );
  const informational = letters.filter((l) => !isPermissionLetter(l));
  const clearBtn =
    informational.length > 0 ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="danger"
            className="min-h-6 px-2 py-0.5 text-[10px] uppercase tracking-[0.5px]"
            onClick={dismissInformationalLetters}
          >
            <Trash2 size={11} aria-hidden /> clear
          </Button>
        </TooltipTrigger>
        <TooltipContent>Dismiss every letter — permission alerts are kept</TooltipContent>
      </Tooltip>
    ) : null;
  return (
    <HudWidget
      anchor="bottom-right"
      title="Letters"
      count={informational.length}
      headerExtra={clearBtn}
    >
      {informational.length === 0 ? (
        <EmptyState className="min-h-0 bg-transparent px-2 py-3">
          no letters
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-2 overflow-y-auto pr-1">
          {informational.map((l) => (
            <LetterCard key={l.id} letter={l} />
          ))}
        </div>
      )}
    </HudWidget>
  );
}
